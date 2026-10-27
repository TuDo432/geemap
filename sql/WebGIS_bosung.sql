-- ==============================================================================
-- WebGIS_bosung.sql  -  CHẠY SAU WebGIS.sql (có thể chạy lại nhiều lần, KHÔNG xóa dữ liệu)
-- Bổ sung: thông số kỹ thuật · tra ngược lịch sử quét · lưu ảnh bản đồ · quét theo tháng/năm
--          · bảng số liệu theo vùng (đề cương 6.2-6.9, 7.5-7.10)
-- Lưu ý: nếu chạy lại WebGIS.sql (xóa bảng gốc) thì phải chạy khối RESET ở cuối file này TRƯỚC.
-- ==============================================================================
USE WebGIS_HCMC_Monitoring;
GO

-- ------------------------------------------------------------------------------
-- A. MỞ RỘNG BẢNG CŨ
-- ------------------------------------------------------------------------------
-- A1. LichSu_QuetDuLieu: quét theo NĂM hay THÁNG, ngưỡng mây dùng, ghi chú
IF COL_LENGTH('dbo.LichSu_QuetDuLieu','Che_Do') IS NULL
    ALTER TABLE dbo.LichSu_QuetDuLieu ADD Che_Do NVARCHAR(10) NOT NULL CONSTRAINT DF_LichSu_CheDo DEFAULT N'NAM';  -- 'NAM' | 'THANG'
IF COL_LENGTH('dbo.LichSu_QuetDuLieu','Thang_BatDau') IS NULL
    ALTER TABLE dbo.LichSu_QuetDuLieu ADD Thang_BatDau VARCHAR(7) NULL;      -- 'YYYY-MM' khi quét theo tháng
IF COL_LENGTH('dbo.LichSu_QuetDuLieu','Thang_KetThuc') IS NULL
    ALTER TABLE dbo.LichSu_QuetDuLieu ADD Thang_KetThuc VARCHAR(7) NULL;
IF COL_LENGTH('dbo.LichSu_QuetDuLieu','Nguong_May_Max') IS NULL
    ALTER TABLE dbo.LichSu_QuetDuLieu ADD Nguong_May_Max INT NULL;           -- % mây tối đa đã dùng
IF COL_LENGTH('dbo.LichSu_QuetDuLieu','Ghi_Chu') IS NULL
    ALTER TABLE dbo.LichSu_QuetDuLieu ADD Ghi_Chu NVARCHAR(500) NULL;
-- A2. BaoCao_ThongKe: báo cáo xuất từ lượt quét nào
IF COL_LENGTH('dbo.BaoCao_ThongKe','Ma_LuotQuet') IS NULL
    ALTER TABLE dbo.BaoCao_ThongKe ADD Ma_LuotQuet INT NULL
        CONSTRAINT FK_BaoCao_LuotQuet FOREIGN KEY REFERENCES dbo.LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE SET NULL;
GO

-- ------------------------------------------------------------------------------
-- B. THÔNG SỐ KỸ THUẬT (danh mục) + ảnh chụp thông số theo từng lượt quét
-- ------------------------------------------------------------------------------
IF OBJECT_ID('dbo.ThongSo_KyThuat','U') IS NULL
CREATE TABLE dbo.ThongSo_KyThuat (
    Ma_ThongSo   VARCHAR(50)   PRIMARY KEY,
    Nhom         NVARCHAR(30)  NOT NULL,   -- Dữ liệu | Tiền xử lý | Công thức | TVDI | Thống kê
    Ten_ThongSo  NVARCHAR(150) NOT NULL,
    GiaTri       NVARCHAR(500) NOT NULL,
    DonVi        NVARCHAR(30)  NULL,
    MoTa         NVARCHAR(500) NULL,
    Nguon_ThamChieu NVARCHAR(200) NULL,
    Ngay_CapNhat DATETIME DEFAULT GETDATE()
);
GO
IF OBJECT_ID('dbo.LuotQuet_ThamSo','U') IS NULL
CREATE TABLE dbo.LuotQuet_ThamSo (          -- thông số ĐÃ DÙNG tại thời điểm quét -> tái lập được kết quả cũ
    Ma_LuotQuet INT NOT NULL,
    Ma_ThongSo  VARCHAR(50) NOT NULL,
    GiaTri_TaiThoiDiem NVARCHAR(500) NOT NULL,
    CONSTRAINT PK_LuotQuet_ThamSo PRIMARY KEY (Ma_LuotQuet, Ma_ThongSo),
    CONSTRAINT FK_LQTS_LuotQuet FOREIGN KEY (Ma_LuotQuet) REFERENCES dbo.LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE CASCADE,
    CONSTRAINT FK_LQTS_ThongSo  FOREIGN KEY (Ma_ThongSo)  REFERENCES dbo.ThongSo_KyThuat(Ma_ThongSo)
);
GO

