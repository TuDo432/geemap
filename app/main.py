from . import cartomap
import csv, hashlib, json, logging, os, struct, threading, time
from typing import Literal
from datetime import date, datetime, timedelta
import ee
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from .db import engine, fixkeys
from . import gee_service as g
from . import spatial                                   # [MỚI] Moran's I, Getis-Ord Gi*
from .indices import INDICES, VIS

log = logging.getLogger("uvicorn.error")
app = FastAPI(title="WebGIS HCMC Monitoring")
app.mount("/static", StaticFiles(directory="static"), name="static")
REGION, THIS_YEAR = "HCM_ROI", date.today().year
JOB = dict(running=False, done=0, total=0, ok=0, msg="", errors=[], run_id=None)

# ---------- tiện ích ----------
def _log(request, action, idx=None, year=None):          # bảng NhatKy_ThaoTac
    try:
        with engine.begin() as c:
            c.execute(text("INSERT INTO NhatKy_ThaoTac(HanhDong,ChiSo_Chon,Nam_Chon,DiaChi_IP) VALUES(:a,:i,:y,:ip)"),
                      dict(a=action, i=idx, y=year, ip=request.client.host if request.client else None))
    except Exception:
        log.exception("Không ghi được NhatKy_ThaoTac")

def _classes(kind):                                       # bảng PhanCap_UHI_Khohan
    with engine.connect() as c:
        rows = c.execute(text("SELECT Nguong_Duoi,Nguong_Tren,Ten_MucDo,Ma_Mau_Hex,Ma_PhanCap FROM PhanCap_UHI_Khohan "
                              "WHERE Loai_Chiso=:k ORDER BY Ma_PhanCap"), dict(k=kind)).all()
    return [dict(lo=r[0], hi=r[1], name=r[2], color=r[3], id=r[4]) for r in rows]

def _klass(classes, v):
    for i, k in enumerate(classes):
        if v < k["hi"] or i == len(classes) - 1:
            return k

def _level(classes, v):
    k = _klass(classes, v)
    return k["name"] if k else None

def _hex(h):
    n = int(h[1:], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]

def color_at(t, pal):
    t = max(0, min(1, t)); k = t * (len(pal) - 1); i = min(int(k), len(pal) - 2); f = k - i
    a, b = _hex(pal[i]), _hex(pal[i + 1])
    return "#%02X%02X%02X" % tuple(round(a[j] + (b[j] - a[j]) * f) for j in range(3))

def _q(sql, **p):
    with engine.connect() as c:
        return [fixkeys(r._mapping) for r in c.execute(text(sql), p)]

def _f(x):                                                # numpy -> float thuần cho psycopg2
    return None if x is None else float(x)


# ---------- bản đồ một năm ----------
@app.get("/api/map")
def map_(request: Request, index: str, year: int = Query(..., ge=2014, le=THIS_YEAR),
         cloud: int = Query(30, ge=0, le=100), classify: bool = False):
    if index not in INDICES:
        raise HTTPException(400, f"Chỉ số không hợp lệ: {index}")
    classes, db_error = [], None
    if classify and index in ("LST", "TVDI"):
        try:
            classes = _classes(index)
        except Exception:
            log.exception("DB error"); db_error = "Không đọc được bảng PhanCap_UHI_Khohan"
    try:
        r = g.map_layer(index, year, cloud, [(k["lo"], k["hi"], k["color"]) for k in classes] or None)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except ee.EEException as e:
        log.exception("GEE error"); raise HTTPException(502, f"Lỗi Google Earth Engine: {e}")
    _log(request, "Xem bản đồ", index, year)
    return {**r, "classes": classes, "db_error": db_error, "spatial": spatial.analyze(r["geojson"])}   # [MỚI] spatial

# ---------- quét chuỗi thời gian -> SQL ----------
MERGE = text("""
INSERT INTO ChiSo_MoiTruong_TheoNam(Nam,LST_TrungBinh,NDVI_TrungBinh,TVDI_TrungBinh,LST_Min,LST_Max,Ma_KhuVuc,Ma_LuotQuet)
VALUES(:nam,:lst,:ndvi,:tvdi,:lmin,:lmax,:kv,:run)
ON CONFLICT (Nam) DO UPDATE SET LST_TrungBinh=EXCLUDED.LST_TrungBinh, NDVI_TrungBinh=EXCLUDED.NDVI_TrungBinh,
     TVDI_TrungBinh=EXCLUDED.TVDI_TrungBinh, LST_Min=EXCLUDED.LST_Min, LST_Max=EXCLUDED.LST_Max,
     Ngay_CapNhat=NOW(), Ma_LuotQuet=EXCLUDED.Ma_LuotQuet""")

def _save_year(run_id, y, d):
    city = d["city"]
    def v(b, k, n):
        x = city[b][k]
        if x is None: raise ValueError(f"Thiếu thống kê {b}.{k}")
        return round(x, n)
    p = dict(nam=y, lst=v("LST", "mean", 2), ndvi=v("NDVI", "mean", 3), tvdi=v("TVDI", "mean", 3),
             lmin=v("LST", "min", 2), lmax=v("LST", "max", 2), run=run_id, kv=REGION)
    imgs = [dict(id=m["properties"]["id"], sat="Landsat " + m["properties"]["sat"].split("_")[-1],
                 d=date.fromisoformat(m["properties"]["date"]), cl=m["properties"].get("cloud"),
                 y=y, kv=REGION) for m in d["meta"]]
    with engine.begin() as c:
        c.execute(MERGE, p)
        c.execute(text("DELETE FROM Anh_VeTinh WHERE Nam_GiamSat=:y AND Ma_KhuVuc=:kv"), dict(y=y, kv=REGION))
        c.execute(text("INSERT INTO Anh_VeTinh(Ma_Anh,Loai_VeTinh,Ngay_ThuNhan,Nam_GiamSat,Mua_GiamSat,TyLe_May,Ma_KhuVuc) "
                       "VALUES(:id,:sat,:d,:y,'Mùa khô',:cl,:kv)"), imgs)

