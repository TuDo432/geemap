"""Công thức chỉ số viễn thám (Landsat 8/9 Collection 2 Level-2) - đề cương mục 6.2-6.5."""
import ee

L8, L9 = "LANDSAT/LC08/C02/T1_L2", "LANDSAT/LC09/C02/T1_L2"
INDICES = ("NDVI", "LST", "TVDI")
VIS = {  # (min, max, palette) theo tài liệu "Thang màu Nhiệt độ - NDVI - TVDI"
    "LST":  (20, 45, ["#0000FF", "#0066FF", "#00FFFF", "#00FF00", "#FFFF00", "#FFCC00", "#FF6600", "#FF0000"]),
    "NDVI": (-0.2, 1, ["#FF0000", "#FF7F00", "#FFFF00", "#ADFF2F", "#00FF00", "#00FFFF", "#007FFF", "#0000FF"]),
    "TVDI": (0, 1, ["#066b00", "#0bc400", "#0ce100", "#00ff00", "#ffff00", "#ffcc00", "#ff6600", "#ff0000"]),
}

def prep(img):
    """Lọc mây/bóng mây/bão hòa bằng QA_PIXEL (CFMask) + QA_RADSAT, rồi tính NDVI và LST (°C)."""
    # bit0 fill, bit1 dilated cloud, bit2 cirrus, bit3 cloud, bit4 shadow -> 0b11111 = 31
    ok = img.select("QA_PIXEL").bitwiseAnd(31).eq(0).And(img.select("QA_RADSAT").eq(0))
    sr = img.select(["SR_B4", "SR_B5"]).multiply(0.0000275).add(-0.2)           # scale/offset phản xạ bề mặt
    ndvi = sr.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI")            # (NIR-Red)/(NIR+Red)
    lst = (img.select("ST_B10").multiply(0.00341802).add(149.0)                  # scale/offset nhiệt -> Kelvin
           .subtract(273.15).rename("LST"))                                      # Kelvin -> °C
    ok = ok.And(lst.gt(10)).And(lst.lt(70))
    return ndvi.addBands(lst).updateMask(ok).copyProperties(img, ["system:time_start"])

def fit_edges(bins, tmin, step=0.05, min_n=200):
    """Không gian Ts/NDVI (Sandholt 2002). bins = [(chỉ_số_khoảng_NDVI, LST_phân_vị_99, số_pixel)].
    Biên khô: hồi quy tuyến tính Ts_max = a + b*NDVI trên phân vị 99% LST của từng khoảng NDVI.
    Biên ướt: hằng số Ts_min = phân vị 1% của LST."""
    pts = sorted((k * step + step / 2, t) for k, t, n in bins if t is not None and n >= min_n)
    if len(pts) < 4:
        raise ValueError("Không đủ khoảng NDVI hợp lệ để xác định biên khô/ướt.")
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return {"a": my - b * mx, "b": b, "tmin": tmin, "bins": len(pts)}

def edge_stats(ndvi, lst, roi):
    """Tính trên GEE (không tải điểm mẫu về): phân vị 99% LST theo từng khoảng NDVI 0.05 và phân vị 1% LST."""
    land = ndvi.gte(0).And(ndvi.lt(0.9))
    binimg = ndvi.divide(0.05).floor().int().rename("bin")
    red = (ee.Reducer.percentile([99]).combine(ee.Reducer.count(), sharedInputs=True)
           .group(groupField=1, groupName="bin"))
    kw = dict(geometry=roi, scale=120, maxPixels=1e10, bestEffort=True, tileScale=4)
    groups = (lst.addBands(binimg).updateMask(land).reduceRegion(reducer=red, **kw).get("groups").getInfo())
    bins = []
    for g in groups:
        pv = next((v for k, v in g.items() if k.startswith("p")), None)
        bins.append((int(g["bin"]), pv, g.get("count") or 0))
    t1 = lst.updateMask(ndvi.gte(0)).reduceRegion(reducer=ee.Reducer.percentile([1]), **kw).getInfo()
    return bins, next(iter(t1.values()))

def tvdi_image(ndvi, lst, e):
    """TVDI = (Ts - Ts_min) / (Ts_max - Ts_min), giới hạn [0,1]; mặt nước (NDVI<0) bị che."""
    tmax = ndvi.multiply(e["b"]).add(e["a"]).max(e["tmin"] + 1.0)
    return (lst.subtract(e["tmin"]).divide(tmax.subtract(e["tmin"]))
            .clamp(0, 1).updateMask(ndvi.gte(0)).rename("TVDI"))