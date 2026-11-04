"""Đọc 2 shapefile hành chính (34 tỉnh/thành + phường/xã) -> GeoJSON ROI TP.HCM sau sáp nhập 01/07/2025.
Không cần thư viện ngoài (tự đọc .shp/.shx/.dbf). Kết quả:
    data/hcm_outline.geojson  ranh giới TP.HCM (lấy từ file 34 tỉnh/thành)
    data/hcm_wards.geojson    các phường/xã/đặc khu thuộc TP.HCM (lấy từ file phường/xã)
Cách chạy (tại thư mục gốc):
    python scripts/shp_to_geojson.py --shp-dir data/shp               # mặc định: loại đặc khu Côn Đảo (chỉ phần đất liền)
    python scripts/shp_to_geojson.py --shp-dir data/shp --co-con-dao  # giữ cả Côn Đảo
"""
import argparse, json, math, os, struct, unicodedata

def _nfc(s): return unicodedata.normalize("NFC", s)

def find_base(d, key):
    for f in sorted(os.listdir(d)):
        if f.lower().endswith(".shp") and _nfc(key) in _nfc(f):
            return os.path.join(d, f[:-4])
    raise SystemExit(f"Không thấy file .shp chứa '{key}' trong {d}")

def read_dbf(base):
    with open(base + ".dbf", "rb") as f:
        h = f.read(32); n, hl, rl = struct.unpack("<IHH", h[4:12]); fields = []
        while True:
            d = f.read(32)
            if d[0] == 0x0D: break
            fields.append((d[:11].split(b"\0")[0].decode(), d[16]))
        f.seek(hl); rows = []
        for _ in range(n):
            r = f.read(rl); o = 1; row = {}
            for nm, l in fields:
                row[nm] = r[o:o + l].decode("utf-8", "replace").strip(); o += l
            rows.append(row)
    return rows

def read_offsets(base):
    d = open(base + ".shx", "rb").read()
    return [struct.unpack(">i", d[100 + 8 * i:104 + 8 * i])[0] * 2 for i in range((len(d) - 100) // 8)]

def read_rings(shp, off):
    shp.seek(off); _, clen = struct.unpack(">ii", shp.read(8)); c = shp.read(clen * 2)
    if struct.unpack("<i", c[:4])[0] == 0: return []
    nparts, npts = struct.unpack("<ii", c[36:44])
    parts = list(struct.unpack(f"<{nparts}i", c[44:44 + 4 * nparts])) + [npts]
    o = 44 + 4 * nparts; v = struct.unpack(f"<{2 * npts}d", c[o:o + 16 * npts]); xy = list(zip(v[0::2], v[1::2]))
    return [xy[parts[i]:parts[i + 1]] for i in range(nparts)]

def sarea(r): return sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1)) / 2

def pip(pt, ring):
    x, y, ins = pt[0], pt[1], False
    for i in range(len(ring) - 1):
        (x1, y1), (x2, y2) = ring[i], ring[i + 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: ins = not ins
    return ins

def to_polygons(rings):
    """Vòng ngoài = chiều kim đồng hồ (diện tích < 0), lỗ = ngược lại; gán lỗ vào vòng ngoài chứa nó."""
    outers = [r for r in rings if sarea(r) < 0] or list(rings)
    holes = [r for r in rings if sarea(r) > 0 and r not in outers]
    polys = [[o] for o in outers]
    for h in holes:
        for p in polys:
            if pip(h[0], p[0]): p.append(h); break
    return polys

def dp(pts, tol):
    n = len(pts); keep = [False] * n; keep[0] = keep[-1] = True; st = [(0, n - 1)]
    while st:
        a, b = st.pop(); ax, ay = pts[a]; dx, dy = pts[b][0] - ax, pts[b][1] - ay
        L = dx * dx + dy * dy; md, mi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i][0] - ax, pts[i][1] - ay
            if L == 0: d = px * px + py * py
            else:
                t = max(0.0, min(1.0, (px * dx + py * dy) / L)); d = (px - t * dx) ** 2 + (py - t * dy) ** 2
            if d > md: md, mi = d, i
        if md > tol * tol: keep[mi] = True; st += [(a, mi), (mi, b)]
    return [p for p, k in zip(pts, keep) if k]

