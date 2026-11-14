/* ===== ĐIỀU HƯỚNG CHÍNH ===== */
let toolTab='charts';
function enter(){$('cover').style.display='none';$('app').style.display='flex';go('map');}
function leave(){$('app').style.display='none';$('cover').style.display='flex';}
function go(v){
 if(!isAdmin()&&['stats','auto','tools'].includes(v))v='map';   // Khách chỉ vào Bản đồ + Chuỗi thời gian
 clearInterval(auTimer);
 document.querySelectorAll('.view').forEach(e=>e.classList.toggle('on',e.id==='v-'+v));
 document.querySelectorAll('header [data-v]').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
 if(v==='map'){initMap();map.invalidateSize();setTimeout(()=>map&&map.invalidateSize(),100);}
 if(v==='series')drawSeries();
 if(v==='auto'){loadAuto();auTimer=setInterval(loadAuto,15000);}
 if(v==='tools')setTool(toolTab);}

/* thang màu nổi trên bản đồ: bấm để mở rộng / thu nhỏ (nhớ trạng thái) */
function toggleScale(on){const p=$('scalePanel'),b=$('scaleBtn');
 on=typeof on==='boolean'?on:!p.classList.contains('on');
 p.classList.toggle('on',on);b.setAttribute('aria-expanded',on);$('scaleArrow').textContent=on?'–':'+';
 try{localStorage.setItem('scaleOn',on?'1':'0');}catch(e){}}

/* trang Công cụ (biểu đồ so sánh · kiểm chứng & dự báo · dữ liệu & xuất file · lịch sử & ảnh · phân tích) */
function setTool(t){toolTab=t;
 document.querySelectorAll('#toolseg button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
 document.querySelectorAll('.tool-pane').forEach(p=>p.classList.toggle('on',p.id==='tp-'+t));
 if(t==='valid')valid();
 if(t==='ana'){loadRegions();drawAna();}   // HÀNH ĐỘNG 2: tải phường/xã theo nhu cầu; có cache thì lấy ngay
 if(t==='hist')loadRuns();}