MERGE dbo.ThongSo_KyThuat AS t
USING (VALUES
 -- Dữ liệu
 ('DL_LANDSAT8',  N'Dữ liệu', N'Bộ ảnh Landsat 8',  N'LANDSAT/LC08/C02/T1_L2', NULL, N'Collection 2 Level-2 (phản xạ bề mặt + nhiệt độ bề mặt)', N'Đề cương 6.1'),
 ('DL_LANDSAT9',  N'Dữ liệu', N'Bộ ảnh Landsat 9',  N'LANDSAT/LC09/C02/T1_L2', NULL, N'Từ 10/2021', N'Đề cương 6.1'),
 ('DL_ROI',       N'Dữ liệu', N'Khu vực nghiên cứu', N'FAO GAUL 2015 cấp 1: TP.HCM + Bình Dương + Bà Rịa–Vũng Tàu, bỏ Côn Đảo (vĩ độ < 10,0°)', NULL, N'Tương ứng TP.HCM sau sáp nhập 01/07/2025', N'Đề cương 1, 6.1'),
 ('DL_MUA_KHO',   N'Dữ liệu', N'Mùa khô',            N'01/12 năm trước → 30/04', NULL, N'Mỗi năm một composite mùa khô', N'Đề cương 6.2'),
 ('DL_NAM',       N'Dữ liệu', N'Giai đoạn',          N'2016–2026', N'năm', NULL, N'Đề cương 1'),
 ('DL_MAY_MD',    N'Dữ liệu', N'Ngưỡng mây cảnh mặc định', N'30', N'%', N'Lọc CLOUD_COVER < ngưỡng', N'Đề cương 6.2'),
 ('DL_PGP_QUANG', N'Dữ liệu', N'Độ phân giải băng quang học', N'30', N'm', NULL, N'USGS'),
 ('DL_PGP_NHIET', N'Dữ liệu', N'Độ phân giải băng nhiệt TIRS (ST_B10)', N'100 (nội suy về 30)', N'm', NULL, N'USGS'),
 -- Tiền xử lý
 ('TX_QA_PIXEL',  N'Tiền xử lý', N'Mặt nạ QA_PIXEL', N'Loại bit 0–4: fill, dilated cloud, cirrus, cloud, cloud shadow', NULL, N'bitwiseAnd(31) = 0', N'Đề cương 6.2'),
 ('TX_QA_RADSAT', N'Tiền xử lý', N'Mặt nạ bão hòa bức xạ', N'QA_RADSAT = 0', NULL, NULL, N'Đề cương 6.2'),
 ('TX_GHEP',      N'Tiền xử lý', N'Phương pháp ghép ảnh', N'Median composite', NULL, NULL, N'Đề cương 6.2'),
 ('TX_LST_HOPLE', N'Tiền xử lý', N'Khoảng LST hợp lệ', N'10 < LST < 70', N'°C', N'Loại giá trị bất thường', NULL),
 -- Công thức
 ('CT_SR_SCALE',  N'Công thức', N'Hệ số nhân phản xạ bề mặt', N'0.0000275', NULL, NULL, N'USGS Landsat C2 L2'),
 ('CT_SR_OFFSET', N'Công thức', N'Độ lệch phản xạ bề mặt', N'-0.2', NULL, NULL, N'USGS Landsat C2 L2'),
 ('CT_ST_SCALE',  N'Công thức', N'Hệ số nhân nhiệt độ bề mặt', N'0.00341802', NULL, NULL, N'USGS Landsat C2 L2'),
 ('CT_ST_OFFSET', N'Công thức', N'Độ lệch nhiệt độ bề mặt', N'149.0', N'K', NULL, N'USGS Landsat C2 L2'),
 ('CT_KELVIN',    N'Công thức', N'Hằng số đổi Kelvin → Celsius', N'273.15', NULL, NULL, NULL),
 ('CT_NDVI',      N'Công thức', N'NDVI', N'(SR_B5 − SR_B4) / (SR_B5 + SR_B4)', NULL, NULL, N'Đề cương 6.4'),
 ('CT_LST',       N'Công thức', N'LST', N'ST_B10 × 0.00341802 + 149.0 − 273.15', N'°C', NULL, N'Đề cương 6.5 / 7.5'),
 ('CT_TVDI',      N'Công thức', N'TVDI', N'(Ts − Ts_min) / (Ts_max − Ts_min), Ts_max = a + b·NDVI', NULL, NULL, N'Sandholt 2002; Đề cương 7.6'),
 -- TVDI
 ('TV_BUOC_NDVI', N'TVDI', N'Bước khoảng NDVI khi tìm biên khô', N'0.05', NULL, NULL, NULL),
 ('TV_NDVI_KHOANG',N'TVDI', N'Khoảng NDVI dùng để hồi quy', N'0 ≤ NDVI < 0.9', NULL, N'Bỏ mặt nước (NDVI < 0)', NULL),
 ('TV_PV_KHO',    N'TVDI', N'Phân vị LST xác định biên khô', N'99', N'%', NULL, NULL),
 ('TV_PV_UOT',    N'TVDI', N'Phân vị LST xác định biên ướt (Ts_min)', N'1', N'%', N'Biên ướt là hằng số', NULL),
 ('TV_MIN_PIXEL', N'TVDI', N'Số pixel tối thiểu mỗi khoảng NDVI', N'200', N'pixel', NULL, NULL),
 ('TV_SCALE',     N'TVDI', N'Độ phân giải tính biên khô/ướt', N'120', N'm', NULL, NULL),
 -- Thống kê
 ('TK_SCALE_TP',  N'Thống kê', N'Độ phân giải thống kê toàn thành phố', N'90', N'm', NULL, NULL),
 ('TK_SCALE_VUNG',N'Thống kê', N'Độ phân giải thống kê theo vùng/ô lưới', N'60', N'm', NULL, NULL),
 ('TK_BUOC_LUOI', N'Thống kê', N'Kích thước ô lưới', N'0.05', N'độ (~5,5 km)', NULL, NULL),
 ('TK_CHISO',     N'Thống kê', N'Đại lượng thống kê', N'Mean, Min, Max, StdDev, số pixel hợp lệ', NULL, NULL, N'Đề cương 7.8'),
 ('TK_CRS',       N'Thống kê', N'Hệ tọa độ', N'EPSG:4326', NULL, NULL, NULL)
) AS s(Ma,Nhom,Ten,GiaTri,DonVi,MoTa,Nguon)
ON t.Ma_ThongSo = s.Ma
WHEN MATCHED THEN UPDATE SET Nhom=s.Nhom, Ten_ThongSo=s.Ten, GiaTri=s.GiaTri, DonVi=s.DonVi, MoTa=s.MoTa, Nguon_ThamChieu=s.Nguon, Ngay_CapNhat=GETDATE()
WHEN NOT MATCHED THEN INSERT (Ma_ThongSo,Nhom,Ten_ThongSo,GiaTri,DonVi,MoTa,Nguon_ThamChieu) VALUES (s.Ma,s.Nhom,s.Ten,s.GiaTri,s.DonVi,s.MoTa,s.Nguon);
GO

