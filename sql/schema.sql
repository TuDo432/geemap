-- Chạy SAU WebGIS.sql. Bổ sung chuỗi thời gian theo tháng (đề cương mục 6.6 / 7.7).
-- Lưu ý: nếu chạy lại WebGIS.sql thì phải DROP bảng này trước (vì có khóa ngoại tới ChiSo_MoiTruong_TheoNam).
USE WebGIS_HCMC_Monitoring;
GO
IF OBJECT_ID('dbo.ChiSo_MoiTruong_TheoThang', 'U') IS NULL
CREATE TABLE ChiSo_MoiTruong_TheoThang (
    Thang_Nam VARCHAR(7) PRIMARY KEY,          -- 'YYYY-MM' (tháng dương lịch)
    Nam INT NOT NULL,                          -- năm của mùa khô (T12 năm trước -> T4)
    LST_TrungBinh DECIMAL(5,2),
    NDVI_TrungBinh DECIMAL(4,3),
    TVDI_TrungBinh DECIMAL(4,3),
    SoAnh INT,
    Ma_KhuVuc VARCHAR(20) DEFAULT 'HCM_ROI',
    CONSTRAINT FK_Thang_ChiSo FOREIGN KEY (Nam) REFERENCES ChiSo_MoiTruong_TheoNam(Nam) ON DELETE CASCADE
);
GO