def _save_history(run_id, y, d):          # KetQua_ThongKe (+ trung vị, Q1, Q3) + HeSo_TinhToan (toàn thành phố, theo năm)
    city, e = d["city"], d["edges"]
    rows = [dict(r=run_id, y=y, i=b, m=city[b]["mean"], mn=city[b]["min"], mx=city[b]["max"], sd=city[b]["stdDev"],
                 n=int(city[b]["count"]) if city[b]["count"] is not None else None, na=d["n_images"],
                 md=city[b]["median"], q1=city[b]["p25"], q3=city[b]["p75"]) for b in INDICES]
    he = [("TVDI_a", e["a"], "°C"), ("TVDI_b", e["b"], "°C/NDVI"), ("TVDI_Ts_min", e["tmin"], "°C"),
          ("TVDI_So_Khoang_NDVI", e["bins"], None), ("So_Anh", d["n_images"], "ảnh")]
    if d.get("r") is not None:
        he.append(("R_NDVI_LST", d["r"], None))
    with engine.begin() as c:
        c.execute(text("INSERT INTO KetQua_ThongKe(Ma_LuotQuet,Nam,Thang_Nam,Chi_So,TrungBinh,Gia_Tri_Min,Gia_Tri_Max,"
                       "Do_Lech_Chuan,So_Pixel,So_Anh,Trung_Vi,Q1,Q3) "
                       "VALUES(:r,:y,NULL,:i,:m,:mn,:mx,:sd,:n,:na,:md,:q1,:q3)"), rows)
        c.execute(text("INSERT INTO HeSo_TinhToan(Ma_LuotQuet,Nam,Thang_Nam,Ten_HeSo,GiaTri,DonVi) VALUES(:r,:y,NULL,:t,:v,:u)"),
                  [dict(r=run_id, y=y, t=t, v=v, u=u) for t, v, u in he])

def _save_regions(run_id, y, cloud):      # KetQua_Vung: số liệu + mức độ + MÀU + Gi*; Moran's I -> HeSo_TinhToan
    rows, he = [], []
    for idx in INDICES:
        cls = _classes(idx) if idx in ("LST", "TVDI") else []
        lo, hi, pal = VIS[idx]
        gj = g.grid_stats(idx, y, cloud)
        sp = spatial.analyze(gj)
        if sp:
            he += [(f"Moran_I_{idx}", _f(sp["moran"]["I"]), None), (f"Moran_Z_{idx}", _f(sp["moran"]["z"]), None),
                   (f"Moran_P_{idx}", _f(sp["moran"]["p"]), None)]
        for f in gj["features"]:
            p = f["properties"]; m = p.get("mean")
            if m is None or not p.get("Code"):
                continue
            k, gi = _klass(cls, m), (sp or {}).get("gi", {}).get(p["Code"], {})
            rows.append(dict(r=run_id, y=y, i=idx, code=p["Code"], name=p.get("Name"), m=m, mn=p.get("min"), mx=p.get("max"),
                             sd=p.get("stdDev"), n=int(p["count"]) if p.get("count") is not None else None,
                             pc=k["id"] if k else None, md=k["name"] if k else None,
                             col=k["color"] if k else color_at((m - lo) / (hi - lo), pal),
                             gz=_f(gi.get("z")), gn=gi.get("nhom")))
    with engine.begin() as c:
        c.execute(text("INSERT INTO KetQua_Vung(Ma_LuotQuet,Nam,Thang_Nam,Chi_So,Ma_Vung,Ten_Vung,TrungBinh,Gia_Tri_Min,Gia_Tri_Max,"
                       "Do_Lech_Chuan,So_Pixel,Ma_PhanCap,Muc_Do,Ma_Mau_Hex,Gi_Z,Gi_Nhom) "
                       "VALUES(:r,:y,NULL,:i,:code,:name,:m,:mn,:mx,:sd,:n,:pc,:md,:col,:gz,:gn)"), rows)
        if he:
            c.execute(text("INSERT INTO HeSo_TinhToan(Ma_LuotQuet,Nam,Thang_Nam,Ten_HeSo,GiaTri,DonVi) VALUES(:r,:y,NULL,:t,:v,:u)"),
                      [dict(r=run_id, y=y, t=t, v=v, u=u) for t, v, u in he])