-- ------------------------------------------------------------------------------
-- C. KẾT QUẢ THEO TỪNG LƯỢT QUÉT (KHÔNG GHI ĐÈ -> tra ngược được lịch sử cũ)
--    ChiSo_MoiTruong_TheoNam / TheoThang vẫn là "bản mới nhất" cho giao diện.
-- ------------------------------------------------------------------------------
IF OBJECT_ID('dbo.ChiSo_MoiTruong_TheoThang','U') IS NULL
CREATE TABLE dbo.ChiSo_MoiTruong_TheoThang (
    Thang_Nam VARCHAR(7) PRIMARY KEY,          -- 'YYYY-MM'
    Nam INT NOT NULL,                          -- năm của mùa khô (T12 năm trước -> T4)
    LST_TrungBinh DECIMAL(5,2), NDVI_TrungBinh DECIMAL(4,3), TVDI_TrungBinh DECIMAL(4,3),
    SoAnh INT, Ma_KhuVuc VARCHAR(20) DEFAULT 'HCM_ROI',
    CONSTRAINT FK_Thang_ChiSo FOREIGN KEY (Nam) REFERENCES dbo.ChiSo_MoiTruong_TheoNam(Nam) ON DELETE CASCADE
);
GO
IF OBJECT_ID('dbo.KetQua_ThongKe','U') IS NULL
CREATE TABLE dbo.KetQua_ThongKe (              -- toàn thành phố: mỗi dòng = 1 chỉ số × 1 kỳ × 1 lượt quét
    Ma_KetQua   INT IDENTITY(1,1) PRIMARY KEY,
    Ma_LuotQuet INT NOT NULL,
    Nam         INT NOT NULL,                  -- năm mùa khô
    Thang_Nam   VARCHAR(7) NULL,               -- NULL = cả mùa khô (theo năm); 'YYYY-MM' = theo tháng
    Chi_So      VARCHAR(10) NOT NULL,
    TrungBinh FLOAT, Gia_Tri_Min FLOAT, Gia_Tri_Max FLOAT, Do_Lech_Chuan FLOAT, So_Pixel BIGINT,
    So_Anh INT NULL,
    Ngay_Tao DATETIME DEFAULT GETDATE(),
    CONSTRAINT CK_KQTK_ChiSo CHECK (Chi_So IN ('NDVI','LST','TVDI')),
    CONSTRAINT FK_KQTK_LuotQuet FOREIGN KEY (Ma_LuotQuet) REFERENCES dbo.LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE CASCADE
);
CREATE UNIQUE INDEX UQ_KQTK ON dbo.KetQua_ThongKe(Ma_LuotQuet, Chi_So, Nam, Thang_Nam);
GO
IF OBJECT_ID('dbo.HeSo_TinhToan','U') IS NULL
CREATE TABLE dbo.HeSo_TinhToan (               -- các hệ số tính ra: TVDI_a, TVDI_b, TVDI_Ts_min, R_NDVI_LST, So_Khoang_NDVI, ...
    Ma_HeSo     INT IDENTITY(1,1) PRIMARY KEY,
    Ma_LuotQuet INT NOT NULL,
    Nam         INT NOT NULL,
    Thang_Nam   VARCHAR(7) NULL,
    Ten_HeSo    VARCHAR(40) NOT NULL,
    GiaTri      FLOAT NULL,
    DonVi       NVARCHAR(20) NULL,
    GhiChu      NVARCHAR(200) NULL,
    CONSTRAINT FK_HeSo_LuotQuet FOREIGN KEY (Ma_LuotQuet) REFERENCES dbo.LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE CASCADE
);
CREATE UNIQUE INDEX UQ_HeSo ON dbo.HeSo_TinhToan(Ma_LuotQuet, Nam, Thang_Nam, Ten_HeSo);
GO
IF OBJECT_ID('dbo.KetQua_Vung','U') IS NULL
CREATE TABLE dbo.KetQua_Vung (                 -- theo ô lưới / đơn vị hành chính + MÀU của vùng tại thời điểm quét
    Ma_KetQuaVung INT IDENTITY(1,1) PRIMARY KEY,
    Ma_LuotQuet INT NOT NULL,
    Nam INT NOT NULL,
    Thang_Nam VARCHAR(7) NULL,
    Chi_So VARCHAR(10) NOT NULL,
    Loai_Vung NVARCHAR(20) NOT NULL DEFAULT N'Ô lưới',   -- Ô lưới | Quận/huyện | Phường/xã
    Ma_Vung VARCHAR(30) NOT NULL,
    Ten_Vung NVARCHAR(100) NULL,
    TrungBinh FLOAT, Gia_Tri_Min FLOAT, Gia_Tri_Max FLOAT, Do_Lech_Chuan FLOAT, So_Pixel INT,
    Ma_PhanCap INT NULL,                                  -- mức phân cấp (LST/TVDI); NDVI để NULL
    Muc_Do NVARCHAR(50) NULL,
    Ma_Mau_Hex VARCHAR(10) NULL,                          -- màu chụp lại tại thời điểm quét
    CONSTRAINT CK_KQV_ChiSo CHECK (Chi_So IN ('NDVI','LST','TVDI')),
    CONSTRAINT FK_KQV_LuotQuet FOREIGN KEY (Ma_LuotQuet) REFERENCES dbo.LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE CASCADE,
    CONSTRAINT FK_KQV_PhanCap  FOREIGN KEY (Ma_PhanCap)  REFERENCES dbo.PhanCap_UHI_Khohan(Ma_PhanCap)
);
CREATE UNIQUE INDEX UQ_KQV ON dbo.KetQua_Vung(Ma_LuotQuet, Chi_So, Nam, Thang_Nam, Ma_Vung);
GO

