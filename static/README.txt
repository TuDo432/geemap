CẤU TRÚC static/
  index.html               giao diện chính (mục Bản đồ đã gồm cả chế độ toàn màn hình, nút ⛶ ở thanh icon)
  css/  base, cover, layout, map, tables, tools, auto
  js/   core -> nav -> map -> tables -> scan -> series -> analysis -> stats -> charts -> export -> history -> auto -> main
        (THỨ TỰ NẠP trong index.html quan trọng: core đầu tiên, main cuối cùng)
  img/  đặt Logo.png vào đây
Sau khi sửa file, tăng số ?v=1 trong HTML để trình duyệt nạp lại.
Có thể xóa style.css, mapstyle.css, script.js, scriptmap.js, Map.html, map.html, fullmap.js, fullmap.css cũ.

uvicorn app.main:app --reload