def _save_images(run_id, y, cloud):       # Anh_KetQua: PNG liên tục (3 chỉ số) + PNG phân loại (LST, TVDI)
    folder = os.path.join("exports", "maps", str(run_id)); os.makedirs(folder, exist_ok=True)
    for idx in INDICES:
        for classify in ((False, True) if idx != "NDVI" else (False,)):
            cls = _classes(idx) if classify else []
            data, vis, bbox = g.snapshot_png(idx, y, cloud, [(k["lo"], k["hi"], k["color"]) for k in cls] or None)
            path = os.path.join(folder, f"{idx}_{y}_{'phanloai' if classify else 'lientuc'}.png")
            with open(path, "wb") as fh:
                fh.write(data)
            w, h = struct.unpack(">II", data[16:24])
            with engine.begin() as c:
                c.execute(text("INSERT INTO Anh_KetQua(Ma_LuotQuet,Nam,Thang_Nam,Chi_So,Che_Do_HienThi,Gia_Tri_Min,Gia_Tri_Max,"
                               "Bang_Mau_JSON,Rong_px,Cao_px,BBox,Dinh_Dang,DuongDan_File,NoiDung_Anh,Ma_Hash) "
                               "VALUES(:r,:y,NULL,:i,:cd,:mn,:mx,:js,:w,:h,:bb,'PNG',:p,:img,:hs)"),
                          dict(r=run_id, y=y, i=idx, cd="Phân loại" if classify else "Liên tục", mn=vis["min"], mx=vis["max"],
                               js=json.dumps({"vis": vis, "classes": cls}, ensure_ascii=False), w=w, h=h, bb=bbox,
                               p=path, img=data, hs=hashlib.sha256(data).hexdigest()))

def _save_months(run_id, y, rows):        # theo tháng: bản mới nhất + KetQua_ThongKe (có Thang_Nam)
    ok = [r for r in rows if all(r["stats"][b]["mean"] is not None for b in INDICES)]
    legacy = [dict(ym=r["ym"], y=y, lst=round(r["stats"]["LST"]["mean"], 2), ndvi=round(r["stats"]["NDVI"]["mean"], 3),
                   tvdi=round(r["stats"]["TVDI"]["mean"], 3), n=r["n"], kv=REGION) for r in ok]
    ks = [dict(r=run_id, y=y, ym=r["ym"], i=b, m=st["mean"], mn=st["min"], mx=st["max"], sd=st["stdDev"],
               n=int(st["count"]) if st["count"] is not None else None, na=r["n"]) for r in ok for b, st in r["stats"].items()]
    with engine.begin() as c:
        c.execute(text("DELETE FROM ChiSo_MoiTruong_TheoThang WHERE Nam=:y"), dict(y=y))
        if legacy:
            c.execute(text("INSERT INTO ChiSo_MoiTruong_TheoThang(Thang_Nam,Nam,LST_TrungBinh,NDVI_TrungBinh,TVDI_TrungBinh,SoAnh,Ma_KhuVuc) "
                           "VALUES(:ym,:y,:lst,:ndvi,:tvdi,:n,:kv)"), legacy)
            c.execute(text("INSERT INTO KetQua_ThongKe(Ma_LuotQuet,Nam,Thang_Nam,Chi_So,TrungBinh,Gia_Tri_Min,Gia_Tri_Max,Do_Lech_Chuan,So_Pixel,So_Anh) "
                           "VALUES(:r,:y,:ym,:i,:m,:mn,:mx,:sd,:n,:na)"), ks)

def _scan(start, end, cloud, mode):
    t0 = time.time()
    try:
        with engine.begin() as c:
            JOB["run_id"] = run_id = c.execute(text(
                "INSERT INTO LichSu_QuetDuLieu(Nam_BatDau,Nam_KetThuc,TrangThai,Che_Do,Thang_BatDau,Thang_KetThuc,Nguong_May_Max) "
                "VALUES(:s,:e,'Đang chạy',:cd,:tb,:tk,:mc) RETURNING Ma_LuotQuet"),
                dict(s=start, e=end, cd="THANG" if mode == "month" else "NAM", mc=cloud,
                     tb=f"{start-1}-12" if mode == "month" else None, tk=f"{end}-04" if mode == "month" else None)).scalar()
            try:
                c.execute(text("UPDATE RanhGioi_HanhChinh SET DienTich_Km2=:a WHERE Ma_KhuVuc=:k"), dict(a=round(g.area_km2(), 1), k=REGION))
            except Exception:
                log.exception("Không cập nhật được diện tích")
        with engine.begin() as c:   # chụp lại thông số kỹ thuật đã dùng cho lượt quét này
            c.execute(text("INSERT INTO LuotQuet_ThamSo(Ma_LuotQuet,Ma_ThongSo,GiaTri_TaiThoiDiem) SELECT :i,Ma_ThongSo,GiaTri FROM ThongSo_KyThuat"), dict(i=run_id))
            for k, v in (("DL_MAY_MD", str(cloud)), ("DL_NAM", f"{start}–{end}")):
                c.execute(text("UPDATE LuotQuet_ThamSo SET GiaTri_TaiThoiDiem=:v WHERE Ma_LuotQuet=:i AND Ma_ThongSo=:k"), dict(v=v, i=run_id, k=k))
    except Exception as e:
        log.exception("DB error")
        JOB.update(running=False, msg=f"Không ghi được lịch sử quét: {e} (đã chạy WebGIS_bosung_pg.sql chưa?)"); return
    for y in range(start, end + 1):
        JOB["msg"] = f"Đang xử lý năm {y} ({JOB['done']+1}/{JOB['total']})..."
        try:
            d = g.year_data(y, cloud); _save_year(run_id, y, d); JOB["ok"] += 1
        except Exception as e:
            log.exception(f"Lỗi năm {y}"); JOB["errors"].append(f"{y}: {e}"); JOB["done"] += 1; continue
        steps = [("thống kê", lambda: _save_history(run_id, y, d)), ("vùng", lambda: _save_regions(run_id, y, cloud)),
                 ("ảnh bản đồ", lambda: _save_images(run_id, y, cloud))]
        if mode == "month":
            steps.append(("theo tháng", lambda: _save_months(run_id, y, g.month_data(y, cloud))))
        for label, fn in steps:
            JOB["msg"] = f"Năm {y}: đang lưu {label}..."
            try:
                fn()
            except Exception as e:
                log.exception(f"Lỗi {label} {y}"); JOB["errors"].append(f"{y} ({label}): {e}")
        JOB["done"] += 1
    status = "Thành công" if JOB["ok"] == JOB["total"] and not JOB["errors"] else ("Một phần" if JOB["ok"] else "Thất bại")
    with engine.begin() as c:
        c.execute(text("UPDATE LichSu_QuetDuLieu SET SoLuong_Nam_ThanhCong=:n,TrangThai=:t,ThoiGian_XuLy_Giay=:s WHERE Ma_LuotQuet=:i"),
                  dict(n=JOB["ok"], t=status, s=round(time.time() - t0, 1), i=run_id))
    JOB.update(running=False, msg=f"Xong: {JOB['ok']}/{JOB['total']} năm ({status}).")