-- ------------------------------------------------------------------------------
-- D. ẢNH BẢN ĐỒ KẾT QUẢ (bằng chứng màu sắc từng năm/tháng, ví dụ 2022, 2023)
-- ------------------------------------------------------------------------------
IF OBJECT_ID('dbo.Anh_KetQua','U') IS NULL
CREATE TABLE dbo.Anh_KetQua (
    Ma_AnhKetQua INT IDENTITY(1,1) PRIMARY KEY,
    Ma_LuotQuet INT NOT NULL,
    Nam INT NOT NULL,
    Thang_Nam VARCHAR(7) NULL,
    Chi_So VARCHAR(10) NOT NULL,
    Che_Do_HienThi NVARCHAR(20) NOT NULL DEFAULT N'Liên tục',   -- Liên tục | Phân loại
    Gia_Tri_Min FLOAT NULL, Gia_Tri_Max FLOAT NULL,
    Bang_Mau_JSON NVARCHAR(MAX) NULL,       -- bảng màu / các cấp phân loại + ngưỡng tại thời điểm quét (PhanCap có thể bị sửa sau này)
    Rong_px INT NULL, Cao_px INT NULL, BBox VARCHAR(120) NULL,
    Dinh_Dang VARCHAR(10) NOT NULL DEFAULT 'PNG',
    DuongDan_File NVARCHAR(500) NULL,       -- file trên đĩa (exports/maps/...)
    NoiDung_Anh VARBINARY(MAX) NULL,        -- (tùy chọn) lưu thẳng ảnh vào CSDL
    Ma_Hash CHAR(64) NULL,                  -- SHA-256 để chứng minh ảnh không bị sửa
    Ngay_Tao DATETIME DEFAULT GETDATE(),
    CONSTRAINT CK_AKQ_ChiSo CHECK (Chi_So IN ('NDVI','LST','TVDI')),
    CONSTRAINT FK_AKQ_LuotQuet FOREIGN KEY (Ma_LuotQuet) REFERENCES dbo.LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE CASCADE
);
CREATE UNIQUE INDEX UQ_AKQ ON dbo.Anh_KetQua(Ma_LuotQuet, Chi_So, Nam, Thang_Nam, Che_Do_HienThi);
GO

