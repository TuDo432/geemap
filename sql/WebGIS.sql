-- ==============================================================================
-- 1. TẠO DATABASE VÀ CHUYỂN QUYỀN OWNER VỀ SA (CHỐNG LỖI 15404)
-- ==============================================================================
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'WebGIS_HCMC_Monitoring')
BEGIN
    CREATE DATABASE WebGIS_HCMC_Monitoring;
END
GO

USE WebGIS_HCMC_Monitoring;
GO

-- Gán quyền chủ sở hữu về sa để tạo Database Diagram/ERD không bị lỗi 15404
ALTER AUTHORIZATION ON DATABASE::WebGIS_HCMC_Monitoring TO sa;
GO

-- ==============================================================================
-- 2. XÓA CÁC BẢNG CŨ THEO THỨ TỰ RÀNG BUỘC (NẾU ĐÃ TỒN TẠI)
-- ==============================================================================
IF OBJECT_ID('dbo.ChiTiet_BaoCao', 'U') IS NOT NULL DROP TABLE dbo.ChiTiet_BaoCao;
IF OBJECT_ID('dbo.BaoCao_ThongKe', 'U') IS NOT NULL DROP TABLE dbo.BaoCao_ThongKe;
IF OBJECT_ID('dbo.ChiSo_MoiTruong_TheoNam', 'U') IS NOT NULL DROP TABLE dbo.ChiSo_MoiTruong_TheoNam;
IF OBJECT_ID('dbo.LichSu_QuetDuLieu', 'U') IS NOT NULL DROP TABLE dbo.LichSu_QuetDuLieu;
IF OBJECT_ID('dbo.Anh_VeTinh', 'U') IS NOT NULL DROP TABLE dbo.Anh_VeTinh;
IF OBJECT_ID('dbo.RanhGioi_HanhChinh', 'U') IS NOT NULL DROP TABLE dbo.RanhGioi_HanhChinh;
IF OBJECT_ID('dbo.PhanCap_UHI_Khohan', 'U') IS NOT NULL DROP TABLE dbo.PhanCap_UHI_Khohan;
IF OBJECT_ID('dbo.NhatKy_ThaoTac', 'U') IS NOT NULL DROP TABLE dbo.NhatKy_ThaoTac;
GO

-- ==============================================================================
-- 3. KHỞI TẠO BẢNG & LIÊN KẾT KHÓA NGOẠI (FOREIGN KEYS)
-- ==============================================================================

-- Bảng 1: Ranh giới Hành chính (Khu vực nghiên cứu TP.HCM)
CREATE TABLE RanhGioi_HanhChinh (
    Ma_KhuVuc VARCHAR(20) PRIMARY KEY,
    Ten_KhuVuc NVARCHAR(100) NOT NULL,
    QuocGia NVARCHAR(50) NOT NULL DEFAULT N'Vietnam',
    DienTich_Km2 FLOAT,
    ToaDo_TrungTam VARCHAR(100)
);
GO

-- Bảng 2: Phân cấp Mức độ Đảo nhiệt & Khô hạn
CREATE TABLE PhanCap_UHI_Khohan (
    Ma_PhanCap INT PRIMARY KEY,
    Loai_Chiso VARCHAR(10) NOT NULL,    -- 'LST' hoặc 'TVDI'
    Nguong_Duoi FLOAT NOT NULL,
    Nguong_Tren FLOAT NOT NULL,
    Ten_MucDo NVARCHAR(50) NOT NULL,
    Ma_Mau_Hex VARCHAR(10)
);
GO

-- Bảng 3: Metadata Ảnh Vệ tinh Landsat 8/9
CREATE TABLE Anh_VeTinh (
    Ma_Anh VARCHAR(100) PRIMARY KEY,
    Loai_VeTinh VARCHAR(20) NOT NULL,
    Ngay_ThuNhan DATE NOT NULL,
    Nam_GiamSat INT NOT NULL,
    Mua_GiamSat NVARCHAR(20) DEFAULT N'Mùa khô',
    TyLe_May FLOAT,
    Ma_KhuVuc VARCHAR(20),
    -- Khóa ngoại nối tới RanhGioi_HanhChinh
    CONSTRAINT FK_AnhVeTinh_RanhGioi 
        FOREIGN KEY (Ma_KhuVuc) REFERENCES RanhGioi_HanhChinh(Ma_KhuVuc) ON DELETE CASCADE
);
GO

-- Bảng 4: Lịch sử các Lượt Quét tính toán từ GEE
CREATE TABLE LichSu_QuetDuLieu (
    Ma_LuotQuet INT IDENTITY(1,1) PRIMARY KEY,
    ThoiGian_Quet DATETIME DEFAULT GETDATE(),
    Nam_BatDau INT NOT NULL,
    Nam_KetThuc INT NOT NULL,
    SoLuong_Nam_ThanhCong INT DEFAULT 0,
    TrangThai NVARCHAR(50) DEFAULT N'Thành công',
    ThoiGian_XuLy_Giay FLOAT,
    NguoiThucHien NVARCHAR(100) DEFAULT N'System_User'
);
GO

