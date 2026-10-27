-- WebGIS_bosung_pg.sql: bản PostgreSQL của WebGIS_bosung.sql. Chạy SAU khi đã chạy Script 1 và Script 2.
-- Có thể chạy lại nhiều lần, không xóa dữ liệu.

-- A. Mở rộng bảng cũ
ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Che_Do VARCHAR(10) NOT NULL DEFAULT 'NAM';
ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Thang_BatDau VARCHAR(7) NULL;
ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Thang_KetThuc VARCHAR(7) NULL;
ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Nguong_May_Max INT NULL;
ALTER TABLE LichSu_QuetDuLieu ADD COLUMN IF NOT EXISTS Ghi_Chu VARCHAR(500) NULL;
ALTER TABLE BaoCao_ThongKe ADD COLUMN IF NOT EXISTS Ma_LuotQuet INT NULL
    REFERENCES LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE SET NULL;

-- B. Thông số kỹ thuật
CREATE TABLE IF NOT EXISTS ThongSo_KyThuat (
    Ma_ThongSo VARCHAR(50) PRIMARY KEY,
    Nhom VARCHAR(30) NOT NULL,
    Ten_ThongSo VARCHAR(150) NOT NULL,
    GiaTri VARCHAR(500) NOT NULL,
    DonVi VARCHAR(30) NULL,
    MoTa VARCHAR(500) NULL,
    Nguon_ThamChieu VARCHAR(200) NULL,
    Ngay_CapNhat TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS LuotQuet_ThamSo (
    Ma_LuotQuet INT NOT NULL,
    Ma_ThongSo VARCHAR(50) NOT NULL,
    GiaTri_TaiThoiDiem VARCHAR(500) NOT NULL,
    CONSTRAINT PK_LuotQuet_ThamSo PRIMARY KEY (Ma_LuotQuet, Ma_ThongSo),
    CONSTRAINT FK_LQTS_LuotQuet FOREIGN KEY (Ma_LuotQuet) REFERENCES LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE CASCADE,
    CONSTRAINT FK_LQTS_ThongSo FOREIGN KEY (Ma_ThongSo) REFERENCES ThongSo_KyThuat(Ma_ThongSo)
);

INSERT INTO ThongSo_KyThuat (Ma_ThongSo,Nhom,Ten_ThongSo,GiaTri,DonVi,MoTa,Nguon_ThamChieu) VALUES
 ('DL_LANDSAT8','Dữ liệu','Bộ ảnh Landsat 8','LANDSAT/LC08/C02/T1_L2',NULL,'Collection 2 Level-2 (phản xạ bề mặt + nhiệt độ bề mặt)','Đề cương 6.1'),
 ('DL_LANDSAT9','Dữ liệu','Bộ ảnh Landsat 9','LANDSAT/LC09/C02/T1_L2',NULL,'Từ 10/2021','Đề cương 6.1'),
 ('DL_ROI','Dữ liệu','Khu vực nghiên cứu','FAO GAUL 2015 cấp 1: TP.HCM + Bình Dương + Bà Rịa–Vũng Tàu, bỏ Côn Đảo (vĩ độ < 10,0°)',NULL,'Tương ứng TP.HCM sau sáp nhập 01/07/2025','Đề cương 1, 6.1'),
 ('DL_MUA_KHO','Dữ liệu','Mùa khô','01/12 năm trước → 30/04',NULL,'Mỗi năm một composite mùa khô','Đề cương 6.2'),
 ('DL_NAM','Dữ liệu','Giai đoạn','2016–2026','năm',NULL,'Đề cương 1'),
 ('DL_MAY_MD','Dữ liệu','Ngưỡng mây cảnh mặc định','30','%','Lọc CLOUD_COVER < ngưỡng','Đề cương 6.2'),
 ('DL_PGP_QUANG','Dữ liệu','Độ phân giải băng quang học','30','m',NULL,'USGS'),
 ('DL_PGP_NHIET','Dữ liệu','Độ phân giải băng nhiệt TIRS (ST_B10)','100 (nội suy về 30)','m',NULL,'USGS'),
 ('TX_QA_PIXEL','Tiền xử lý','Mặt nạ QA_PIXEL','Loại bit 0–4: fill, dilated cloud, cirrus, cloud, cloud shadow',NULL,'bitwiseAnd(31) = 0','Đề cương 6.2'),
 ('TX_QA_RADSAT','Tiền xử lý','Mặt nạ bão hòa bức xạ','QA_RADSAT = 0',NULL,NULL,'Đề cương 6.2'),
 ('TX_GHEP','Tiền xử lý','Phương pháp ghép ảnh','Median composite',NULL,NULL,'Đề cương 6.2'),
 ('TX_LST_HOPLE','Tiền xử lý','Khoảng LST hợp lệ','10 < LST < 70','°C','Loại giá trị bất thường',NULL),
 ('CT_SR_SCALE','Công thức','Hệ số nhân phản xạ bề mặt','0.0000275',NULL,NULL,'USGS Landsat C2 L2'),
 ('CT_SR_OFFSET','Công thức','Độ lệch phản xạ bề mặt','-0.2',NULL,NULL,'USGS Landsat C2 L2'),
 ('CT_ST_SCALE','Công thức','Hệ số nhân nhiệt độ bề mặt','0.00341802',NULL,NULL,'USGS Landsat C2 L2'),
 ('CT_ST_OFFSET','Công thức','Độ lệch nhiệt độ bề mặt','149.0','K',NULL,'USGS Landsat C2 L2'),
 ('CT_KELVIN','Công thức','Hằng số đổi Kelvin → Celsius','273.15',NULL,NULL,NULL),
 ('CT_NDVI','Công thức','NDVI','(SR_B5 − SR_B4) / (SR_B5 + SR_B4)',NULL,NULL,'Đề cương 6.4'),
 ('CT_LST','Công thức','LST','ST_B10 × 0.00341802 + 149.0 − 273.15','°C',NULL,'Đề cương 6.5 / 7.5'),
 ('CT_TVDI','Công thức','TVDI','(Ts − Ts_min) / (Ts_max − Ts_min), Ts_max = a + b·NDVI',NULL,NULL,'Sandholt 2002; Đề cương 7.6'),
 ('TV_BUOC_NDVI','TVDI','Bước khoảng NDVI khi tìm biên khô','0.05',NULL,NULL,NULL),
 ('TV_NDVI_KHOANG','TVDI','Khoảng NDVI dùng để hồi quy','0 ≤ NDVI < 0.9',NULL,'Bỏ mặt nước (NDVI < 0)',NULL),
 ('TV_PV_KHO','TVDI','Phân vị LST xác định biên khô','99','%',NULL,NULL),
 ('TV_PV_UOT','TVDI','Phân vị LST xác định biên ướt (Ts_min)','1','%','Biên ướt là hằng số',NULL),
 ('TV_MIN_PIXEL','TVDI','Số pixel tối thiểu mỗi khoảng NDVI','200','pixel',NULL,NULL),
 ('TV_SCALE','TVDI','Độ phân giải tính biên khô/ướt','120','m',NULL,NULL),
 ('TK_SCALE_TP','Thống kê','Độ phân giải thống kê toàn thành phố','90','m',NULL,NULL),
 ('TK_SCALE_VUNG','Thống kê','Độ phân giải thống kê theo vùng/ô lưới','60','m',NULL,NULL),
 ('TK_BUOC_LUOI','Thống kê','Kích thước ô lưới','0.05','độ (~5,5 km)',NULL,NULL),
 ('TK_CHISO','Thống kê','Đại lượng thống kê','Mean, Min, Max, StdDev, số pixel hợp lệ',NULL,NULL,'Đề cương 7.8'),
 ('TK_CRS','Thống kê','Hệ tọa độ','EPSG:4326',NULL,NULL,NULL)
ON CONFLICT (Ma_ThongSo) DO UPDATE SET
    Nhom=EXCLUDED.Nhom, Ten_ThongSo=EXCLUDED.Ten_ThongSo, GiaTri=EXCLUDED.GiaTri, DonVi=EXCLUDED.DonVi,
    MoTa=EXCLUDED.MoTa, Nguon_ThamChieu=EXCLUDED.Nguon_ThamChieu, Ngay_CapNhat=NOW();

-- C. Kết quả theo từng lượt quét
CREATE TABLE IF NOT EXISTS KetQua_ThongKe (
    Ma_KetQua INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Ma_LuotQuet INT NOT NULL,
    Nam INT NOT NULL,
    Thang_Nam VARCHAR(7) NULL,
    Chi_So VARCHAR(10) NOT NULL,
    TrungBinh DOUBLE PRECISION, Gia_Tri_Min DOUBLE PRECISION, Gia_Tri_Max DOUBLE PRECISION,
    Do_Lech_Chuan DOUBLE PRECISION, So_Pixel BIGINT,
    So_Anh INT NULL,
    Ngay_Tao TIMESTAMP DEFAULT NOW(),
    CONSTRAINT CK_KQTK_ChiSo CHECK (Chi_So IN ('NDVI','LST','TVDI')),
    CONSTRAINT FK_KQTK_LuotQuet FOREIGN KEY (Ma_LuotQuet) REFERENCES LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS UQ_KQTK ON KetQua_ThongKe(Ma_LuotQuet, Chi_So, Nam, Thang_Nam) NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS HeSo_TinhToan (
    Ma_HeSo INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Ma_LuotQuet INT NOT NULL,
    Nam INT NOT NULL,
    Thang_Nam VARCHAR(7) NULL,
    Ten_HeSo VARCHAR(40) NOT NULL,
    GiaTri DOUBLE PRECISION NULL,
    DonVi VARCHAR(20) NULL,
    GhiChu VARCHAR(200) NULL,
    CONSTRAINT FK_HeSo_LuotQuet FOREIGN KEY (Ma_LuotQuet) REFERENCES LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS UQ_HeSo ON HeSo_TinhToan(Ma_LuotQuet, Nam, Thang_Nam, Ten_HeSo) NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS KetQua_Vung (
    Ma_KetQuaVung INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Ma_LuotQuet INT NOT NULL,
    Nam INT NOT NULL,
    Thang_Nam VARCHAR(7) NULL,
    Chi_So VARCHAR(10) NOT NULL,
    Loai_Vung VARCHAR(20) NOT NULL DEFAULT 'Ô lưới',
    Ma_Vung VARCHAR(30) NOT NULL,
    Ten_Vung VARCHAR(100) NULL,
    TrungBinh DOUBLE PRECISION, Gia_Tri_Min DOUBLE PRECISION, Gia_Tri_Max DOUBLE PRECISION,
    Do_Lech_Chuan DOUBLE PRECISION, So_Pixel INT,
    Ma_PhanCap INT NULL,
    Muc_Do VARCHAR(50) NULL,
    Ma_Mau_Hex VARCHAR(10) NULL,
    CONSTRAINT CK_KQV_ChiSo CHECK (Chi_So IN ('NDVI','LST','TVDI')),
    CONSTRAINT FK_KQV_LuotQuet FOREIGN KEY (Ma_LuotQuet) REFERENCES LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE CASCADE,
    CONSTRAINT FK_KQV_PhanCap FOREIGN KEY (Ma_PhanCap) REFERENCES PhanCap_UHI_Khohan(Ma_PhanCap)
);
CREATE UNIQUE INDEX IF NOT EXISTS UQ_KQV ON KetQua_Vung(Ma_LuotQuet, Chi_So, Nam, Thang_Nam, Ma_Vung) NULLS NOT DISTINCT;

-- D. Ảnh bản đồ kết quả
CREATE TABLE IF NOT EXISTS Anh_KetQua (
    Ma_AnhKetQua INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Ma_LuotQuet INT NOT NULL,
    Nam INT NOT NULL,
    Thang_Nam VARCHAR(7) NULL,
    Chi_So VARCHAR(10) NOT NULL,
    Che_Do_HienThi VARCHAR(20) NOT NULL DEFAULT 'Liên tục',
    Gia_Tri_Min DOUBLE PRECISION NULL, Gia_Tri_Max DOUBLE PRECISION NULL,
    Bang_Mau_JSON TEXT NULL,
    Rong_px INT NULL, Cao_px INT NULL, BBox VARCHAR(120) NULL,
    Dinh_Dang VARCHAR(10) NOT NULL DEFAULT 'PNG',
    DuongDan_File VARCHAR(500) NULL,
    NoiDung_Anh BYTEA NULL,
    Ma_Hash CHAR(64) NULL,
    Ngay_Tao TIMESTAMP DEFAULT NOW(),
    CONSTRAINT CK_AKQ_ChiSo CHECK (Chi_So IN ('NDVI','LST','TVDI')),
    CONSTRAINT FK_AKQ_LuotQuet FOREIGN KEY (Ma_LuotQuet) REFERENCES LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS UQ_AKQ ON Anh_KetQua(Ma_LuotQuet, Chi_So, Nam, Thang_Nam, Che_Do_HienThi) NULLS NOT DISTINCT;

-- E. View
CREATE OR REPLACE VIEW vw_KetQua_TheoLuotQuet AS
SELECT Ma_LuotQuet, Nam, Thang_Nam,
  MAX(CASE WHEN Chi_So='LST'  THEN TrungBinh END)     AS LST_TB,
  MAX(CASE WHEN Chi_So='LST'  THEN Gia_Tri_Min END)   AS LST_Min,
  MAX(CASE WHEN Chi_So='LST'  THEN Gia_Tri_Max END)   AS LST_Max,
  MAX(CASE WHEN Chi_So='LST'  THEN Do_Lech_Chuan END) AS LST_DoLech,
  MAX(CASE WHEN Chi_So='NDVI' THEN TrungBinh END)     AS NDVI_TB,
  MAX(CASE WHEN Chi_So='NDVI' THEN Do_Lech_Chuan END) AS NDVI_DoLech,
  MAX(CASE WHEN Chi_So='TVDI' THEN TrungBinh END)     AS TVDI_TB,
  MAX(CASE WHEN Chi_So='TVDI' THEN Do_Lech_Chuan END) AS TVDI_DoLech,
  MAX(So_Anh) AS So_Anh
FROM KetQua_ThongKe GROUP BY Ma_LuotQuet, Nam, Thang_Nam;

CREATE OR REPLACE VIEW vw_LichSu_QuetChiTiet AS
SELECT l.Ma_LuotQuet, l.ThoiGian_Quet, l.Che_Do, l.Nam_BatDau, l.Nam_KetThuc, l.Thang_BatDau, l.Thang_KetThuc,
       l.Nguong_May_Max, l.SoLuong_Nam_ThanhCong, l.TrangThai, l.ThoiGian_XuLy_Giay, l.NguoiThucHien, l.Ghi_Chu,
       (SELECT COUNT(DISTINCT Nam) FROM KetQua_ThongKe k WHERE k.Ma_LuotQuet=l.Ma_LuotQuet) AS So_Nam_CoSoLieu,
       (SELECT COUNT(*) FROM KetQua_Vung v WHERE v.Ma_LuotQuet=l.Ma_LuotQuet)               AS So_Dong_Vung,
       (SELECT COUNT(*) FROM Anh_KetQua a WHERE a.Ma_LuotQuet=l.Ma_LuotQuet)                AS So_Anh_BanDo,
       (SELECT COUNT(*) FROM LuotQuet_ThamSo p WHERE p.Ma_LuotQuet=l.Ma_LuotQuet)           AS So_ThongSo_DaLuu
FROM LichSu_QuetDuLieu l;