@app.post("/api/scan", status_code=202)
def scan(request: Request, start: int = Query(2016, ge=2014), end: int = Query(THIS_YEAR, le=THIS_YEAR),
         cloud: int = Query(30, ge=0, le=100), mode: Literal["year", "month"] = "year"):
    if start > end: raise HTTPException(400, "Năm bắt đầu phải ≤ năm kết thúc")
    if JOB["running"]: raise HTTPException(409, "Đang có một lượt quét chạy")
    JOB.update(running=True, done=0, total=end - start + 1, ok=0, errors=[], run_id=None, msg="Bắt đầu...")
    _log(request, "Quét chuỗi thời gian (" + ("năm+tháng" if mode == "month" else "năm") + ")", None, None)
    threading.Thread(target=_scan, args=(start, end, cloud, mode), daemon=True).start()
    return JOB

@app.get("/api/scan/status")
def scan_status():
    return JOB

# ---------- dữ liệu cho biểu đồ / lịch sử / phân cấp ----------
@app.get("/api/timeseries")
def timeseries():
    with engine.connect() as c:
        rows = [fixkeys(r._mapping) for r in c.execute(text(
            "SELECT Nam,LST_TrungBinh,NDVI_TrungBinh,TVDI_TrungBinh,LST_Min,LST_Max "
            "FROM ChiSo_MoiTruong_TheoNam WHERE Ma_KhuVuc=:k ORDER BY Nam"), dict(k=REGION))]
    try:
        lc, tc = _classes("LST"), _classes("TVDI")
    except Exception:
        lc = tc = []
    for r in rows:
        r["MucLST"] = _level(lc, float(r["LST_TrungBinh"])) if lc else None
        r["MucTVDI"] = _level(tc, float(r["TVDI_TrungBinh"])) if tc else None
    return rows

@app.get("/api/monthly")
def monthly():
    try:
        with engine.connect() as c:
            return [fixkeys(r._mapping) for r in c.execute(text(
                "SELECT Thang_Nam,Nam,LST_TrungBinh,NDVI_TrungBinh,TVDI_TrungBinh,SoAnh "
                "FROM ChiSo_MoiTruong_TheoThang WHERE Ma_KhuVuc=:k ORDER BY Thang_Nam"), dict(k=REGION))]
    except Exception:
        log.exception("Chưa có bảng ChiSo_MoiTruong_TheoThang? Hãy chạy WebGIS_bosung_pg.sql"); return []

@app.get("/api/geotiff")
def geotiff(request: Request, index: str, year: int = Query(..., ge=2014, le=THIS_YEAR), cloud: int = Query(30, ge=0, le=100)):
    if index not in INDICES: raise HTTPException(400, f"Chỉ số không hợp lệ: {index}")
    try:
        url = g.geotiff_url(index, year, cloud)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except ee.EEException as e:
        log.exception("GEE error"); raise HTTPException(502, f"Lỗi Google Earth Engine: {e}")
    _log(request, "Xuất GeoTIFF", index, year)
    return {"url": url}

@app.get("/api/history")
def history():
    with engine.connect() as c:
        return [fixkeys(r._mapping) for r in c.execute(text(
            "SELECT * FROM LichSu_QuetDuLieu ORDER BY Ma_LuotQuet DESC LIMIT 20"))]

@app.get("/api/images")
def images(year: int):
    with engine.connect() as c:
        return [fixkeys(r._mapping) for r in c.execute(text(
            "SELECT * FROM Anh_VeTinh WHERE Nam_GiamSat=:y ORDER BY Ngay_ThuNhan"), dict(y=year))]

