"""Đối chiếu kết quả Landsat (web) với các bộ dữ liệu ĐỘC LẬP có sẵn trên GEE.
Không dùng số liệu từ bài báo: mọi chỉ số sai số tính từ cặp (web, tham chiếu) lấy trực tiếp từ GEE."""
import math
from datetime import datetime, timezone
import ee
from . import gee_service as g

L_PROJ = ee.Projection("EPSG:32648").atScale(30)       # Landsat khu vực TP.HCM: UTM 48N, 30 m
DEG_1KM = ee.Projection("EPSG:4326").atScale(1000)     # bậc trung gian khi gộp lên lưới thô (~11 km)

CASES = {   # mode: agree = so sánh trực tiếp giá trị; relation = chỉ xét tương quan (khác đơn vị)
    "LST_MODIS":  dict(idx="LST",  mode="agree", unit="°C", res="1 km",
                       title="LST Landsat ↔ MODIS Terra MOD11A1",
                       ref="MODIS/061/MOD11A1 · LST_Day_1km (QC tốt), cùng ngày Landsat thu ảnh", ref_label="LST MODIS (°C)"),
    "LST_ERA5":   dict(idx="LST",  mode="agree", unit="°C", res="~11 km",
                       title="LST Landsat ↔ ERA5-Land skin temperature",
                       ref="ECMWF/ERA5_LAND/HOURLY · skin_temperature 03–04 UTC, cùng ngày Landsat (tái phân tích, không phải đo trực tiếp)", ref_label="Skin temp ERA5-Land (°C)"),
    "NDVI_MODIS": dict(idx="NDVI", mode="agree", unit="", res="250 m",
                       title="NDVI Landsat ↔ MODIS MOD13Q1",
                       ref="MODIS/061/MOD13Q1 · NDVI (SummaryQA = 0), mùa khô 12/năm-1 → 4/năm", ref_label="NDVI MODIS"),
    "TVDI_SM":    dict(idx="TVDI", mode="relation", expect=-1, unit="", res="~11 km",
                       title="TVDI ↔ độ ẩm đất ERA5-Land",
                       ref="ECMWF/ERA5_LAND/MONTHLY_AGGR · volume_soil_water_layer_1, TB mùa khô", ref_label="Độ ẩm đất lớp 1 (m³/m³)"),
    "TVDI_RAIN":  dict(idx="TVDI", mode="relation", expect=-1, unit="", res="~5,5 km",
                       title="TVDI ↔ lượng mưa CHIRPS",
                       ref="UCSB-CHG/CHIRPS/DAILY · precipitation, tổng mùa khô", ref_label="Mưa mùa khô CHIRPS (mm)"),
}

def _proj(coll, band):
    return ee.Image(ee.ImageCollection(coll).first()).select(band).projection()

def _ref(kind, year, cloud):
    """Trả về (tên băng Landsat, ảnh tham chiếu băng 'b', projection tham chiếu, có phải lưới thô)."""
    dates = sorted({m["properties"]["date"] for m in g.year_data(year, cloud)["meta"]})
    d0, d1 = f"{year-1}-12-01", f"{year}-05-01"                       # cùng cửa sổ mùa khô với g._col
    if kind == "LST_MODIS":
        C = "MODIS/061/MOD11A1"
        col = ee.ImageCollection(C).filter(ee.Filter.inList("system:index", [d.replace("-", "_") for d in dates]))
        ref = col.map(lambda i: i.select("LST_Day_1km").multiply(0.02).subtract(273.15)
                      .updateMask(i.select("QC_Day").bitwiseAnd(3).eq(0)).rename("b")).median()
        return "LST", ref, _proj(C, "LST_Day_1km"), False
    if kind == "LST_ERA5":
        C = "ECMWF/ERA5_LAND/HOURLY"
        ts = [int(datetime.fromisoformat(d).replace(tzinfo=timezone.utc).timestamp() * 1000) + h * 3600000
              for d in dates for h in (3, 4)]
        ref = (ee.ImageCollection(C).filter(ee.Filter.inList("system:time_start", ts))
               .select("skin_temperature").median().subtract(273.15).rename("b"))
        return "LST", ref, _proj(C, "skin_temperature"), True
    if kind == "NDVI_MODIS":
        C = "MODIS/061/MOD13Q1"
        ref = (ee.ImageCollection(C).filterDate(d0, d1)
               .map(lambda i: i.select("NDVI").multiply(0.0001).updateMask(i.select("SummaryQA").eq(0)).rename("b")).median())
        return "NDVI", ref, _proj(C, "NDVI"), False
    if kind == "TVDI_SM":
        C = "ECMWF/ERA5_LAND/MONTHLY_AGGR"
        ref = ee.ImageCollection(C).filterDate(d0, d1).select("volume_soil_water_layer_1").mean().rename("b")
        return "TVDI", ref, _proj(C, "volume_soil_water_layer_1"), True
    if kind == "TVDI_RAIN":
        C = "UCSB-CHG/CHIRPS/DAILY"
        ref = ee.ImageCollection(C).filterDate(d0, d1).select("precipitation").sum().rename("b")
        return "TVDI", ref, _proj(C, "precipitation"), True
    raise ValueError(f"Không có bộ tham chiếu: {kind}")

