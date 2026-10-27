import os, time, urllib.request
from datetime import datetime, timezone
import ee
from dotenv import load_dotenv
from .indices import L8, L9, INDICES, VIS, prep, fit_edges, edge_stats, tvdi_image
load_dotenv()
ee.Initialize(project=os.getenv("GEE_PROJECT"))

GRID = ee.FeatureCollection(os.getenv("GEE_ASSET"))
OUTLINE = ee.FeatureCollection(os.getenv("GEE_OUTLINE"))
STATS = (ee.Reducer.mean().combine(ee.Reducer.minMax(), sharedInputs=True)
         .combine(ee.Reducer.stdDev(), sharedInputs=True).combine(ee.Reducer.count(), sharedInputs=True))
KEYS = ("mean", "min", "max", "stdDev", "count")
STATS_X = (STATS.combine(ee.Reducer.median(), sharedInputs=True)
           .combine(ee.Reducer.percentile([25, 75]), sharedInputs=True))
KEYS_X = KEYS + ("median", "p25", "p75")

_cache, TTL = {}, 2 * 3600
def _get(key):
    hit = _cache.get(key)
    return hit[1] if hit and time.time() - hit[0] < TTL else None
def _put(key, val):
    _cache[key] = (time.time(), val); return val

def outline():
    return _get("outline") or _put("outline", OUTLINE.getInfo())

def area_km2():
    return OUTLINE.geometry().area(maxError=100).divide(1e6).getInfo()

def _col(year, cloud_max):
    return (ee.ImageCollection(L8).merge(ee.ImageCollection(L9))
            .filterBounds(OUTLINE.geometry()).filterDate(f"{year-1}-12-01", f"{year}-05-01")
            .filter(ee.Filter.lt("CLOUD_COVER", cloud_max)))

def year_data(year, cloud_max=30):
    """Composite mùa khô của một năm (12/năm-1 -> 4/năm) + biên khô/ướt + thống kê toàn thành phố."""
    key = ("year", year, cloud_max)
    if (hit := _get(key)):
        return hit
    roi = OUTLINE.geometry()
    col = _col(year, cloud_max)
    meta = ee.FeatureCollection(col.map(lambda i: ee.Feature(None, {
        "id": i.get("system:index"), "sat": i.get("SPACECRAFT_ID"),
        "date": i.get("DATE_ACQUIRED"), "cloud": i.get("CLOUD_COVER")}))).getInfo()["features"]
    if not meta:
        raise ValueError(f"Năm {year}: không có ảnh Landsat 8/9 phù hợp (mùa khô 12/{year-1}–4/{year}). Hãy tăng ngưỡng mây.")

    comp = col.map(prep).median().clip(roi)                      # ghép ảnh (composite) cả mùa khô
    bins, tmin = edge_stats(comp.select("NDVI"), comp.select("LST"), roi)
    edges = fit_edges(bins, tmin)
    img = comp.addBands(tvdi_image(comp.select("NDVI"), comp.select("LST"), edges))

    raw = img.reduceRegion(reducer=STATS_X, geometry=roi, scale=90, maxPixels=1e10,
                           tileScale=4, bestEffort=True).getInfo() or {}
    city = {b: {k: raw.get(f"{b}_{k}") for k in KEYS_X} for b in INDICES}
    corr = comp.select(["NDVI", "LST"]).reduceRegion(reducer=ee.Reducer.pearsonsCorrelation(), geometry=roi,
                scale=120, maxPixels=1e10, bestEffort=True, tileScale=4).getInfo() or {}
    return _put(key, {"img": img, "n_images": len(meta), "meta": meta, "edges": edges, "city": city, "r": corr.get("correlation")})

def _show(band, index_code, classes):
    lo, hi, pal = VIS[index_code]
    if classes:
        c = ee.Image(0)
        for lo_c, _, _ in classes[1:]:
            c = c.add(band.gte(lo_c))
        return c, {"min": 0, "max": len(classes) - 1, "palette": [x[2] for x in classes]}
    return band, {"min": lo, "max": hi, "palette": pal}

def grid_stats(index_code, year, cloud_max=30):
    key = ("grid", index_code, year, cloud_max)
    if (hit := _get(key)):
        return hit
    band = year_data(year, cloud_max)["img"].select(index_code).rename("v")
    return _put(key, band.reduceRegions(collection=GRID, reducer=STATS, scale=60, tileScale=4).getInfo())