# ---------- xuất báo cáo CSV -> BaoCao_ThongKe + ChiTiet_BaoCao ----------
@app.get("/api/report")
def report(request: Request):
    with engine.connect() as c:
        rows = c.execute(text("SELECT Nam,LST_TrungBinh,NDVI_TrungBinh,TVDI_TrungBinh,LST_Min,LST_Max "
                              "FROM ChiSo_MoiTruong_TheoNam WHERE Ma_KhuVuc=:k ORDER BY Nam"), dict(k=REGION)).all()
    if not rows: raise HTTPException(400, "Chưa có dữ liệu. Hãy quét chuỗi thời gian trước.")
    lst_c, tvdi_c = _classes("LST"), _classes("TVDI")
    os.makedirs("exports", exist_ok=True)
    name = f"bao_cao_LST_NDVI_TVDI_{datetime.now():%Y%m%d_%H%M%S}.csv"
    path = os.path.join("exports", name)
    detail = [dict(nam=r[0], lst=r[1], ndvi=r[2], tvdi=r[3],
                   dg=f"{_level(lst_c, float(r[1]))}; {_level(tvdi_c, float(r[3]))}"[:200]) for r in rows]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["Nam", "LST_TB(C)", "NDVI_TB", "TVDI_TB", "LST_Min", "LST_Max", "Danh_gia"])
        for r, d in zip(rows, detail):
            w.writerow([*r, d["dg"]])
    with engine.begin() as c:
        bid = c.execute(text("INSERT INTO BaoCao_ThongKe(Ten_BaoCao,DinhDang_File,DuongDan_File,GhiChu) "
                             "VALUES(:t,'CSV',:p,'Landsat 8/9, mùa khô T12-T4') RETURNING Ma_BaoCao"),
                        dict(t=f"Báo cáo LST-NDVI-TVDI {rows[0][0]}–{rows[-1][0]}", p=path)).scalar()
        c.execute(text("INSERT INTO ChiTiet_BaoCao(Ma_BaoCao,Nam,LST_TrungBinh,NDVI_TrungBinh,TVDI_TrungBinh,DanhGia_MoiTruong) "
                       "VALUES(:b,:nam,:lst,:ndvi,:tvdi,:dg)"), [dict(b=bid, **d) for d in detail])
    _log(request, "Xuất báo cáo CSV")
    return FileResponse(path, filename=name, media_type="text/csv", headers={"X-Report-Id": str(bid)})

# ---------- [MỚI] thang màu, thống kê, biểu đồ so sánh ----------
def _gee_call(fn, *a):
    try:
        return fn(*a)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except ee.EEException as e:
        log.exception("GEE error"); raise HTTPException(502, f"Lỗi Google Earth Engine: {e}")

YEAR = Query(..., ge=2014, le=THIS_YEAR); CLOUD = Query(30, ge=0, le=100)

@app.get("/api/classes")
def classes_api():
    out = {"vis": {k: {"min": v[0], "max": v[1], "palette": v[2]} for k, v in VIS.items()}}
    for k in ("LST", "TVDI"):
        try: out[k] = _classes(k)
        except Exception: out[k] = []
    return out

@app.get("/api/stats/zones")
def stats_zones(year: int = YEAR, cloud: int = CLOUD):
    return _gee_call(g.zone_stats, year, cloud)

@app.get("/api/stats/classes")
def stats_classes(year: int = YEAR, cloud: int = CLOUD):
    return _gee_call(g.class_stats, year, cloud)

@app.get("/api/stats/spatial")
def stats_spatial(year: int = YEAR, cloud: int = CLOUD):
    def f():
        out = {}
        for idx in INDICES:
            sp = spatial.analyze(g.grid_stats(idx, year, cloud))
            if sp:
                cnt = {}
                for v in sp["gi"].values(): cnt[v["nhom"]] = cnt.get(v["nhom"], 0) + 1
                out[idx] = {"moran": sp["moran"], "nhom": cnt}
        return out
    return _gee_call(f)

@app.get("/api/charts/cells")
def charts_cells(year: int = YEAR, cloud: int = CLOUD):
    def f():
        m = {i: {x["properties"]["Code"]: x["properties"].get("mean") for x in g.grid_stats(i, year, cloud)["features"]} for i in INDICES}
        return [{"code": c, "ndvi": m["NDVI"].get(c), "lst": l, "tvdi": m["TVDI"].get(c)} for c, l in m["LST"].items()
                if None not in (l, m["NDVI"].get(c), m["TVDI"].get(c))]
    return _gee_call(f)

@app.get("/api/charts/triangle")
def charts_triangle(year: int = YEAR, cloud: int = CLOUD):
    return _gee_call(g.triangle_points, year, cloud)

@app.get("/api/charts/hist")
def charts_hist(index: str, year: int = YEAR, cloud: int = CLOUD):
    if index not in INDICES: raise HTTPException(400, "Chỉ số không hợp lệ")
    return _gee_call(g.histogram, index, year, cloud)

@app.get("/api/stats/regions")
def stats_regions(year: int = YEAR, cloud: int = CLOUD):
    return _gee_call(g.region_stats, year, cloud)

