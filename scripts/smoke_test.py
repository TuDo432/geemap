"""Chạy thử toàn bộ: .env -> PostgreSQL -> GEE -> tính 1 năm -> lưu DB -> đọc lại.
Cách chạy (tại thư mục gốc D:\\GEE):  python scripts\\smoke_test.py 2025
"""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()
year = int(sys.argv[1]) if len(sys.argv) > 1 else 2025

def step(n, title): print(f"\n[{n}] {title}")

step(1, "Kiểm tra .env")
for k in ("GEE_PROJECT", "GEE_ASSET", "GEE_OUTLINE", "DB_URL"):
    assert os.getenv(k), f"Thiếu biến {k} trong .env"
    print("  OK", k)

step(2, "Kết nối PostgreSQL + kiểm tra bảng của WebGIS.sql")
from sqlalchemy import text
from app.db import engine
need = ["RanhGioi_HanhChinh", "PhanCap_UHI_Khohan", "Anh_VeTinh", "LichSu_QuetDuLieu",
        "ChiSo_MoiTruong_TheoNam", "BaoCao_ThongKe", "ChiTiet_BaoCao", "NhatKy_ThaoTac",
        "ThongSo_KyThuat", "LuotQuet_ThamSo", "KetQua_ThongKe", "HeSo_TinhToan", "KetQua_Vung", "Anh_KetQua", "ChiSo_MoiTruong_TheoThang"]
with engine.connect() as c:
    print("  Database:", c.execute(text("SELECT current_database()")).scalar())
    have = {r[0].lower() for r in c.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"))}
    miss = [t for t in need if t.lower() not in have]
    assert not miss, f"Thiếu bảng {miss} - hãy chạy WebGIS.sql, WebGIS_bosung_pg.sql và kiểm tra DB_URL trỏ đúng geegis"
    print("  Đủ các bảng (gồm bảng bổ sung). Số mức phân cấp:", c.execute(text("SELECT COUNT(*) FROM PhanCap_UHI_Khohan")).scalar(), "(cần 9)")

step(3, "Khởi tạo GEE + kiểm tra asset ranh giới/lưới")
from app import gee_service as g
print("  Số ô lưới:", g.GRID.size().getInfo(), "| Diện tích ROI (km2):", round(g.area_km2(), 1))

step(4, f"Tính LST/NDVI/TVDI năm {year} và lưu vào SQL (có thể mất 1-3 phút)")
from app import main as m
t0 = time.time()
m.JOB.update(running=True, done=0, total=1, ok=0, errors=[], run_id=None)
m._scan(year, year, 30, "year")
print("  ", m.JOB["msg"], "| lỗi:", m.JOB["errors"], f"| {time.time()-t0:.0f}s")
assert m.JOB["ok"] == 1, "Quét thất bại, xem lỗi phía trên"

step(5, "Đọc lại kết quả từ SQL")
with engine.connect() as c:
    print("  ChiSo:", dict(c.execute(text("SELECT * FROM ChiSo_MoiTruong_TheoNam WHERE Nam=:y"), dict(y=year)).first()._mapping))
    print("  Số ảnh Landsat đã lưu:", c.execute(text("SELECT COUNT(*) FROM Anh_VeTinh WHERE Nam_GiamSat=:y"), dict(y=year)).scalar())
    print("  Lượt quét gần nhất:", dict(c.execute(text("SELECT * FROM LichSu_QuetDuLieu ORDER BY Ma_LuotQuet DESC LIMIT 1")).first()._mapping))
    for t in ("KetQua_ThongKe", "HeSo_TinhToan", "KetQua_Vung", "Anh_KetQua", "LuotQuet_ThamSo"):
        print(f"  {t}: {c.execute(text(f'SELECT COUNT(*) FROM {t}')).scalar()} dòng")
print("\nTẤT CẢ OK -> chạy web: python -m uvicorn app.main:app")