-- Bảng 5: Kết quả Thống kê Chỉ số Môi trường theo Năm (2016 - 2026)
CREATE TABLE ChiSo_MoiTruong_TheoNam (
    Ma_ThongKe INT IDENTITY(1,1) PRIMARY KEY,
    Nam INT UNIQUE NOT NULL,
    LST_TrungBinh DECIMAL(5, 2) NOT NULL,
    NDVI_TrungBinh DECIMAL(4, 3) NOT NULL,
    TVDI_TrungBinh DECIMAL(4, 3) NOT NULL,
    LST_Min DECIMAL(5, 2),
    LST_Max DECIMAL(5, 2),
    Ngay_CapNhat DATETIME DEFAULT GETDATE(),
    Ma_KhuVuc VARCHAR(20) DEFAULT 'HCM_ROI',
    Ma_LuotQuet INT NULL,
    -- Khóa ngoại nối tới RanhGioi_HanhChinh
    CONSTRAINT FK_ChiSo_RanhGioi 
        FOREIGN KEY (Ma_KhuVuc) REFERENCES RanhGioi_HanhChinh(Ma_KhuVuc),
    -- Khóa ngoại nối tới LichSu_QuetDuLieu
    CONSTRAINT FK_ChiSo_LichSuQuet 
        FOREIGN KEY (Ma_LuotQuet) REFERENCES LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE SET NULL
);
GO

-- Bảng 6: Báo cáo Thống kê Tổng hợp
CREATE TABLE BaoCao_ThongKe (
    Ma_BaoCao INT IDENTITY(1,1) PRIMARY KEY,
    Ten_BaoCao NVARCHAR(200) NOT NULL,
    Ngay_Tao DATETIME DEFAULT GETDATE(),
    DinhDang_File VARCHAR(10) DEFAULT 'CSV',
    DuongDan_File NVARCHAR(500),
    GhiChu NVARCHAR(MAX)
);
GO

-- Bảng 7: Chi tiết Dữ liệu đính kèm Báo cáo
CREATE TABLE ChiTiet_BaoCao (
    Ma_ChiTiet INT IDENTITY(1,1) PRIMARY KEY,
    Ma_BaoCao INT NOT NULL,
    Nam INT NOT NULL,
    LST_TrungBinh DECIMAL(5,2),
    NDVI_TrungBinh DECIMAL(4,3),
    TVDI_TrungBinh DECIMAL(4,3),
    DanhGia_MoiTruong NVARCHAR(200),
    -- Khóa ngoại nối tới BaoCao_ThongKe
    CONSTRAINT FK_ChiTietBaoCao_BaoCao 
        FOREIGN KEY (Ma_BaoCao) REFERENCES BaoCao_ThongKe(Ma_BaoCao) ON DELETE CASCADE,
    -- Khóa ngoại nối tới ChiSo_MoiTruong_TheoNam qua cột Nam
    CONSTRAINT FK_ChiTietBaoCao_ChiSo 
        FOREIGN KEY (Nam) REFERENCES ChiSo_MoiTruong_TheoNam(Nam)
);
GO

-- Bảng 8: Nhật ký Thao tác Người dùng trên WebApp Streamlit (Log độc lập)
CREATE TABLE NhatKy_ThaoTac (
    Ma_NhatKy INT IDENTITY(1,1) PRIMARY KEY,
    ThoiGian DATETIME DEFAULT GETDATE(),
    HanhDong NVARCHAR(100) NOT NULL,
    ChiSo_Chon VARCHAR(20),
    Nam_Chon INT,
    DiaChi_IP VARCHAR(50)
);
GO

-- ==============================================================================
-- 4. CHÈN DỮ LIỆU BAN ĐẦU (SEED DATA)
-- ==============================================================================
INSERT INTO RanhGioi_HanhChinh (Ma_KhuVuc, Ten_KhuVuc, DienTich_Km2, ToaDo_TrungTam)
VALUES ('HCM_ROI', N'Ho Chi Minh City', 2095.0, '10.77, 106.69');

INSERT INTO PhanCap_UHI_Khohan VALUES 
(1, 'TVDI', 0.0, 0.2, N'Không khô hạn', '#0000FF'),
(2, 'TVDI', 0.2, 0.4, N'Khô hạn nhẹ', '#00FF00'),
(3, 'TVDI', 0.4, 0.6, N'Khô hạn vừa', '#FFFF00'),
(4, 'TVDI', 0.6, 0.8, N'Khô hạn nặng', '#FFA500'),
(5, 'TVDI', 0.8, 1.0, N'Khô hạn rất nặng', '#FF0000'),
(6, 'LST', 0.0, 28.0, N'Nhiệt độ thấp', '#0000FF'),
(7, 'LST', 28.0, 32.0, N'Nhiệt độ trung bình', '#FFFF00'),
(8, 'LST', 32.0, 36.0, N'Đảo nhiệt nhẹ', '#FFA500'),
(9, 'LST', 36.0, 50.0, N'Đảo nhiệt mạnh', '#FF0000');
GO