def map_layer(index_code, year, cloud_max=30, classes=None):
    """classes = [(nguong_duoi, nguong_tren, mau_hex)] từ PhanCap_UHI_Khohan; None = hiển thị liên tục."""
    key = ("map", index_code, year, cloud_max, bool(classes))
    if (hit := _get(key)):
        return hit
    d = year_data(year, cloud_max)
    show, vis = _show(d["img"].select(index_code), index_code, classes)
    lo, hi, pal = VIS[index_code]
    return _put(key, {"tile_url": show.getMapId(vis)["tile_fetcher"].url_format,
                      "geojson": grid_stats(index_code, year, cloud_max), "city": d["city"][index_code],
                      "n_images": d["n_images"], "edges": d["edges"], "r": d["r"], "outline": outline(),
                      "vis": {"min": lo, "max": hi, "palette": pal}})

def _flat(c):
    return [c] if isinstance(c[0], (int, float)) else [p for x in c for p in _flat(x)]

def snapshot_png(index_code, year, cloud_max=30, classes=None, size=1024):
    """Ảnh PNG bản đồ (nền trong suốt ngoài ranh giới) dùng làm bằng chứng màu sắc."""
    show, vis = _show(year_data(year, cloud_max)["img"].select(index_code), index_code, classes)
    url = show.visualize(**vis).getThumbURL({"region": OUTLINE.geometry().bounds(), "dimensions": size, "format": "png"})
    with urllib.request.urlopen(url, timeout=180) as r:
        data = r.read()
    pts = _flat(outline()["features"][0]["geometry"]["coordinates"])
    bbox = ",".join(str(round(v, 5)) for v in (min(p[0] for p in pts), min(p[1] for p in pts),
                                               max(p[0] for p in pts), max(p[1] for p in pts)))
    return data, vis, bbox

def month_data(year, cloud_max=30):
    """Chuỗi theo tháng trong mùa khô: composite từng tháng, TVDI dùng biên khô/ướt của cả mùa."""
    key = ("month", year, cloud_max)
    if (hit := _get(key)):
        return hit
    d, roi, col, out = year_data(year, cloud_max), OUTLINE.geometry(), _col(year, cloud_max), []
    for ym in sorted({m["properties"]["date"][:7] for m in d["meta"]}):
        y, mm = map(int, ym.split("-"))
        s0 = ee.Date.fromYMD(y, mm, 1)
        comp = col.filterDate(s0, s0.advance(1, "month")).map(prep).median().clip(roi)
        ndvi, lst = comp.select("NDVI"), comp.select("LST")
        full = ndvi.addBands(lst).addBands(tvdi_image(ndvi, lst, d["edges"]))
        r = full.reduceRegion(reducer=STATS, geometry=roi, scale=90, maxPixels=1e10,
                              tileScale=4, bestEffort=True).getInfo() or {}
        out.append({"ym": ym, "n": sum(m["properties"]["date"][:7] == ym for m in d["meta"]),
                    "stats": {b: {k: r.get(f"{b}_{k}") for k in KEYS} for b in INDICES}})
    return _put(key, out)

def geotiff_url(index_code, year, cloud_max=30, scale=120):
    img = year_data(year, cloud_max)["img"].select(index_code).toFloat()
    return img.getDownloadURL({"region": OUTLINE.geometry().bounds(), "scale": scale, "crs": "EPSG:4326",
                               "format": "GEO_TIFF", "name": f"{index_code}_{year}"})


# ---------- thống kê theo khu vực / biểu đồ so sánh (tài liệu "Thống kê dữ liệu VT" và "Các loại biểu đồ") ----------
def _label(n):
    l = n.lower().replace("-", " ")
    return "TP.HCM (cũ)" if "ho chi minh" in l else "Bình Dương" if "binh duong" in l else "Bà Rịa – Vũng Tàu" if "ba ria" in l else n

def zones():
    if (h := _get("zones")):
        return h
    gaul = ee.FeatureCollection("FAO/GAUL/2015/level1").filter(ee.Filter.eq("ADM0_NAME", "Viet Nam"))
    sel = [n for n in gaul.aggregate_array("ADM1_NAME").getInfo()
           if any(k in n.lower().replace("-", " ") for k in ("ho chi minh", "binh duong", "ba ria"))]
    return _put("zones", gaul.filter(ee.Filter.inList("ADM1_NAME", sel)))

