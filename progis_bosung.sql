-- Chạy SAU progis_2.sql -> progis_1.sql -> progis_bosung.sql. Chạy lại nhiều lần được (idempotent).

-- A. Vá cột còn thiếu (main.py đang ghi vào các cột này)
ALTER TABLE KetQua_ThongKe
    ADD COLUMN IF NOT EXISTS Trung_Vi DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS Q1       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS Q3       DOUBLE PRECISION;
ALTER TABLE KetQua_Vung
    ADD COLUMN IF NOT EXISTS Gi_Z     DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS Gi_Nhom  VARCHAR(30);

-- B. Tự động hóa: cấu hình
CREATE TABLE IF NOT EXISTS TuDong_CauHinh (
    Khoa   VARCHAR(30)  PRIMARY KEY,
    GiaTri VARCHAR(100) NOT NULL
);
INSERT INTO TuDong_CauHinh (Khoa, GiaTri) VALUES
    ('BAT','0'), ('CHU_KY_GIO','12'), ('MAY_MAX','30'), ('CUA_SO_NGAY','60')
ON CONFLICT (Khoa) DO NOTHING;

-- C. Nhật ký kiểm tra + đánh giá tự động
CREATE TABLE IF NOT EXISTS TuDong_NhatKy (
    Ma_NhatKy_TD     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ThoiGian         TIMESTAMP   NOT NULL DEFAULT NOW(),
    Nguon            VARCHAR(20) NOT NULL,   -- 'Tự động' | 'Thủ công'
    Su_Kien          VARCHAR(20) NOT NULL,   -- KIEM_TRA | ANH_MOI | QUET_NAM | LOI
    Nam              INT,
    So_Anh_MuaKho    INT,
    So_Anh_Moi       INT,
    Ngay_Anh_MoiNhat DATE,
    Ma_LuotQuet      INT REFERENCES LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE SET NULL,
    TrangThai        VARCHAR(20),
    Muc_Do           VARCHAR(20),            -- Ổn định | Lưu ý | Cảnh báo
    D_LST            DOUBLE PRECISION,
    D_NDVI           DOUBLE PRECISION,
    D_TVDI           DOUBLE PRECISION,
    GhiChu           TEXT
);
CREATE INDEX IF NOT EXISTS IX_TDNK_ThoiGian ON TuDong_NhatKy (ThoiGian DESC);
CREATE INDEX IF NOT EXISTS IX_TDNK_Nam      ON TuDong_NhatKy (Nam, Ma_NhatKy_TD DESC);

-- D. Chụp nhanh thông số "hiện tại"
CREATE TABLE IF NOT EXISTS TuDong_ChupNhanh (
    Ma_ChupNhanh     INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ThoiGian         TIMESTAMP NOT NULL DEFAULT NOW(),
    Ngay_BatDau      DATE,
    Ngay_KetThuc     DATE,
    Ngay_Anh_MoiNhat DATE,
    So_Anh           INT,
    LST_TB           DOUBLE PRECISION,
    LST_Min          DOUBLE PRECISION,
    LST_Max          DOUBLE PRECISION,
    LST_DoLech       DOUBLE PRECISION,
    NDVI_TB          DOUBLE PRECISION,
    TVDI_TB          DOUBLE PRECISION,
    Muc_LST          VARCHAR(100),
    Muc_TVDI         VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS IX_TDCN_ThoiGian ON TuDong_ChupNhanh (ThoiGian DESC);

-- Bổ sung cột bị mất khi chạy progis_2.sql
ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Che_Do VARCHAR(10) DEFAULT 'NAM';
ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Thang_BatDau VARCHAR(7);
ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Thang_KetThuc VARCHAR(7);
ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Nguong_May_Max INT;

-- Bảng tháng (progis_2 đã xóa)
CREATE TABLE IF NOT EXISTS ChiSo_MoiTruong_TheoThang (
    Thang_Nam VARCHAR(7) PRIMARY KEY,
    Nam INT NOT NULL,
    LST_TrungBinh DECIMAL(5,2),
    NDVI_TrungBinh DECIMAL(4,3),
    TVDI_TrungBinh DECIMAL(4,3),
    SoAnh INT,
    Ma_KhuVuc VARCHAR(20) DEFAULT 'HCM_ROI'
);

-- Các bảng tự động hóa
CREATE TABLE IF NOT EXISTS TuDong_CauHinh (
    Khoa VARCHAR(30) PRIMARY KEY,
    GiaTri VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS TuDong_NhatKy (
    Ma_NhatKy_TD INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ThoiGian TIMESTAMP DEFAULT NOW(),
    Nguon VARCHAR(20),
    Su_Kien VARCHAR(20),
    Nam INT,
    So_Anh_MuaKho INT,
    So_Anh_Moi INT,
    Ngay_Anh_MoiNhat DATE,
    Ma_LuotQuet INT,
    TrangThai VARCHAR(30),
    Muc_Do VARCHAR(20),
    D_LST DOUBLE PRECISION,
    D_NDVI DOUBLE PRECISION,
    D_TVDI DOUBLE PRECISION,
    GhiChu TEXT
);

CREATE TABLE IF NOT EXISTS TuDong_ChupNhanh (
    Ma_ChupNhanh INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ThoiGian TIMESTAMP DEFAULT NOW(),
    Ngay_BatDau DATE,
    Ngay_KetThuc DATE,
    Ngay_Anh_MoiNhat DATE,
    So_Anh INT,
    LST_TB DOUBLE PRECISION,
    LST_Min DOUBLE PRECISION,
    LST_Max DOUBLE PRECISION,
    LST_DoLech DOUBLE PRECISION,
    NDVI_TB DOUBLE PRECISION,
    TVDI_TB DOUBLE PRECISION,
    Muc_LST VARCHAR(50),
    Muc_TVDI VARCHAR(50)
);

ALTER TABLE KetQua_ThongKe ADD COLUMN IF NOT EXISTS Trung_Vi DOUBLE PRECISION;
ALTER TABLE KetQua_ThongKe ADD COLUMN IF NOT EXISTS Q1 DOUBLE PRECISION;
ALTER TABLE KetQua_ThongKe ADD COLUMN IF NOT EXISTS Q3 DOUBLE PRECISION;
ALTER TABLE KetQua_Vung ADD COLUMN IF NOT EXISTS Gi_Z DOUBLE PRECISION;
ALTER TABLE KetQua_Vung ADD COLUMN IF NOT EXISTS Gi_Nhom VARCHAR(30);