-- ------------------------------------------------------------------------------
-- E. VIEW CHO BẢNG SỐ LIỆU / TRA CỨU
-- ------------------------------------------------------------------------------
CREATE OR ALTER VIEW dbo.vw_KetQua_TheoLuotQuet AS     -- bảng số liệu dạng ngang, theo từng lượt quét
SELECT Ma_LuotQuet, Nam, Thang_Nam,
  MAX(CASE WHEN Chi_So='LST'  THEN TrungBinh END)      AS LST_TB,
  MAX(CASE WHEN Chi_So='LST'  THEN Gia_Tri_Min END)    AS LST_Min,
  MAX(CASE WHEN Chi_So='LST'  THEN Gia_Tri_Max END)    AS LST_Max,
  MAX(CASE WHEN Chi_So='LST'  THEN Do_Lech_Chuan END)  AS LST_DoLech,
  MAX(CASE WHEN Chi_So='NDVI' THEN TrungBinh END)      AS NDVI_TB,
  MAX(CASE WHEN Chi_So='NDVI' THEN Do_Lech_Chuan END)  AS NDVI_DoLech,
  MAX(CASE WHEN Chi_So='TVDI' THEN TrungBinh END)      AS TVDI_TB,
  MAX(CASE WHEN Chi_So='TVDI' THEN Do_Lech_Chuan END)  AS TVDI_DoLech,
  MAX(So_Anh) AS So_Anh
