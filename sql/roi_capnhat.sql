-- Cập nhật mô tả ROI theo shapefile mới. Chạy 1 lần SAU progis_bosung.sql (chạy lại progis_bosung.sql sẽ ghi đè về mô tả cũ).
UPDATE ThongSo_KyThuat SET
    GiaTri = 'Ranh giới TP.HCM sau sáp nhập 01/07/2025 (shapefile 34 tỉnh/thành, ma_tinh = 79), bỏ đặc khu Côn Đảo; chia theo 167 phường/xã (shapefile phường/xã)',
    MoTa = 'Chỉ dùng ranh giới hành chính mới; không dùng địa giới tỉnh cũ',
    Nguon_ThamChieu = 'Shapefile 34 tỉnh/thành + phường/xã',
    Ngay_CapNhat = NOW()
WHERE Ma_ThongSo = 'DL_ROI';