@app.get("/api/cartomap")
def cartomap_api(request: Request, index: str, year: int = YEAR, cloud: int = CLOUD, classify: bool = True,
                 region: str = "all", fmt: Literal["png", "pdf"] = "png", dpi: int = Query(200, ge=72, le=400)):
    if index not in INDICES:
        raise HTTPException(400, f"Chỉ số không hợp lệ: {index}")
    cls = []
    if classify:
        try:
            cls = cartomap.NDVI_CLASSES if index == "NDVI" else _classes(index)
        except Exception:
            log.exception("Không đọc được phân cấp, dùng thang liên tục")
    data = _gee_call(cartomap.render, index, year, cloud, cls, region, fmt, dpi)
    _log(request, "Xuất bản đồ bố cục", index, year)
    return Response(content=data, media_type="image/png" if fmt == "png" else "application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="banDo_{index}_{year}.{fmt}"'})
# ---------- tra ngược lịch sử quét ----------
@app.get("/api/runs")
def runs():
    return _q("SELECT * FROM vw_LichSu_QuetChiTiet ORDER BY Ma_LuotQuet DESC LIMIT 50")

@app.get("/api/run/{rid}/summary")
def run_summary(rid: int):
    return _q("SELECT * FROM vw_KetQua_TheoLuotQuet WHERE Ma_LuotQuet=:r ORDER BY Nam, Thang_Nam", r=rid)

@app.get("/api/run/{rid}/params")
def run_params(rid: int):
    return _q("SELECT p.Ma_ThongSo,t.Nhom,t.Ten_ThongSo,p.GiaTri_TaiThoiDiem,t.DonVi FROM LuotQuet_ThamSo p "
              "JOIN ThongSo_KyThuat t ON t.Ma_ThongSo=p.Ma_ThongSo WHERE p.Ma_LuotQuet=:r ORDER BY t.Nhom,p.Ma_ThongSo", r=rid)

@app.get("/api/run/{rid}/coef")
def run_coef(rid: int):
    return _q("SELECT Nam,Thang_Nam,Ten_HeSo,GiaTri,DonVi FROM HeSo_TinhToan WHERE Ma_LuotQuet=:r ORDER BY Nam,Ten_HeSo", r=rid)

@app.get("/api/run/{rid}/regions")
def run_regions(rid: int, year: int, index: str):
    return _q("SELECT Ma_Vung,Ten_Vung,TrungBinh,Gia_Tri_Min,Gia_Tri_Max,Do_Lech_Chuan,So_Pixel,Muc_Do,Ma_Mau_Hex,Gi_Z,Gi_Nhom FROM KetQua_Vung "
              "WHERE Ma_LuotQuet=:r AND Nam=:y AND Chi_So=:i ORDER BY Ma_Vung", r=rid, y=year, i=index)

@app.get("/api/run/{rid}/images")
def run_images(rid: int):
    return _q("SELECT Ma_AnhKetQua,Nam,Thang_Nam,Chi_So,Che_Do_HienThi,Gia_Tri_Min,Gia_Tri_Max,Rong_px,Cao_px,Ma_Hash,Ngay_Tao "
              "FROM Anh_KetQua WHERE Ma_LuotQuet=:r ORDER BY Nam,Chi_So,Che_Do_HienThi", r=rid)

@app.get("/api/image/{aid}")
def image(aid: int):
    with engine.connect() as c:
        row = c.execute(text("SELECT NoiDung_Anh,DuongDan_File FROM Anh_KetQua WHERE Ma_AnhKetQua=:a"), dict(a=aid)).first()
    if not row: raise HTTPException(404, "Không có ảnh")
    data = bytes(row[0]) if row[0] else (open(row[1], "rb").read() if row[1] and os.path.exists(row[1]) else None)
    if not data: raise HTTPException(404, "Không có dữ liệu ảnh")
    return Response(content=data, media_type="image/png")

# ---------- [MỚI] TỰ ĐỘNG HÓA: theo dõi ảnh Landsat mới -> tự quét + chụp nhanh + đánh giá ----------
AUTO = dict(checking=False, last_check=None, next_check=None, last_msg="Chưa chạy", last_error=None)
_AUTO_DEFAULT = {"BAT": "0", "CHU_KY_GIO": "12", "MAY_MAX": "30", "CUA_SO_NGAY": "60"}
MUC, SNAP_CLOUD, _TRY = ("Ổn định", "Lưu ý", "Cảnh báo"), 60, [0.0]

def _cfg():
    try:
        with engine.connect() as c:
            d = {k: v for k, v in c.execute(text("SELECT Khoa,GiaTri FROM TuDong_CauHinh")).all()}
    except Exception:
        d = {}
    return {**_AUTO_DEFAULT, **d}

def _r(x, n):
    return None if x is None else round(float(x), n)

def _year_means(y):
    r = _q("SELECT LST_TrungBinh,NDVI_TrungBinh,TVDI_TrungBinh FROM ChiSo_MoiTruong_TheoNam "
           "WHERE Nam=:y AND Ma_KhuVuc=:k", y=y, k=REGION)
    return {"LST": float(r[0]["LST_TrungBinh"]), "NDVI": float(r[0]["NDVI_TrungBinh"]),
            "TVDI": float(r[0]["TVDI_TrungBinh"])} if r else None

def _tier(classes, v):                       # 0/1/2 theo vị trí mức trong PhanCap_UHI_Khohan
    k = _klass(classes, v) if classes else None
    if not k: return 0, None
    i, top = classes.index(k), max(len(classes) - 1, 1)
    return (2 if i / top >= .67 else 1 if i / top >= .34 else 0), k["name"]

def _assess(old, new):
    """Đánh giá tự động: mức theo thang phân cấp + biến động so với giá trị cũ."""
    try: lc, tc = _classes("LST"), _classes("TVDI")
    except Exception: lc = tc = []
    (sl, nl), (stv, nt) = _tier(lc, new["LST"]), _tier(tc, new["TVDI"])
    d = {k: (new[k] - old[k] if old else None) for k in new}
    sev = max(sl, stv)
    if old:   # ngưỡng: ΔLST ≥ 1/2 °C; ΔNDVI ≤ -0.05/-0.10; ΔTVDI ≥ 0.05/0.10 -> Lưu ý/Cảnh báo
        sev = max(sev, 2 if d["LST"] >= 2 else 1 if d["LST"] >= 1 else 0,
                  2 if d["NDVI"] <= -.1 else 1 if d["NDVI"] <= -.05 else 0,
                  2 if d["TVDI"] >= .1 else 1 if d["TVDI"] >= .05 else 0)
    def fm(k, n): return f"{new[k]:.{n}f}" + (f" ({d[k]:+.{n}f})" if old else "")
    note = (f"LST {fm('LST', 2)} °C" + (f" [{nl}]" if nl else "") + f"; NDVI {fm('NDVI', 3)}; TVDI {fm('TVDI', 3)}"
            + (f" [{nt}]" if nt else "") + ("" if old else ". Chưa có giá trị cũ để so sánh"))
    return sev, d, note

def _alog(**v):
    p = dict(t=datetime.now(), src="Tự động", ev="KIEM_TRA", y=None, n=None, nn=None, lt=None, r=None,
             st="Thành công", mu=None, dl=None, dn=None, dt=None, note=None)
    p.update(v)
    with engine.begin() as c:
        c.execute(text("INSERT INTO TuDong_NhatKy(ThoiGian,Nguon,Su_Kien,Nam,So_Anh_MuaKho,So_Anh_Moi,Ngay_Anh_MoiNhat,"
                       "Ma_LuotQuet,TrangThai,Muc_Do,D_LST,D_NDVI,D_TVDI,GhiChu) "
                       "VALUES(:t,:src,:ev,:y,:n,:nn,:lt,:r,:st,:mu,:dl,:dn,:dt,:note)"), p)

def _auto_snapshot(days):
    s = g.recent_data(days, SNAP_CLOUD); c = s["city"]; lst, tv = c["LST"]["mean"], c["TVDI"]["mean"]
    try: lc, tc = _classes("LST"), _classes("TVDI")
    except Exception: lc = tc = []
    with engine.begin() as cn:
        cn.execute(text("INSERT INTO TuDong_ChupNhanh(ThoiGian,Ngay_BatDau,Ngay_KetThuc,Ngay_Anh_MoiNhat,So_Anh,LST_TB,LST_Min,"
                        "LST_Max,LST_DoLech,NDVI_TB,TVDI_TB,Muc_LST,Muc_TVDI) "
                        "VALUES(:t,:a,:b,:b,:n,:l,:lmin,:lmax,:lsd,:nd,:tv,:ml,:mt)"),
                   dict(t=datetime.now(), a=date.fromisoformat(s["from"]), b=date.fromisoformat(s["to"]), n=s["n_images"],
                        l=_r(lst, 2), lmin=_r(c["LST"]["min"], 2), lmax=_r(c["LST"]["max"], 2), lsd=_r(c["LST"]["stdDev"], 2),
                        nd=_r(c["NDVI"]["mean"], 3), tv=_r(tv, 3),
                        ml=_level(lc, lst) if lc and lst is not None else None,
                        mt=_level(tc, tv) if tc and tv is not None else None))
    return s

def _auto_cycle(source="Tự động", force=False):
    if AUTO["checking"] or JOB["running"]:
        return
    AUTO.update(checking=True, last_msg="Đang kiểm tra ảnh Landsat mới...", last_error=None)
    y, cfg, started = date.today().year, _cfg(), False
    cloud = int(cfg["MAY_MAX"])
    try:
        sig = g.scene_signature(y, cloud)
        prev = _q("SELECT So_Anh_MuaKho AS n, Ngay_Anh_MoiNhat AS d FROM TuDong_NhatKy "
                  "WHERE Nam=:y AND Su_Kien<>'LOI' ORDER BY Ma_NhatKy_TD DESC LIMIT 1", y=y)
        prev, old = (prev[0] if prev else None), _year_means(y)
        any_last = date.fromisoformat(sig["any_last"]) if sig["any_last"] else None
        new_any = prev is None or any_last != prev["d"]
        do_scan = sig["n"] > 0 and (force or old is None or (prev is not None and sig["n"] != prev["n"]))
        ev, run, mu, d, note, st = "KIEM_TRA", None, None, {}, "", "Thành công"
        if do_scan:
            g.invalidate(y)
            JOB.update(running=True, done=0, total=1, ok=0, errors=[], run_id=None, msg=f"Tự động: quét lại mùa khô {y}...")
            started = True
            _scan(y, y, cloud, "month")          # chạy đồng bộ trong luồng nền này
            run = JOB["run_id"]
            if JOB["ok"] == 1:
                ev, new = "QUET_NAM", _year_means(y)
                if new:
                    sev, d, note = _assess(old, new); mu = MUC[sev]
                if JOB["errors"]:
                    st, note = "Một phần", note + " · Lỗi phụ: " + " | ".join(JOB["errors"])[:300]
            else:
                ev, st, note = "LOI", "Lỗi", "Quét năm thất bại: " + (" | ".join(JOB["errors"]) or JOB["msg"])
        snap_note = ""
        if (new_any or do_scan) and ev != "LOI":
            try:
                s = _auto_snapshot(int(cfg["CUA_SO_NGAY"]))
                snap_note = f"Chụp nhanh {s['from']} → {s['to']} ({s['n_images']} ảnh)."
                if ev == "KIEM_TRA": ev = "ANH_MOI"
            except Exception as e:
                log.exception("Chụp nhanh lỗi"); snap_note = f"Chụp nhanh lỗi: {e}"
        if ev == "ANH_MOI":
            note = ("Mốc theo dõi đầu tiên. " if prev is None else
                    "Có ảnh mới nhưng không làm đổi tổ hợp mùa khô (ngoài mùa khô hoặc mây ≥ ngưỡng), số liệu năm giữ nguyên. ") + snap_note
        elif ev == "KIEM_TRA":
            note = f"Không có ảnh mới ({sig['any_n']} ảnh L8/9 trong 90 ngày qua, mới nhất {sig['any_last']})."
        elif ev == "QUET_NAM":
            note = f"{note}. {snap_note}"
        _alog(src=source, ev=ev, y=y, n=sig["n"], nn=(sig["n"] - prev["n"]) if prev else None, lt=any_last, r=run, st=st,
              mu=mu, dl=_f(d.get("LST")), dn=_f(d.get("NDVI")), dt=_f(d.get("TVDI")), note=note[:1000])
        AUTO["last_msg"] = f"{EVN.get(ev, ev)}: {note[:140]}"
    except Exception as e:
        log.exception("Vòng tự động lỗi"); AUTO["last_error"] = str(e)
        try: _alog(src=source, ev="LOI", y=y, st="Lỗi", note=str(e)[:500])
        except Exception: pass
    finally:
        if started: JOB["running"] = False
        AUTO.update(checking=False, last_check=datetime.now().isoformat(timespec="seconds"))

EVN = {"KIEM_TRA": "Không có ảnh mới", "ANH_MOI": "Có ảnh mới", "QUET_NAM": "Đã quét lại năm", "LOI": "Lỗi"}

def _auto_loop():
    time.sleep(30)
    while True:
        try:
            cfg = _cfg()
            if cfg["BAT"] == "1":
                hrs = max(float(cfg["CHU_KY_GIO"]), 1)
                last = _q("SELECT MAX(ThoiGian) AS t FROM TuDong_NhatKy WHERE Nguon='Tự động'")[0]["t"]
                nxt = last + timedelta(hours=hrs) if last else datetime.now()
                AUTO["next_check"] = nxt.isoformat(timespec="minutes")
                if datetime.now() >= nxt and time.time() - _TRY[0] > 600:   # chống lặp dồn khi lỗi
                    _TRY[0] = time.time(); _auto_cycle("Tự động")
            else:
                AUTO["next_check"] = None
        except Exception:
            log.exception("Vòng lặp tự động")
        time.sleep(60)

@app.on_event("startup")
def _auto_start():
    threading.Thread(target=_auto_loop, daemon=True).start()

@app.get("/api/auto/status")
def auto_status():
    return {"cfg": _cfg(), "auto": AUTO, "job": {"running": JOB["running"], "msg": JOB["msg"]},
            "year": date.today().year, "season": f"12/{date.today().year-1}–04/{date.today().year}"}

@app.post("/api/auto/config")
def auto_config(bat: bool, hours: int = Query(12, ge=1, le=168), cloud: int = Query(30, ge=0, le=100),
                window: int = Query(60, ge=15, le=180)):
    rows = {"BAT": "1" if bat else "0", "CHU_KY_GIO": str(hours), "MAY_MAX": str(cloud), "CUA_SO_NGAY": str(window)}
    with engine.begin() as c:
        for k, v in rows.items():
            c.execute(text("INSERT INTO TuDong_CauHinh(Khoa,GiaTri) VALUES(:k,:v) "
                           "ON CONFLICT (Khoa) DO UPDATE SET GiaTri=EXCLUDED.GiaTri"), dict(k=k, v=v))
    return _cfg()

@app.post("/api/auto/run", status_code=202)
def auto_run(request: Request, force: bool = False):
    if AUTO["checking"] or JOB["running"]:
        raise HTTPException(409, "Đang có một lượt quét/kiểm tra chạy")
    _log(request, "Kiểm tra ảnh mới (thủ công)")
    threading.Thread(target=_auto_cycle, args=("Thủ công", force), daemon=True).start()
    return {"ok": True}

def _auto_q(sql, **p):
    try:
        return _q(sql, **p)
    except Exception as e:
        log.exception("Lỗi SQL tự động hóa")
        msg = str(getattr(e, "orig", e)).splitlines()[0]
        raise HTTPException(500, f"Lỗi CSDL: {msg}")

@app.get("/api/auto/log")
def auto_log():
    return _auto_q("SELECT * FROM TuDong_NhatKy ORDER BY Ma_NhatKy_TD DESC LIMIT 100")

@app.get("/api/auto/snapshots")
def auto_snapshots():
    return _auto_q("SELECT * FROM TuDong_ChupNhanh ORDER BY Ma_ChupNhanh DESC LIMIT 60")

@app.get("/api/auto/image")
def auto_image(index: str, days: int = Query(60, ge=15, le=180), cloud: int = Query(60, ge=0, le=100)):
    if index not in INDICES:
        raise HTTPException(400, "Chỉ số không hợp lệ")
    data = _gee_call(g.recent_png, index, days, cloud)
    return Response(content=data, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})

@app.get("/api/auto/vector")
def auto_vector(kind: Literal["grid", "outline"] = "grid", days: int = Query(60, ge=15, le=180),
                cloud: int = Query(60, ge=0, le=100)):
    if kind == "outline":
        gj = _gee_call(g.outline)
    else:
        gj = _gee_call(g.recent_grid, days, cloud)
        try: lc, tc = _classes("LST"), _classes("TVDI")
        except Exception: lc = tc = []
        for f in gj["features"]:                     # thêm mức độ theo PhanCap_UHI_Khohan
            p = f["properties"]
            p["Muc_LST"] = _level(lc, p["LST"]) if lc and p.get("LST") is not None else None
            p["Muc_TVDI"] = _level(tc, p["TVDI"]) if tc and p.get("TVDI") is not None else None
    return Response(content=json.dumps(gj, ensure_ascii=False), media_type="application/geo+json")

app.mount("/", StaticFiles(directory="static", html=True))