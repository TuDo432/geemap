-- Xóa bảng cũ (nếu có)
DROP TABLE IF EXISTS ChiSo_MoiTruong_TheoThang CASCADE;
DROP TABLE IF EXISTS ChiTiet_BaoCao CASCADE;
DROP TABLE IF EXISTS BaoCao_ThongKe CASCADE;
DROP TABLE IF EXISTS ChiSo_MoiTruong_TheoNam CASCADE;
DROP TABLE IF EXISTS LichSu_QuetDuLieu CASCADE;
DROP TABLE IF EXISTS Anh_VeTinh CASCADE;
DROP TABLE IF EXISTS RanhGioi_HanhChinh CASCADE;
DROP TABLE IF EXISTS PhanCap_UHI_Khohan CASCADE;
DROP TABLE IF EXISTS NhatKy_ThaoTac CASCADE;

CREATE TABLE RanhGioi_HanhChinh (
    Ma_KhuVuc VARCHAR(20) PRIMARY KEY,
    Ten_KhuVuc VARCHAR(100) NOT NULL,
    QuocGia VARCHAR(50) NOT NULL DEFAULT 'Vietnam',
    DienTich_Km2 DOUBLE PRECISION,
    ToaDo_TrungTam VARCHAR(100)
);

CREATE TABLE PhanCap_UHI_Khohan (
    Ma_PhanCap INT PRIMARY KEY,
    Loai_Chiso VARCHAR(10) NOT NULL,
    Nguong_Duoi DOUBLE PRECISION NOT NULL,
    Nguong_Tren DOUBLE PRECISION NOT NULL,
    Ten_MucDo VARCHAR(50) NOT NULL,
    Ma_Mau_Hex VARCHAR(10)
);

CREATE TABLE Anh_VeTinh (
    Ma_Anh VARCHAR(100) PRIMARY KEY,
    Loai_VeTinh VARCHAR(20) NOT NULL,
    Ngay_ThuNhan DATE NOT NULL,
    Nam_GiamSat INT NOT NULL,
    Mua_GiamSat VARCHAR(20) DEFAULT 'Mùa khô',
    TyLe_May DOUBLE PRECISION,
    Ma_KhuVuc VARCHAR(20),
    CONSTRAINT FK_AnhVeTinh_RanhGioi
        FOREIGN KEY (Ma_KhuVuc) REFERENCES RanhGioi_HanhChinh(Ma_KhuVuc) ON DELETE CASCADE
);

CREATE TABLE LichSu_QuetDuLieu (
    Ma_LuotQuet INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ThoiGian_Quet TIMESTAMP DEFAULT NOW(),
    Nam_BatDau INT NOT NULL,
    Nam_KetThuc INT NOT NULL,
    SoLuong_Nam_ThanhCong INT DEFAULT 0,
    TrangThai VARCHAR(50) DEFAULT 'Thành công',
    ThoiGian_XuLy_Giay DOUBLE PRECISION,
    NguoiThucHien VARCHAR(100) DEFAULT 'System_User'
);

CREATE TABLE ChiSo_MoiTruong_TheoNam (
    Ma_ThongKe INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Nam INT UNIQUE NOT NULL,
    LST_TrungBinh DECIMAL(5,2) NOT NULL,
    NDVI_TrungBinh DECIMAL(4,3) NOT NULL,
    TVDI_TrungBinh DECIMAL(4,3) NOT NULL,
    LST_Min DECIMAL(5,2),
    LST_Max DECIMAL(5,2),
    Ngay_CapNhat TIMESTAMP DEFAULT NOW(),
    Ma_KhuVuc VARCHAR(20) DEFAULT 'HCM_ROI',
    Ma_LuotQuet INT NULL,
    CONSTRAINT FK_ChiSo_RanhGioi
        FOREIGN KEY (Ma_KhuVuc) REFERENCES RanhGioi_HanhChinh(Ma_KhuVuc),
    CONSTRAINT FK_ChiSo_LichSuQuet
        FOREIGN KEY (Ma_LuotQuet) REFERENCES LichSu_QuetDuLieu(Ma_LuotQuet) ON DELETE SET NULL
);

CREATE TABLE BaoCao_ThongKe (
    Ma_BaoCao INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Ten_BaoCao VARCHAR(200) NOT NULL,
    Ngay_Tao TIMESTAMP DEFAULT NOW(),
    DinhDang_File VARCHAR(10) DEFAULT 'CSV',
    DuongDan_File VARCHAR(500),
    GhiChu TEXT
);

CREATE TABLE ChiTiet_BaoCao (
    Ma_ChiTiet INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    Ma_BaoCao INT NOT NULL,
    Nam INT NOT NULL,
    LST_TrungBinh DECIMAL(5,2),
    NDVI_TrungBinh DECIMAL(4,3),
    TVDI_TrungBinh DECIMAL(4,3),
    DanhGia_MoiTruong VARCHAR(200),
    CONSTRAINT FK_ChiTietBaoCao_BaoCao
        FOREIGN KEY (Ma_BaoCao) REFERENCES BaoCao_ThongKe(Ma_BaoCao) ON DELETE CASCADE,
    CONSTRAINT FK_ChiTietBaoCao_ChiSo
        FOREIGN KEY (Nam) REFERENCES ChiSo_MoiTruong_TheoNam(Nam)
);

CREATE TABLE NhatKy_ThaoTac (
    Ma_NhatKy INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ThoiGian TIMESTAMP DEFAULT NOW(),
    HanhDong VARCHAR(100) NOT NULL,
    ChiSo_Chon VARCHAR(20),
    Nam_Chon INT,
    DiaChi_IP VARCHAR(50)
);

-- Dữ liệu ban đầu
INSERT INTO RanhGioi_HanhChinh (Ma_KhuVuc, Ten_KhuVuc, DienTich_Km2, ToaDo_TrungTam)
VALUES ('HCM_ROI', 'Ho Chi Minh City', 2095.0, '10.77, 106.69');

INSERT INTO PhanCap_UHI_Khohan VALUES
(1, 'TVDI', 0.0, 0.2, 'Không khô hạn', '#0000FF'),
(2, 'TVDI', 0.2, 0.4, 'Khô hạn nhẹ', '#00FF00'),
(3, 'TVDI', 0.4, 0.6, 'Khô hạn vừa', '#FFFF00'),
(4, 'TVDI', 0.6, 0.8, 'Khô hạn nặng', '#FFA500'),
(5, 'TVDI', 0.8, 1.0, 'Khô hạn rất nặng', '#FF0000'),
(6, 'LST', 0.0, 28.0, 'Nhiệt độ thấp', '#0000FF'),
(7, 'LST', 28.0, 32.0, 'Nhiệt độ trung bình', '#FFFF00'),
(8, 'LST', 32.0, 36.0, 'Đảo nhiệt nhẹ', '#FFA500'),
(9, 'LST', 36.0, 50.0, 'Đảo nhiệt mạnh', '#FF0000');