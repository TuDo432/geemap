import os, time, ee
from dotenv import load_dotenv
load_dotenv()

PROJECT = os.getenv("GEE_PROJECT")
ee.Initialize(project=PROJECT)
OUTLINE_ID = f"projects/{PROJECT}/assets/hcm_outline"
GRID_ID = f"projects/{PROJECT}/assets/hcm_grid"
STEP = 0.05  # độ, khoảng 5.5 km

gaul = (ee.FeatureCollection("FAO/GAUL/2015/level1")
        .filter(ee.Filter.eq("ADM0_NAME", "Viet Nam")))
all_names = sorted(gaul.aggregate_array("ADM1_NAME").getInfo())

def pick(key):
    # bỏ dấu gạch, so khớp không phân biệt hoa thường
    return [n for n in all_names if key in n.lower().replace("-", " ")]

selected = []
for key in ["ho chi minh", "binh duong", "ba ria"]:
    m = pick(key)
    print(f"Từ khóa '{key}' khớp:", m)
    if len(m) != 1:
        print("Toàn bộ tên trong GAUL:", all_names)
        raise SystemExit(f"Từ khóa '{key}' khớp {len(m)} tỉnh, cần đúng 1. Gửi mình danh sách trên.")
    selected.append(m[0])

three = gaul.filter(ee.Filter.inList("ADM1_NAME", selected))

# Gộp 3 tỉnh, chỉ giữ đất liền (vĩ độ > 10.0) nên Côn Đảo tự bị loại
outline = (three.geometry().dissolve(maxError=100)
           .intersection(ee.Geometry.Rectangle([105.5, 10.0, 108.0, 11.8]), maxError=100)
           .simplify(50))
outline_fc = ee.FeatureCollection([ee.Feature(outline, {
    "Code": "HCM", "Name": "TP.HCM (không gồm Côn Đảo)"})])

# Lưới ô vuông phủ vừa khít ranh giới
ring = outline.bounds().coordinates().getInfo()[0]
xs, ys = [p[0] for p in ring], [p[1] for p in ring]
cells, n, y = [], 0, min(ys)
while y < max(ys):
    x = min(xs)
    while x < max(xs):
        n += 1
        cells.append(ee.Feature(ee.Geometry.Rectangle([x, y, x + STEP, y + STEP]),
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
export(grid_fc, GRID_ID, "hcm_grid")
print("Số ô lưới:", ee.FeatureCollection(GRID_ID).size().getInfo())