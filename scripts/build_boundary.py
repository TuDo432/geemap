"""Dựng 3 asset GEE từ shapefile hành chính mới (TP.HCM sau sáp nhập 01/07/2025, không gồm Côn Đảo):
   hcm_outline  ranh giới TP.HCM       (từ file 34 tỉnh/thành)
   hcm_wards    167 phường/xã          (từ file phường/xã)
   hcm_grid     lưới 0,05° phủ ranh giới
Bước trước: python scripts/shp_to_geojson.py --shp-dir data/shp   (tạo data/hcm_outline.geojson, data/hcm_wards.geojson)
Sau khi chạy xong, thêm vào .env:  GEE_WARDS=projects/<PROJECT>/assets/hcm_wards
"""
import json, os, time, ee
from dotenv import load_dotenv
load_dotenv()

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = os.getenv("GEE_PROJECT")
ee.Initialize(project=PROJECT)
OUTLINE_ID = f"projects/{PROJECT}/assets/hcm_outline"
WARDS_ID = f"projects/{PROJECT}/assets/hcm_wards"
GRID_ID = f"projects/{PROJECT}/assets/hcm_grid"
STEP = 0.05  # độ, khoảng 5,5 km

def load(name):
    with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
        return json.load(f)

def to_fc(gj):   # geodesic=False: cạnh đa giác là đường thẳng trên hệ tọa độ độ, khớp với shapefile gốc
    return ee.FeatureCollection([ee.Feature(ee.Geometry(f["geometry"], None, False), f["properties"])
                                 for f in gj["features"]])

outline_gj, wards_gj = load("hcm_outline.geojson"), load("hcm_wards.geojson")
outline_fc = to_fc(outline_gj)
outline = outline_fc.geometry()

# lưới ô vuông phủ vừa khít ranh giới
parts = outline_gj["features"][0]["geometry"]["coordinates"]
pts = [c for p in parts for c in p[0]]
xs, ys = [c[0] for c in pts], [c[1] for c in pts]
cells, n, y = [], 0, min(ys)
while y < max(ys):
    x = min(xs)
    while x < max(xs):
        n += 1
        cells.append(ee.Feature(ee.Geometry.Rectangle([x, y, x + STEP, y + STEP], "EPSG:4326", False),
                                {"Code": f"G{n:04d}", "Name": f"Ô {n:04d}"}))
        x += STEP
    y += STEP
grid_fc = ee.FeatureCollection(cells).filterBounds(outline)

def export(fc, asset_id, desc):
    try:
        ee.data.deleteAsset(asset_id)   # cho phép chạy lại nhiều lần
    except Exception:
        pass
    task = ee.batch.Export.table.toAsset(collection=fc, description=desc, assetId=asset_id)
    task.start()
    while task.status()["state"] in ("READY", "RUNNING"):
        print(desc, task.status()["state"]); time.sleep(10)
    print(desc, "->", task.status()["state"], task.status().get("error_message", ""))

export(outline_fc, OUTLINE_ID, "hcm_outline")
export(to_fc(wards_gj), WARDS_ID, "hcm_wards")
export(grid_fc, GRID_ID, "hcm_grid")

print("Số phường/xã:", ee.FeatureCollection(WARDS_ID).size().getInfo())
print("Số ô lưới:", ee.FeatureCollection(GRID_ID).size().getInfo())
print("Diện tích ROI (km2):", round(ee.FeatureCollection(OUTLINE_ID).geometry().area(100).divide(1e6).getInfo(), 1))
print("Nhớ thêm vào .env:  GEE_WARDS=" + WARDS_ID)