def simp_ring(r, tol, nd=5):
    pts = r[:-1] if r[0] == r[-1] else list(r)
    if len(pts) < 4: return None
    m = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    out = dp(pts[:m + 1], tol)[:-1] + dp(pts[m:] + [pts[0]], tol)
    out = [(round(x, nd), round(y, nd)) for x, y in out]
    return out if len(out) >= 4 and abs(sarea(out)) > 1e-8 else None

def geom(rings, tol, min_km2=0.0):
    """Đơn giản hóa; bỏ mảnh nhỏ hơn min_km2 (mỏm đá, bãi nhỏ) nhưng luôn giữ mảnh lớn nhất."""
    polys = []
    for p in to_polygons(rings):
        rs = [simp_ring(r, tol) for r in p]
        if rs[0] is None: continue
        polys.append([[list(c) for c in r] for r in rs if r])
    if min_km2 and len(polys) > 1:
        big = max(polys, key=lambda q: km2([q]))
        polys = [q for q in polys if q is big or km2([q]) >= min_km2]
    return polys

def km2(polys):
    s = 0.0
    for p in polys:
        for i, r in enumerate(p):
            lat = sum(c[1] for c in r) / len(r)
            a = abs(sarea(r)) * 111.32 * math.cos(math.radians(lat)) * 110.57
            s += -a if i else a
    return s

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shp-dir", default="data/shp"); ap.add_argument("--out", default="data")
    ap.add_argument("--ma-tinh", default="79"); ap.add_argument("--min-km2", type=float, default=0.01, help="bỏ mảnh nhỏ hơn (km²)"); ap.add_argument("--tol", type=float, default=0.0001, help="độ; 0.0001 ≈ 11 m")
    ap.add_argument("--co-con-dao", action="store_true", help="giữ đặc khu Côn Đảo (mặc định: loại, tức bỏ các phần có vĩ độ < 10,0°)")
    a = ap.parse_args(); bo_cd = not a.co_con_dao; os.makedirs(a.out, exist_ok=True)
    pb, wb = find_base(a.shp_dir, "tỉnh_thành"), find_base(a.shp_dir, "phường_xã")

    # 1) ranh giới tỉnh/thành
    prov = read_dbf(pb); i = next(k for k, r in enumerate(prov) if r["ma_tinh"] == a.ma_tinh)
    with open(pb + ".shp", "rb") as f: polys = geom(read_rings(f, read_offsets(pb)[i]), a.tol, a.min_km2)
    if bo_cd: polys = [p for p in polys if max(c[1] for c in p[0]) >= 10.0]
    pr = prov[i]
    outline = {"type": "FeatureCollection", "features": [{"type": "Feature",
        "geometry": {"type": "MultiPolygon", "coordinates": polys},
        "properties": {"Code": "HCM", "Name": pr["ten_tinh"] + (" (không gồm Côn Đảo)" if bo_cd else ""),
                       "Code_Tinh": pr["ma_tinh"], **({} if bo_cd else {"DienTich_km2": float(pr["dtich_km2"]), "DanSo": int(pr["dan_so"])})}}]}
    json.dump(outline, open(os.path.join(a.out, "hcm_outline.geojson"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"Ranh giới: {pr['ten_tinh']} · {len(polys)} mảnh · tính lại {km2(polys):.0f} km² (file: {float(pr['dtich_km2']):.0f})")

    # 2) phường/xã/đặc khu của tỉnh đó
    xa = read_dbf(wb); off = read_offsets(wb); feats = []
    with open(wb + ".shp", "rb") as f:
        for k, r in enumerate(xa):
            if r["ma_tinh"] != a.ma_tinh: continue
            if bo_cd and r["loai"] == "Đặc khu": continue
            g = geom(read_rings(f, off[k]), a.tol, a.min_km2)
            feats.append({"type": "Feature", "geometry": {"type": "MultiPolygon", "coordinates": g},
                "properties": {"Code": r["ma_xa"], "Name": r["ten_xa"], "Loai": r["loai"], "Code_Tinh": r["ma_tinh"],
                               "DienTich_km2": float(r["dtich_km2"]), "DanSo": int(r["dan_so"]), "SapNhap": r["sap_nhap"]}})
    json.dump({"type": "FeatureCollection", "features": feats}, open(os.path.join(a.out, "hcm_wards.geojson"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    tot = sum(x["properties"]["DienTich_km2"] for x in feats)
    print(f"Phường/xã: {len(feats)} đơn vị · tổng diện tích theo file {tot:.0f} km²")

if __name__ == "__main__":
    main()