def zone_stats(year, cloud_max=30):
    key = ("zones", year, cloud_max)
    if (hit := _get(key)):
        return hit
    d = year_data(year, cloud_max)
    feats = d["img"].reduceRegions(collection=zones(), reducer=STATS_X, scale=90, tileScale=4).getInfo()["features"]
    rows = [{"zone": "Toàn thành phố", **{b: d["city"][b] for b in INDICES}}]
    for f in feats:
        p = f["properties"]
        rows.append({"zone": _label(p["ADM1_NAME"]), **{b: {k: p.get(f"{b}_{k}") for k in KEYS_X} for b in INDICES}})
    return _put(key, {"rows": rows, "r": d["r"], "n_images": d["n_images"]})

def triangle_points(year, cloud_max=30):
    d = year_data(year, cloud_max)
    pts = d["img"].select(["NDVI", "LST"]).sample(region=OUTLINE.geometry(), scale=120, numPixels=4000,
                                                   seed=11, tileScale=4).getInfo()["features"]
    return {"pts": [[round(p["properties"]["NDVI"], 3), round(p["properties"]["LST"], 2)] for p in pts
                    if p["properties"].get("NDVI") is not None and p["properties"].get("LST") is not None],
            "edges": d["edges"]}

def histogram(index_code, year, cloud_max=30, bins=40):
    lo, hi, _ = VIS[index_code]
    r = year_data(year, cloud_max)["img"].select(index_code).reduceRegion(
        reducer=ee.Reducer.fixedHistogram(lo, hi, bins), geometry=OUTLINE.geometry(), scale=90,
        maxPixels=1e10, bestEffort=True, tileScale=4).getInfo()
    return [{"x": a, "n": b} for a, b in (r.get(index_code) or next(iter(r.values())))]

WC = {10: "Rừng/cây gỗ", 20: "Cây bụi", 30: "Đồng cỏ", 40: "Đất nông nghiệp", 50: "Đất xây dựng/đô thị",
      60: "Đất trống", 80: "Mặt nước", 90: "Đất ngập nước", 95: "Rừng ngập mặn"}

def class_stats(year, cloud_max=30):
    """Thống kê theo nhóm lớp phủ (ESA WorldCover 2021, dùng chung cho mọi năm)."""
    key = ("lulc", year, cloud_max)
    if (hit := _get(key)):
        return hit
    wc = ee.ImageCollection("ESA/WorldCover/v200").first().select("Map").rename("cls")
    img, out = year_data(year, cloud_max)["img"], {}
    red = (ee.Reducer.mean().combine(ee.Reducer.stdDev(), sharedInputs=True)
           .combine(ee.Reducer.count(), sharedInputs=True).group(groupField=1, groupName="cls"))
    for b in INDICES:
        gr = img.select(b).addBands(wc).reduceRegion(reducer=red, geometry=OUTLINE.geometry(), scale=90,
                                                     maxPixels=1e10, bestEffort=True, tileScale=4).get("groups").getInfo()
        for g_ in gr:
            c = int(g_["cls"])
            out.setdefault(c, {"cls": c, "ten": WC.get(c, f"Lớp {c}")})[b] = {"mean": g_["mean"], "std": g_["stdDev"], "n": g_["count"]}
    return _put(key, sorted(out.values(), key=lambda v: v["cls"]))


# ---------- ranh giới tỉnh / quận huyện + thống kê (chọn vùng trên bản đồ) ----------
def _districts():
    """Quận/huyện của 3 tỉnh/thành cũ (FAO GAUL 2015 cấp 2: địa giới trước sáp nhập, tên không dấu)."""
    if (h := _get("districts")):
        return h
    gaul = ee.FeatureCollection("FAO/GAUL/2015/level2").filter(ee.Filter.eq("ADM0_NAME", "Viet Nam"))
    return _put("districts", gaul.filter(ee.Filter.inList("ADM1_NAME", zones().aggregate_array("ADM1_NAME"))))

def _pack(info):
    out = []
    for f in info["features"]:
        p = f["properties"]
        out.append({"type": "Feature", "geometry": f["geometry"], "properties": {
            "zone": _label(p["ADM1_NAME"]), "name": p.get("ADM2_NAME") or _label(p["ADM1_NAME"]),
            "stats": {b: {k: p.get(f"{b}_{k}") for k in KEYS} for b in INDICES}}})
    return {"type": "FeatureCollection", "features": out}

def region_stats(year, cloud_max=30):
    """Đa giác (đã đơn giản hóa) + thống kê LST/NDVI/TVDI cho từng tỉnh/thành và từng quận/huyện."""
    key = ("regions", year, cloud_max)
    if (hit := _get(key)):
        return hit
    img = year_data(year, cloud_max)["img"]
    def run(fc):
        fc = fc.map(lambda f: ee.Feature(f).simplify(200))
        return _pack(img.reduceRegions(collection=fc, reducer=STATS, scale=90, tileScale=4).getInfo())
    return _put(key, {"provinces": run(zones()), "districts": run(_districts())})


