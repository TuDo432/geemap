/* ===== ĐIỀU HƯỚNG CHÍNH ===== */
let toolTab='charts';
function enter(){$('cover').style.display='none';$('app').style.display='flex';go('intro');}
function leave(){$('app').style.display='none';$('cover').style.display='flex';}
function go(v){clearInterval(auTimer);
 document.querySelectorAll('.view').forEach(e=>e.classList.toggle('on',e.id==='v-'+v));
 document.querySelectorAll('header [data-v]').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
 if(v==='map'){initMap();map.invalidateSize();setTimeout(()=>map&&map.invalidateSize(),100);}
 if(v==='series')drawSeries();
 if(v==='auto'){loadAuto();auTimer=setInterval(loadAuto,15000);}
 if(v==='tools')setTool(toolTab);}

/* trang Công cụ (biểu đồ so sánh · kiểm chứng & dự báo · dữ liệu & xuất file · lịch sử & ảnh · phân tích) */
function setTool(t){toolTab=t;
 document.querySelectorAll('#toolseg button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
 document.querySelectorAll('.tool-pane').forEach(p=>p.classList.toggle('on',p.id==='tp-'+t));
 if(t==='valid')valid();
 if(t==='ana')drawAna();
 if(t==='hist')loadRuns();}