def _to_grid(img, ref_proj, coarse):
    """Gộp (trung bình) ảnh Landsat 30 m lên đúng lưới pixel của sản phẩm tham chiếu."""
    img = img.setDefaultProjection(L_PROJ)
    if coarse:   # 30 m -> 1 km -> lưới thô, tránh gộp hàng trăm nghìn pixel trong một bước
        img = img.reduceResolution(ee.Reducer.mean(), maxPixels=2048).reproject(DEG_1KM)
    return img.reduceResolution(ee.Reducer.mean(), maxPixels=2048).reproject(ref_proj)

def _stack(kind, year, cloud):
    """Ảnh 2 băng: a = Landsat (web), b = tham chiếu, cùng lưới, chỉ giữ pixel hợp lệ ở CẢ HAI."""
    band, ref, proj, coarse = _ref(kind, year, cloud)
    a = _to_grid(g.year_data(year, cloud)["img"].select(band).rename("a"), proj, coarse)
    st = a.addBands(ref.reproject(proj))
    return st.updateMask(st.mask().reduce(ee.Reducer.min())), proj

def _pairs(kind, year, cloud, n=3000):
    key = ("val", kind, year, cloud)
    if (hit := g._get(key)):
        return hit
    st, proj = _stack(kind, year, cloud)
    fs = st.sample(region=g.OUTLINE.geometry(), projection=proj, numPixels=n, seed=7, tileScale=4).getInfo()["features"]
    pr = [(p["properties"]["a"], p["properties"]["b"]) for p in fs
          if p["properties"].get("a") is not None and p["properties"].get("b") is not None]
    return g._put(key, pr)

def metrics(pairs):
    """pairs = [(web, tham_chiếu)]. Hồi quy web = intercept + slope · tham_chiếu."""
    n = len(pairs)
    if n < 8:
        return None
    y, x = [p[0] for p in pairs], [p[1] for p in pairs]
    my, mx = sum(y) / n, sum(x) / n
    sxx, syy = sum((v - mx) ** 2 for v in x), sum((v - my) ** 2 for v in y)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    if sxx == 0 or syy == 0:
        return None
    r, slope = sxy / math.sqrt(sxx * syy), sxy / sxx
    d = [b - a for a, b in zip(x, y)]
    rmse = math.sqrt(sum(v * v for v in d) / n)
    out = dict(n=n, r=r, r2=r * r, slope=slope, intercept=my - slope * mx, bias=sum(d) / n,
               mae=sum(abs(v) for v in d) / n, rmse=rmse, sd_ref=math.sqrt(sxx / (n - 1)))
    if n > 3:       # khoảng tin cậy 95% của r (biến đổi Fisher) + p-value; lưu ý: pixel kề nhau tự tương quan -> khoảng hơi lạc quan
        z, se = math.atanh(max(-.999999, min(.999999, r))), 1 / math.sqrt(n - 3)
        out["ci"] = [math.tanh(z - 1.96 * se), math.tanh(z + 1.96 * se)]
        out["p"] = 2 * (1 - 0.5 * (1 + math.erf(abs(z / se) / math.sqrt(2))))
    return out

def validate_year(year, cloud=30):
    g.year_data(year, cloud)                 # lỗi "không có ảnh" nổi lên ở đây (HTTP 400)
    cases = []
    for kind, c in CASES.items():
        item = {"kind": kind, **c}
        try:
            pr = _pairs(kind, year, cloud)
            item["m"] = metrics(pr)
            item["scatter"] = [[round(a, 4), round(b, 4)] for a, b in pr[::max(1, len(pr) // 600)]]
            if item["m"] is None:
                item["error"] = "Không đủ cặp pixel hợp lệ để tính chỉ số."
        except Exception as e:               # một bộ tham chiếu lỗi không làm hỏng các bộ còn lại
            item["error"] = str(e)
        cases.append(item)
    return {"year": year, "n_images": g.year_data(year, cloud)["n_images"], "cases": cases}

def city_means(year, cloud=30):
    """Trung bình toàn thành phố của web và MODIS trên CÙNG tập pixel hợp lệ (cho đối chiếu chuỗi năm)."""
    key = ("valcity", year, cloud)
    if (hit := g._get(key)):
        return hit
    red, out = ee.Reducer.mean().combine(ee.Reducer.count(), sharedInputs=True), {"year": year}
    for kind, name in (("LST_MODIS", "LST"), ("NDVI_MODIS", "NDVI")):
        st, proj = _stack(kind, year, cloud)
        r = st.reduceRegion(red, g.OUTLINE.geometry(), scale=proj.nominalScale(), maxPixels=1e9, tileScale=4).getInfo()
        out[name] = {"web": r.get("a_mean"), "ref": r.get("b_mean"), "n": r.get("a_count")}
    return g._put(key, out)