# ---------- tự động hóa: theo dõi ảnh mới + chụp nhanh "hiện tại" ----------
def invalidate(year):
    """Xóa cache của một năm để lần quét tới lấy dữ liệu mới từ GEE."""
    for k in [k for k in _cache if isinstance(k, tuple) and year in k[1:3]]:
        _cache.pop(k, None)

def _day(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).date().isoformat() if ms else None

def scene_signature(year, cloud_max=30):
    """Số ảnh trong cửa sổ mùa khô của `year` + ngày ảnh L8/9 mới nhất phủ vùng (90 ngày qua)."""
    roi, now = OUTLINE.geometry(), ee.Date(int(time.time() * 1000))
    season = _col(year, cloud_max)
    recent = (ee.ImageCollection(L8).merge(ee.ImageCollection(L9)).filterBounds(roi)
              .filterDate(now.advance(-90, "day"), now))
    r = ee.Dictionary({"n": season.size(), "any_last": recent.aggregate_max("system:time_start"),
                       "any_n": recent.size()}).getInfo()
    return {"n": int(r.get("n") or 0), "any_last": _day(r.get("any_last")), "any_n": int(r.get("any_n") or 0)}

def recent_data(days=60, cloud_max=60):
    """Thông số 'hiện tại': ghép ảnh `days` ngày gần nhất (không phụ thuộc mùa khô)."""
    key = ("recent", days, cloud_max)
    if (hit := _get(key)):
        return hit
    roi, end = OUTLINE.geometry(), ee.Date(int(time.time() * 1000))
    col = (ee.ImageCollection(L8).merge(ee.ImageCollection(L9)).filterBounds(roi)
           .filterDate(end.advance(-days, "day"), end).filter(ee.Filter.lt("CLOUD_COVER", cloud_max)))
    meta = [f["properties"] for f in ee.FeatureCollection(col.map(lambda i: ee.Feature(None, {
        "date": i.get("DATE_ACQUIRED")}))).getInfo()["features"]]
    if not meta:
        raise ValueError(f"Không có ảnh Landsat 8/9 (mây < {cloud_max}%) trong {days} ngày gần nhất.")
    comp = col.map(prep).median().clip(roi)
    try:
        edges = fit_edges(*edge_stats(comp.select("NDVI"), comp.select("LST"), roi))
        img = comp.addBands(tvdi_image(comp.select("NDVI"), comp.select("LST"), edges))
    except ValueError:                      # quá ít ảnh để xác định biên khô/ướt -> bỏ TVDI
        img = comp
    raw = img.reduceRegion(reducer=STATS, geometry=roi, scale=90, maxPixels=1e10,
                           tileScale=4, bestEffort=True).getInfo() or {}
    dates = sorted(m["date"] for m in meta)
    return _put(key, {"img": img,
                      "city": {b: {k: raw.get(f"{b}_{k}") for k in KEYS} for b in INDICES},
                      "n_images": len(meta), "from": dates[0], "to": dates[-1]})


def recent_png(index_code, days=60, cloud_max=60, size=800):
    """PNG bản đồ chỉ số của ảnh ghép 'hiện tại' (nền trong suốt ngoài ranh giới)."""
    key = ("rpng", index_code, days, cloud_max, size)
    if (hit := _get(key)):
        return hit
    img = recent_data(days, cloud_max)["img"]
    if index_code not in img.bandNames().getInfo():
        raise ValueError(f"Không có băng {index_code} (quá ít ảnh để xác định biên khô/ướt).")
    show, vis = _show(img.select(index_code), index_code, None)
    url = show.visualize(**vis).getThumbURL({"region": OUTLINE.geometry().bounds(), "dimensions": size, "format": "png"})
    with urllib.request.urlopen(url, timeout=180) as r:
        return _put(key, r.read())

def recent_grid(days=60, cloud_max=60):
    """Vector ô lưới + giá trị trung bình LST/NDVI/TVDI của ảnh ghép 'hiện tại'."""
    key = ("rgrid", days, cloud_max)
    if (hit := _get(key)):
        return hit
    img = recent_data(days, cloud_max)["img"]
    bands = [b for b in INDICES if b in img.bandNames().getInfo()]
    return _put(key, img.select(bands).reduceRegions(collection=GRID, reducer=ee.Reducer.mean(),
                                                     scale=60, tileScale=4).getInfo())