FROM dbo.KetQua_ThongKe GROUP BY Ma_LuotQuet, Nam, Thang_Nam;
GO
CREATE OR ALTER VIEW dbo.vw_LichSu_QuetChiTiet AS      -- lịch sử quét kèm số lượng dữ liệu đã lưu
SELECT l.Ma_LuotQuet, l.ThoiGian_Quet, l.Che_Do, l.Nam_BatDau, l.Nam_KetThuc, l.Thang_BatDau, l.Thang_KetThuc,
       l.Nguong_May_Max, l.SoLuong_Nam_ThanhCong, l.TrangThai, l.ThoiGian_XuLy_Giay, l.NguoiThucHien, l.Ghi_Chu,
       (SELECT COUNT(DISTINCT Nam) FROM dbo.KetQua_ThongKe k WHERE k.Ma_LuotQuet=l.Ma_LuotQuet) AS So_Nam_CoSoLieu,
       (SELECT COUNT(*) FROM dbo.KetQua_Vung v WHERE v.Ma_LuotQuet=l.Ma_LuotQuet)               AS So_Dong_Vung,
       (SELECT COUNT(*) FROM dbo.Anh_KetQua a WHERE a.Ma_LuotQuet=l.Ma_LuotQuet)                AS So_Anh_BanDo,
       (SELECT COUNT(*) FROM dbo.LuotQuet_ThamSo p WHERE p.Ma_LuotQuet=l.Ma_LuotQuet)           AS So_ThongSo_DaLuu
FROM dbo.LichSu_QuetDuLieu l;
GO

/* ------------------------------------------------------------------------------
   KHỐI RESET – chạy TRƯỚC khi chạy lại WebGIS.sql (xóa dữ liệu các bảng bổ sung)
   DROP VIEW IF EXISTS dbo.vw_LichSu_QuetChiTiet; DROP VIEW IF EXISTS dbo.vw_KetQua_TheoLuotQuet;
   DROP TABLE IF EXISTS dbo.Anh_KetQua, dbo.KetQua_Vung, dbo.HeSo_TinhToan, dbo.KetQua_ThongKe,
                        dbo.LuotQuet_ThamSo, dbo.ChiSo_MoiTruong_TheoThang, dbo.ThongSo_KyThuat;
   IF COL_LENGTH('dbo.BaoCao_ThongKe','Ma_LuotQuet') IS NOT NULL BEGIN
      ALTER TABLE dbo.BaoCao_ThongKe DROP CONSTRAINT FK_BaoCao_LuotQuet; ALTER TABLE dbo.BaoCao_ThongKe DROP COLUMN Ma_LuotQuet; END
------------------------------------------------------------------------------ */