/* ===== KHỞI ĐỘNG (nạp CUỐI CÙNG, sau khi mọi file khác đã sẵn sàng) ===== */

/* điền danh sách năm vào các ô chọn */
for(const id of ['yr','ey','sy','cy']){for(let y=Y;y>=2016;y--)$(id).add(new Option(y,y));$(id).value=Math.min(2025,Y);}
$('y2').value=Y;
(()=>{const hy=$('hy');hy.add(new Option('Tất cả',''));for(let y=Y;y>=2016;y--)hy.add(new Option(y,y));})();

/* thang màu (trang chủ) */
function drawScale(c){
 $('scale').innerHTML=IDX.map(k=>{const v=VISJS[k],n=v.palette.length,st=(v.max-v.min)/n,d=k==='LST'?1:2;
  return `<div style="margin:14px 0"><b>${NM[k]}</b> <span style="color:#666">· dải ${v.min} → ${v.max}</span>
  <div style="display:flex;max-width:760px;margin-top:6px">${v.palette.map(p=>`<div style="flex:1;background:${p};height:26px"></div>`).join('')}</div>
  <div style="display:flex;max-width:760px;font-size:12px;color:#444">${v.palette.map((p,i)=>`<div style="flex:1;text-align:center">${(v.min+st*i).toFixed(d)}</div>`).join('')}</div>
  <div class="hint">Mỗi ô màu ứng với một khoảng ${st.toFixed(k==='LST'?2:3)}${UN[k]} · mã màu: ${v.palette.join(', ')}</div></div>`;}).join('');
 const rows=['TVDI','LST'].flatMap(k=>(c[k]||[]).map(x=>({k,...x})));
 $('clsTab').innerHTML=rows.length?'<b>Phân cấp mức độ (bảng PhanCap_UHI_Khohan)</b>'+tbl([T('k','Chỉ số'),T('name','Mức độ'),T('lo','Từ'),T('hi','Đến'),{k:'color',l:'Màu',f:v=>`<span class="sw" style="background:${v}"></span> ${v}`}],rows):'';}
(async()=>{let c={};try{c=await J('/api/classes');VISJS=c.vis;}catch(e){}CLS=c;drawScale(c);})();

/* thanh trượt độ trong suốt lớp chỉ số: chỉ gắn khi thanh trượt tồn tại trong index.html */
(()=>{const el=$('op');if(!el)return;
 el.addEventListener('input',()=>{if(geeLayer)geeLayer.setOpacity(opacityNow());});})();

/* tải dữ liệu ban đầu */
render();loadAll();
fetch('/api/scan/status').then(r=>r.json()).then(s=>{if(s.running){$('scan').disabled=true;poll();}});

/* nút "⌂ Trang chính" ở map.html trỏ về /#home: bỏ qua bìa, vào thẳng giao diện chính */
if(location.hash==='#home'){enter();history.replaceState(null,'',location.pathname);}
