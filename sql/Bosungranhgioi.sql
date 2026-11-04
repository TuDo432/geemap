-- Cập nhật mô tả ranh giới sang địa giới TP.HCM sau sáp nhập. Chạy lại nhiều lần được.
UPDATE ThongSo_KyThuat SET
  GiaTri = 'Ranh giới TP.HCM sau sáp nhập 01/07/2025 (shapefile 34 tỉnh/thành): 167 phường/xã, bỏ đặc khu Côn Đảo (vĩ độ < 10,0°)',
  MoTa   = 'Hợp nhất TP.HCM cũ + Bình Dương + Bà Rịa–Vũng Tàu; vùng cũ gán theo FAO GAUL 2015 cấp 1'
WHERE Ma_ThongSo = 'DL_ROI';
UPDATE RanhGioi_HanhChinh SET Ten_KhuVuc = 'TP. Hồ Chí Minh (sau sáp nhập, không gồm Côn Đảo)' WHERE Ma_KhuVuc = 'HCM_ROI';
-- DienTich_Km2 sẽ tự cập nhật ở lần quét kế tiếp (main.py gọi area_km2()).