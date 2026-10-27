from sqlalchemy import text, inspect
from app.db import engine

STEPS = [
    "ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Che_Do VARCHAR(10) NOT NULL DEFAULT 'NAM'",
    "ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Thang_BatDau VARCHAR(7)",
    "ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Thang_KetThuc VARCHAR(7)",
    "ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Nguong_May_Max INT",
    "ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Ghi_Chu VARCHAR(500)",
    """CREATE TABLE IF NOT EXISTS ChiSo_MoiTruong_TheoThang (
        Thang_Nam VARCHAR(7) PRIMARY KEY, Nam INT NOT NULL,
        LST_TrungBinh DECIMAL(5,2), NDVI_TrungBinh DECIMAL(4,3), TVDI_TrungBinh DECIMAL(4,3),
        SoAnh INT, Ma_KhuVuc VARCHAR(20) DEFAULT 'HCM_ROI')""",
    "CREATE TABLE IF NOT EXISTS TuDong_CauHinh (Khoa VARCHAR(30) PRIMARY KEY, GiaTri VARCHAR(100))",
    """CREATE TABLE IF NOT EXISTS TuDong_NhatKy (
        Ma_NhatKy_TD INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        ThoiGian TIMESTAMP DEFAULT NOW(), Nguon VARCHAR(20), Su_Kien VARCHAR(20), Nam INT,
        So_Anh_MuaKho INT, So_Anh_Moi INT, Ngay_Anh_MoiNhat DATE, Ma_LuotQuet INT,
        TrangThai VARCHAR(30), Muc_Do VARCHAR(20),
        D_LST DOUBLE PRECISION, D_NDVI DOUBLE PRECISION, D_TVDI DOUBLE PRECISION, GhiChu TEXT)""",
    """CREATE TABLE IF NOT EXISTS TuDong_ChupNhanh (
        Ma_ChupNhanh INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        ThoiGian TIMESTAMP DEFAULT NOW(), Ngay_BatDau DATE, Ngay_KetThuc DATE, Ngay_Anh_MoiNhat DATE,
        So_Anh INT, LST_TB DOUBLE PRECISION, LST_Min DOUBLE PRECISION, LST_Max DOUBLE PRECISION,
        LST_DoLech DOUBLE PRECISION, NDVI_TB DOUBLE PRECISION, TVDI_TB DOUBLE PRECISION,
        Muc_LST VARCHAR(50), Muc_TVDI VARCHAR(50))""",
]
AFTER_BOSUNG = [
    "ALTER TABLE KetQua_ThongKe ADD COLUMN IF NOT EXISTS Trung_Vi DOUBLE PRECISION",
    "ALTER TABLE KetQua_ThongKe ADD COLUMN IF NOT EXISTS Q1 DOUBLE PRECISION",
    "ALTER TABLE KetQua_ThongKe ADD COLUMN IF NOT EXISTS Q3 DOUBLE PRECISION",
    "ALTER TABLE KetQua_Vung ADD COLUMN IF NOT EXISTS Gi_Z DOUBLE PRECISION",
    "ALTER TABLE KetQua_Vung ADD COLUMN IF NOT EXISTS Gi_Nhom VARCHAR(30)",
]

with engine.connect() as c:
    print("DATABASE:", c.execute(text("select current_database(), current_user, inet_server_port()")).one())
    print("VERSION :", c.execute(text("show server_version")).scalar())

for s in STEPS:
    with engine.begin() as c:
        c.execute(text(s))
print("Đã tạo bảng tự động hóa + cột bổ sung.")

try:   # chạy progis_bosung.sql nếu nằm cạnh script này
    sql = open("progis_bosung.sql", encoding="utf-8").read()
    with engine.begin() as c:
        c.exec_driver_sql(sql)
    print("Đã chạy progis_bosung.sql")
except FileNotFoundError:
    print("Bỏ qua progis_bosung.sql (không thấy file trong thư mục này)")
except Exception as e:
    print("progis_bosung.sql LỖI:", str(getattr(e, "orig", e)).splitlines()[0])

for s in AFTER_BOSUNG:
    try:
        with engine.begin() as c:
            c.execute(text(s))
    except Exception as e:
        print("Bỏ qua:", str(getattr(e, "orig", e)).splitlines()[0])

print("CÁC BẢNG HIỆN CÓ:", sorted(inspect(engine).get_table_names()))