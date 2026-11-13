/* ===== KHỞI ĐỘNG (nạp CUỐI CÙNG, sau khi mọi file khác đã sẵn sàng) ===== */

/* Chart.js: mặc định typography chung cho mọi biểu đồ (cỡ lớn, tương phản cao) */
if(window.Chart){
 Chart.defaults.font.family='system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
 Chart.defaults.font.size=14;
 Chart.defaults.color='#33475c';
 Chart.defaults.plugins.title.font={size:17,weight:'700'};
 Chart.defaults.plugins.title.color='#0b2a4a';
 Chart.defaults.plugins.title.padding={top:4,bottom:16};
 Chart.defaults.plugins.legend.labels.font={size:14.5,weight:'600'};
 Chart.defaults.plugins.legend.labels.color='#22303d';
 Chart.defaults.plugins.legend.labels.usePointStyle=true;
 Chart.defaults.plugins.legend.labels.boxWidth=9;
 Chart.defaults.plugins.legend.labels.padding=16;
 Chart.defaults.plugins.tooltip.backgroundColor='#0b2a4a';
 Chart.defaults.plugins.tooltip.padding=12;
 Chart.defaults.plugins.tooltip.cornerRadius=10;
 Chart.defaults.plugins.tooltip.titleFont={size:15,weight:'700'};
 Chart.defaults.plugins.tooltip.bodyFont={size:14};
 Chart.defaults.elements.line.borderWidth=2.5;
 Chart.defaults.elements.point.radius=3;
 Chart.defaults.elements.point.hoverRadius=6.5;
}

/* điền danh sách năm vào các ô chọn */
for(const id of ['yr','ey','sy','cy']){for(let y=Y;y>=2016;y--)$(id).add(new Option(y,y));$(id).value=Math.min(2025,Y);}
$('y2').value=Y;
(()=>{const hy=$('hy');hy.add(new Option('Tất cả',''));for(let y=Y;y>=2016;y--)hy.add(new Option(y,y));})();

/* thang màu (nổi trên bản đồ) */
function drawScale(c){
 $('scale').innerHTML=IDX.map(k=>{const v=VISJS[k],n=v.palette.length,st=(v.max-v.min)/n,d=k==='LST'?1:2;
  return `<div class="sc-row"><div class="sc-name"><b>${k}</b> · ${NM[k].split('– ')[1]} <span>(${v.min} → ${v.max})</span></div>
  <div class="sc-bar">${v.palette.map(p=>`<i style="background:${p}"></i>`).join('')}</div>
  <div class="sc-tick">${v.palette.map((p,i)=>`<span>${(v.min+st*i).toFixed(d)}</span>`).join('')}</div></div>`;}).join('');
 const rows=['TVDI','LST'].flatMap(k=>(c[k]||[]).map(x=>({k,...x})));
 $('clsTab').innerHTML=rows.length?tbl([T('k','Chỉ số'),T('name','Mức độ'),T('lo','Từ'),T('hi','Đến'),{k:'color',l:'Màu',f:v=>`<span class="sw" style="background:${v}"></span>`}],rows):'';}

 drawScale({});   // vẽ ngay thang màu mặc định, không chờ server
(async()=>{
  try{
    const c=await J('/api/classes');
    if(c.vis)VISJS=c.vis;
    CLS=c;
    drawScale(c);   // vẽ lại, lúc này có thêm bảng phân cấp từ CSDL
  }catch(e){console.error('Không tải được /api/classes:',e);}
})();

/* khôi phục trạng thái mở/thu nhỏ của thang màu */
try{if(localStorage.getItem('scaleOn')==='1')toggleScale(true);}catch(e){}

/* thanh trượt độ trong suốt lớp chỉ số: chỉ gắn khi thanh trượt tồn tại trong index.html */
(()=>{const el=$('op');if(!el)return;
 el.addEventListener('input',()=>{if(geeLayer)geeLayer.setOpacity(opacityNow());});})();

/* tải dữ liệu ban đầu */
render();loadAll();
fetch('/api/scan/status').then(r=>r.json()).then(s=>{if(s.running){$('scan').disabled=true;poll();}});