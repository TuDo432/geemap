r"""Upload hcm_outline.geojson và hcm_wards.geojson lên Earth Engine (không cần Cloud Storage).

Cách dùng (trong venv, từ thư mục D:\GEEmap):
    python upload_assets.py "D:\\duong_dan\\thu_muc_chua_geojson"
Nếu để trống đường dẫn thì dùng thư mục hiện tại.
"""
import json, sys, os
import ee

PROJECT = "geehcm"
FILES = {"hcm_outline": "hcm_outline.geojson", "hcm_wards": "hcm_wards.geojson"}

folder = sys.argv[1] if len(sys.argv) > 1 else "."
ee.Initialize(project=PROJECT)

for asset_name, fname in FILES.items():
    path = os.path.join(folder, fname)
    with open(path, encoding="utf-8") as f:
        gj = json.load(f)
    feats = [
        ee.Feature(ee.Geometry(ft["geometry"], None, False), ft["properties"])
        for ft in gj["features"]
    ]
    asset_id = f"projects/{PROJECT}/assets/{asset_name}"
    task = ee.batch.Export.table.toAsset(
        collection=ee.FeatureCollection(feats),
        description=f"upload_{asset_name}",
        assetId=asset_id,
    )
    task.start()
    print(f"Đã gửi task: {asset_id} ({len(feats)} đối tượng) - id {task.id}")

print("Xong. Mở tab Tasks trong Code Editor để theo dõi tiến trình.")