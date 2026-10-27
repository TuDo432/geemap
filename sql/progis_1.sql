CREATE TABLE IF NOT EXISTS ChiSo_MoiTruong_TheoThang (
    Thang_Nam VARCHAR(7) PRIMARY KEY,   -- 'YYYY-MM'
    Nam INT NOT NULL,
    LST_TrungBinh DECIMAL(5,2),
    NDVI_TrungBinh DECIMAL(4,3),
    TVDI_TrungBinh DECIMAL(4,3),
    SoAnh INT,
    Ma_KhuVuc VARCHAR(20) DEFAULT 'HCM_ROI',
    CONSTRAINT FK_Thang_ChiSo FOREIGN KEY (Nam)
        REFERENCES ChiSo_MoiTruong_TheoNam(Nam) ON DELETE CASCADE
);