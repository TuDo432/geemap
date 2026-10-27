const $=id=>document.getElementById(id), Y=new Date().getFullYear();
for(const id of ['yr','ey','sy','cy']){for(let y=Y;y>=2016;y--)$(id).add(new Option(y,y));$(id).value=Math.min(2025,Y);} $('y2').value=Y;
function enter(){$('cover').style.display='none';$('app').style.display='flex';go('intro');}
function leave(){$('app').style.display='none';$('cover').style.display='flex';}

/* ---------- điều hướng chính ---------- */
let toolTab='charts';
function go(v){clearInterval(auTimer);
 document.querySelectorAll('.view').forEach(e=>e.classList.toggle('on',e.id==='v-'+v));
 document.querySelectorAll('header [data-v]').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
 if(v==='map'){initMap();map.invalidateSize();setTimeout(()=>map.invalidateSize(),100);}
 if(v==='series')drawSeries();
 if(v==='auto'){loadAuto();auTimer=setInterval(loadAuto,15000);}
 if(v==='tools')setTool(toolTab);}

/* trang Công cụ (gộp: biểu đồ so sánh · kiểm chứng & dự báo · dữ liệu & xuất file · lịch sử & ảnh) */
function setTool(t){toolTab=t;
 document.querySelectorAll('#toolseg button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
 document.querySelectorAll('.tool-pane').forEach(p=>p.classList.toggle('on',p.id==='tp-'+t));
 if(t==='valid')valid();
 if(t==='ana')drawAna();
 if(t==='hist')loadRuns();}

/* ---------- bản đồ ---------- */
const VN=[[6,102],[24,118]];              // phạm vi Việt Nam (gồm biển đảo): bản đồ không kéo ra ngoài vùng này
const HCM=[[10.3,106.2],[11.6,107.6]];    // vùng TP.HCM: mặc định phóng vào khi mở bản đồ
let map,ctrl,dyn=[],lastR=null,lastRY=null,lastOutline=null;
let geo=null,region='all',regTok=0,curIdx='LST',curVis=null;      // ranh giới tỉnh/quận huyện + vùng đang chọn
let gridGroup=null,provLayer=null,distLayer=null,maskLayer=null,outlineLayer=null,distLayers={};
const f3=v=>v==null?'–':v.toFixed(3);
const hex2rgb=h=>{const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255];};
function colorAt(t,pal){t=Math.max(0,Math.min(1,t));const k=t*(pal.length-1),i=Math.min(Math.floor(k),pal.length-2),f=k-i,a=hex2rgb(pal[i]),b=hex2rgb(pal[i+1]);return 'rgb('+a.map((v,j)=>Math.round(v+(b[j]-v)*f)).join(',')+')';}
const geomRings=g=>(g.type==='Polygon'?[g.coordinates]:g.coordinates).map(x=>x[0].map(c=>[c[1],c[0]]));
const outlineRings=gj=>gj.features.flatMap(f=>geomRings(f.geometry));

/* Bản đồ chỉ được tạo khi mở mục Bản đồ lần đầu (lúc đó khung bản đồ đã có kích thước thật, tránh lệch vị trí) */
function initMap(){
 if(map)return;
 map=L.map('map',{minZoom:6,maxBounds:VN,maxBoundsViscosity:1}).fitBounds(HCM);
 map.createPane('gee');map.getPane('gee').style.zIndex=250;
 map.createPane('mask');map.getPane('mask').style.zIndex=300;map.getPane('mask').style.pointerEvents='none';
 const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19,bounds:VN,noWrap:true});
 const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles © Esri',maxZoom:19,maxNativeZoom:18,bounds:VN,noWrap:true}).addTo(map);
 ctrl=L.control.layers({'Bản đồ đường':osm,'Ảnh vệ tinh':sat},{},{collapsed:false}).addTo(map);
 const curBox=L.control({position:'bottomleft'});
 curBox.onAdd=()=>{const d=L.DomUtil.create('div','map-btn');d.id='livecur';d.textContent='Rê chuột lên bản đồ để xem giá trị';return d;};curBox.addTo(map);
 map.on('move',liveRefresh);map.on('mousemove',thr(curMove,60));
}
function addLayer(l,name,show=true){dyn.push(l);ctrl.addOverlay(l,name);if(show)l.addTo(map);}
function dropLayer(l){if(!l)return;ctrl.removeLayer(l);map.removeLayer(l);dyn=dyn.filter(x=>x!==l);}
function clearLayers(){dyn.forEach(l=>{ctrl.removeLayer(l);map.removeLayer(l);});dyn=[];gridGroup=provLayer=distLayer=maskLayer=outlineLayer=null;distLayers={};}

/* ---------- thanh icon (kiểu Discord) + cột nội dung bên cạnh bản đồ ---------- */
const PT={ctl:'Bảng điều khiển',year:'Thống kê theo năm',grid:'Ô lưới (bản đồ hiện tại)',dist:'Quận/huyện',live:'Bảng thời gian thực (khung nhìn)',img:'Ảnh Landsat',hist:'Lịch sử quét'};
let sideP='ctl';
const fixMap=()=>setTimeout(()=>map&&map.invalidateSize(),50);
function showSide(p){sideP=p;$('v-map').classList.remove('wide');
 document.querySelectorAll('#rail .rb').forEach(b=>b.classList.toggle('on',b.dataset.p===p));
 $('panel').style.display=p==='ctl'?'block':'none';
 $('datapane').style.display=p==='ctl'?'none':'flex';
 $('side').classList.toggle('data',p!=='ctl');$('dtitle').textContent=PT[p]||'';
 if(p!=='ctl'){tab=p;sortKey=null;render();}
 fixMap();}
function railClick(p){const m=$('v-map');
 if(sideP===p&&!m.classList.contains('wide')){m.classList.add('wide');document.querySelectorAll('#rail .rb').forEach(b=>b.classList.remove('on'));fixMap();}   // bấm lại icon đang chọn: thu gọn cột
 else showSide(p);}

/* ---------- chọn vùng hiển thị: toàn thành phố / từng tỉnh cũ -> quận, huyện ---------- */
const selProv=()=>region==='all'||!geo?null:geo.provinces.features.find(f=>f.properties.zone===region);
function buildMask(){      // làm tối phần ngoài vùng đang xem
 dropLayer(maskLayer);const sel=selProv();
 maskLayer=L.polygon([[[-85,-180],[-85,180],[85,180],[85,-180]],...(sel?geomRings(sel.geometry):outlineRings(lastOutline))],{pane:'mask',stroke:false,fillColor:'#000',fillOpacity:.5,interactive:false});
 addLayer(maskLayer,'Làm tối ngoài vùng');
}
const provStyle=f=>{const on=f.properties.zone===region;return {color:on?'#d32f2f':'#ffeb3b',weight:on?3:1.5,dashArray:on?null:'5 4',fillOpacity:0};};
function buildProvinces(){
 dropLayer(provLayer);
 provLayer=L.geoJSON(geo.provinces,{style:provStyle,onEachFeature:(f,l)=>{
  l.bindTooltip(f.properties.zone+' · bấm để xem quận/huyện',{sticky:true});l.on('click',()=>setRegion(f.properties.zone));}});
 addLayer(provLayer,'Tỉnh/thành (bấm để chọn vùng)');
}
function distStyle(f){const v=((f.properties.stats||{})[curIdx]||{}).mean,fill=$('fill').checked&&v!=null;
 return {color:'#1a237e',weight:.9,fillColor:fill?colorAt((v-curVis.min)/(curVis.max-curVis.min),curVis.palette):'#000',fillOpacity:fill?.55:0};}
function distPopup(p){const s=p.stats||{},v=(b,n)=>s[b]&&s[b].mean!=null?s[b].mean.toFixed(n):'–';
 return `<b>${p.name}</b><br><span class="hint">${p.zone}</span><br>LST TB: ${v('LST',2)} °C<br>NDVI TB: ${v('NDVI',3)}<br>TVDI TB: ${v('TVDI',3)}<br>Số pixel: ${(s[curIdx]||{}).count??'–'}`;}
function buildDistricts(){
 dropLayer(distLayer);distLayer=null;distLayers={};if(!geo||!$('dist').checked)return;
 const only=region!=='all';      // toàn thành phố: chỉ vẽ viền (bấm vào sẽ chọn tỉnh); đã chọn tỉnh: bấm xem từng quận/huyện
 distLayer=L.geoJSON(geo.districts,{filter:f=>!only||f.properties.zone===region,interactive:only,style:distStyle,onEachFeature:(f,l)=>{
  if(!only)return;const p=f.properties;distLayers[p.zone+'|'+p.name]=l;l.bindPopup(distPopup(p));l.bindTooltip(p.name,{sticky:true});
  l.on({mouseover:e=>e.target.setStyle({weight:2.5,color:'#d32f2f'}),mouseout:e=>distLayer.resetStyle(e.target)});}});
 addLayer(distLayer,'Quận/huyện');
}
function applyRegion(fit=true){
 if(!lastOutline||!geo)return;
 provLayer.setStyle(provStyle);buildMask();buildDistricts();
 if(fit){const sel=selProv();map.fitBounds(sel?L.geoJSON(sel).getBounds():outlineLayer.getBounds(),{padding:[20,20]});}
 const m=$('rgmsg');m.className='msg';m.textContent=region==='all'?'Bấm vào một tỉnh/thành trên bản đồ (viền vàng nét đứt) hoặc chọn ở danh sách để xem quận/huyện.':`Đang xem ${region}: bấm vào quận/huyện để xem số liệu, hoặc mở mục "Quận/huyện" ở thanh công cụ bên trái.`;
 if(tab==='dist')render();
}
function setRegion(v){
 region=v;$('rg').value=v;
 if(!geo){const m=$('rgmsg');m.className='msg';m.textContent=lastOutline?'Đang tải ranh giới, vùng sẽ được áp dụng khi tải xong.':'Bấm "Hiển thị bản đồ" trước để tải ranh giới.';return;}
 applyRegion();
}
async function loadRegions(year,cloud){      // ranh giới + thống kê tỉnh/quận huyện (GEE; lần đầu mỗi năm có thể chậm)
 const tok=++regTok,m=$('rgmsg');m.className='msg';m.textContent='Đang tải thống kê quận/huyện từ GEE (lần đầu có thể mất 1–2 phút)...';
 try{const d=await J(`/api/stats/regions?year=${year}&cloud=${cloud}`);if(tok!==regTok)return;
  geo=d;buildProvinces();applyRegion(region!=='all');}
 catch(e){if(tok!==regTok)return;m.className='msg err';m.textContent='Không tải được quận/huyện: '+e.message;}
}
function distRows(){return geo?geo.districts.features.filter(f=>region==='all'||f.properties.zone===region).map(f=>{const p=f.properties,s=p.stats||{};
 return {key:p.zone+'|'+p.name,name:p.name,zone:p.zone,lst:(s.LST||{}).mean,ndvi:(s.NDVI||{}).mean,tvdi:(s.TVDI||{}).mean,n:(s[curIdx]||{}).count};}):[];}

async function run(){
 const btn=$('btn'),msg=$('msg'),idx=$('idx').value;btn.disabled=true;msg.className='';msg.textContent='Đang tính trên GEE (lần đầu mỗi năm có thể mất 1–3 phút)...';
 try{
  const q=new URLSearchParams({index:idx,year:$('yr').value,cloud:$('c').value,classify:$('cls').checked&&idx!=='NDVI'});
  const r=await fetch('/api/map?'+q),d=await r.json();if(!r.ok)throw new Error(d.detail||('Lỗi '+r.status));
  initMap();clearLayers();gridLayers={};geo=null;regTok++;const {min:lo,max:hi,palette:pal}=d.vis;
  curIdx=idx;curVis=d.vis;lastOutline=d.outline;lastR=d.r;lastRY=$('yr').value;
  addLayer(L.tileLayer(d.tile_url,{pane:'gee',opacity:.9}),`${idx} ${$('yr').value} (GEE)`);
  buildMask();
  addLayer(L.geoJSON(d.geojson,{interactive:false,style:f=>{const m=f.properties.mean;return m==null?{fillOpacity:0,weight:0}:{color:'#444',weight:.4,fillColor:colorAt((m-lo)/(hi-lo),pal),fillOpacity:.6};}}),'Ô lưới tô màu theo trung bình',false);
  gridGroup=L.geoJSON(d.geojson,{style:{color:'#333',weight:.5,fillOpacity:0},onEachFeature:(f,l)=>{const p=f.properties;gridLayers[p.Code]=l;
   l.bindPopup(`<b>${p.Name}</b><br>Trung bình: ${f3(p.mean)}<br>Min: ${f3(p.min)} · Max: ${f3(p.max)}<br>Độ lệch chuẩn: ${f3(p.stdDev)}<br>Số pixel: ${p.count??'–'}`);}});
  addLayer(gridGroup,'Ô lưới (bấm xem số liệu)',false);      // mặc định tắt để bấm tỉnh/quận huyện không bị ô lưới chặn
  outlineLayer=L.geoJSON(d.outline,{style:{color:'#d32f2f',weight:2,fillOpacity:0},interactive:false});addLayer(outlineLayer,'Ranh giới TP.HCM');
  /* lớp điểm nóng/lạnh Getis-Ord Gi* (từ d.spatial do backend tính) */
  const gi=(d.spatial&&d.spatial.gi)||{};
  addLayer(L.geoJSON(d.geojson,{interactive:false,style:f=>{const c=giColor((gi[f.properties.Code]||{}).z);return c?{fillColor:c,fillOpacity:.7,weight:.3,color:'#555'}:{fillOpacity:0,weight:0};}}),'Điểm nóng/lạnh Gi* (ô lưới)',false);
  map.fitBounds(outlineLayer.getBounds());map.setMaxBounds(outlineLayer.getBounds().pad(0.6));
  $('m').textContent=f3(d.city.mean);$('sd').textContent=f3(d.city.stdDev);$('mn').textContent=f3(d.city.min);$('mx').textContent=f3(d.city.max);$('n').textContent=d.city.count??'–';
  const cl=d.classes||[];$('legend').style.display=cl.length?'none':'block';$('lg').style.display=cl.length?'none':'flex';
  $('legend').style.background='linear-gradient(to right,'+pal.join(',')+')';$('l0').textContent=lo;$('l1').textContent=hi;
  $('chips').innerHTML=cl.map(c=>`<div><span style="background:${c.color}"></span>${c.name} (${c.lo}–${c.hi})</div>`).join('');$('stats').style.display='block';
  const mo=d.spatial&&d.spatial.moran;
  $('moran').innerHTML=mo?`<b>Moran's I</b> = ${mo.I.toFixed(3)} (z = ${mo.z.toFixed(1)}, p ${mo.p<0.001?'< 0,001':'= '+mo.p.toFixed(3)}) → ${mo.I>0&&mo.p<0.05?'giá trị tụ cụm theo không gian':'chưa thấy tụ cụm rõ rệt'}`:'';
  gridRows=d.geojson.features.map(f=>({...f.properties,gi:(gi[f.properties.Code]||{}).z,nhom:(gi[f.properties.Code]||{}).nhom}));setTab('grid',false);
  const e=d.edges;msg.className=d.db_error?'err':'ok';
  msg.textContent=(d.db_error||'Hoàn tất')+` · ${d.n_images} ảnh Landsat 8/9 · Ts_max = ${e.a.toFixed(1)} ${e.b<0?'−':'+'} ${Math.abs(e.b).toFixed(1)}·NDVI, Ts_min = ${e.tmin.toFixed(1)}°C`;
  loadRegions($('yr').value,$('c').value);       // không chờ: bản đồ đã hiện, quận/huyện tải sau
 }catch(err){msg.className='err';msg.textContent='Lỗi: '+err.message;}finally{btn.disabled=false;}
}

/* ---------- bảng real-time theo khung nhìn + giá trị dưới con trỏ ---------- */
const thr=(f,ms)=>{let t=0,p=null;return(...a)=>{const n=Date.now();if(n-t>=ms){t=n;f(...a);}else{clearTimeout(p);p=setTimeout(()=>{t=Date.now();f(...a);},ms);}};};
const liveRefresh=thr(()=>{if(tab==='live'&&sideP==='live'&&!$('v-map').classList.contains('wide'))render();},200);
const lvl=(k,v)=>{const c=(CLS[k]||[]);for(let i=0;i<c.length;i++)if(v<c[i].hi||i===c.length-1)return c[i].name;return null;};
const fb=f=>f._b||(f._b=L.geoJSON(f).getBounds());
function liveRows(u){
 if(!map)return[];const b=map.getBounds();let rows=[];
 if(u==='cell')rows=gridRows.filter(r=>{const l=gridLayers[r.Code];return l&&r.mean!=null&&b.intersects(l.getBounds());})
  .map(r=>({key:r.Code,name:r.Name,v:r.mean,lo:r.min,hi:r.max,mc:lvl(curIdx,r.mean)||'–'}));
 else if(geo)rows=geo.districts.features.filter(f=>(region==='all'||f.properties.zone===region)&&b.intersects(fb(f)))
  .map(f=>{const p=f.properties,s=(p.stats||{})[curIdx]||{};return {key:p.zone+'|'+p.name,name:p.name+' · '+p.zone,v:s.mean,lo:s.min,hi:s.max,mc:s.mean==null?'–':(lvl(curIdx,s.mean)||'–'),f};});
 const vs=rows.map(r=>r.v).filter(v=>v!=null),d=curIdx==='LST'?2:3;
 $('livesum').innerHTML=vs.length?`<b>${curIdx}</b> trong khung nhìn: <b>${vs.length}</b> đơn vị · TB <b>${fm(vs.reduce((a,b)=>a+b,0)/vs.length,d)}</b> · Min ${fm(Math.min(...vs),d)} · Max ${fm(Math.max(...vs),d)} · zoom ${map.getZoom()}`:'Chưa có dữ liệu trong khung nhìn (bấm "Hiển thị bản đồ" hoặc kéo bản đồ về vùng có dữ liệu).';
 return rows;}
function curMove(e){
 const el=$('livecur');if(!el||!gridRows.length)return;
 for(const r of gridRows){const l=gridLayers[r.Code];if(l&&r.mean!=null&&l.getBounds().contains(e.latlng)){
  el.textContent=`${curIdx}: ${fm(r.mean,curIdx==='LST'?2:3)}${curIdx==='LST'?' °C':''} · ${lvl(curIdx,r.mean)||r.Name} · ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;return;}}
 el.textContent=`Ngoài vùng dữ liệu · ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;}

/* ---------- bảng ---------- */
const N=(k,l,n=3)=>({k,l,f:v=>v==null?'–':Number(v).toFixed(n)}),T=(k,l)=>({k,l,f:v=>v==null?'–':/^\d{4}-\d{2}-\d{2}T/.test(v)?String(v).replace('T',' ').slice(0,19):String(v)});
const YC=[T('Nam','Năm'),N('LST_TrungBinh','LST TB (°C)',2),N('LST_Min','LST min',2),N('LST_Max','LST max',2),N('NDVI_TrungBinh','NDVI TB'),N('TVDI_TrungBinh','TVDI TB'),T('MucLST','Mức LST'),T('MucTVDI','Mức khô hạn')];
const MC=[T('Thang_Nam','Tháng'),T('Nam','Mùa khô năm'),N('LST_TrungBinh','LST TB (°C)',2),N('NDVI_TrungBinh','NDVI TB'),N('TVDI_TrungBinh','TVDI TB'),T('SoAnh','Số ảnh')];
let tab='year',yearRows=[],monthRows=[],gridRows=[],gridLayers={},sortKey=null,sortDir=1,cur={cols:[],rows:[],click:null};
const tbl=(cols,rows,hl)=>'<table><thead><tr>'+cols.map(c=>`<th data-k="${c.k}">${c.l}${sortKey===c.k?(sortDir>0?' ▲':' ▼'):''}</th>`).join('')+'</tr></thead><tbody>'+
 rows.map((r,i)=>`<tr data-i="${i}"${hl&&hl(r)?' class="hl"':''}>`+cols.map(c=>`<td>${c.f(r[c.k])}</td>`).join('')+'</tr>').join('')+'</tbody></table>';
/* open=true: mở cột nội dung ở mục tương ứng; open=false: chỉ cập nhật dữ liệu ngầm (không đổi cột đang xem) */
function setTab(t,open=true){if(open)return showSide(t);tab=t;sortKey=null;render();}
async function render(){
 const w=$('tw');let cols,rows,click=null,hl=null,empty='Chưa có dữ liệu.';
 $('livebar').style.display=tab==='live'?'block':'none';
 try{
  if(tab==='year'){rows=yearRows;cols=YC;empty='Chưa có dữ liệu. Mở ⚙️ Điều khiển và bấm "Quét & lưu".';hl=r=>String(r.Nam)===$('yr').value;click=r=>{$('yr').value=r.Nam;render();};}
  else if(tab==='grid'){rows=gridRows;empty='Bấm "Hiển thị bản đồ" để xem thống kê từng ô lưới.';
   cols=[T('Name','Ô lưới'),N('mean','Trung bình'),N('min','Min'),N('max','Max'),N('stdDev','Độ lệch chuẩn'),N('count','Số pixel',0),N('gi','Gi* (z)',2),T('nhom','Nhóm điểm nóng/lạnh')];
   click=r=>{const l=gridLayers[r.Code];if(l){if(gridGroup&&!map.hasLayer(gridGroup))map.addLayer(gridGroup);map.fitBounds(l.getBounds());l.openPopup();}};}
  else if(tab==='dist'){rows=distRows();empty=geo?'Không có quận/huyện nào trong vùng này.':'Bấm "Hiển thị bản đồ" để tải thống kê quận/huyện.';
   const tx=(k,l)=>({k,l,f:v=>v==null?'–':String(v)});
   cols=[tx('name','Quận/huyện'),tx('zone','Thuộc'),N('lst','LST TB (°C)',2),N('ndvi','NDVI TB'),N('tvdi','TVDI TB'),N('n','Số pixel (chỉ số đang xem)',0)];
   click=r=>{if(region==='all')setRegion(r.zone);const l=distLayers[r.key];if(l){map.fitBounds(l.getBounds());l.openPopup();}};}
  else if(tab==='live'){if(!sortKey){sortKey='v';sortDir=-1;}
   rows=liveRows($('liveU').value);empty='Bấm "Hiển thị bản đồ" để có dữ liệu theo thời gian thực.';
   const tx=(k,l)=>({k,l,f:v=>v==null?'–':String(v)}),d=curIdx==='LST'?2:3;
   cols=[tx('name','Đơn vị'),N('v',curIdx+' TB',d),N('lo','Min',d),N('hi','Max',d),tx('mc','Mức độ')];
   click=r=>{if(r.f){map.fitBounds(fb(r.f));}else{const l=gridLayers[r.key];if(l){if(gridGroup&&!map.hasLayer(gridGroup))map.addLayer(gridGroup);map.fitBounds(l.getBounds());l.openPopup();}}};}
  else if(tab==='img'){w.innerHTML='<div class="empty">Đang tải...</div>';rows=await (await fetch('/api/images?year='+$('yr').value)).json();empty='Năm '+$('yr').value+' chưa có ảnh trong CSDL.';
   cols=[T('Ma_Anh','Mã ảnh'),T('Loai_VeTinh','Vệ tinh'),T('Ngay_ThuNhan','Ngày thu nhận'),N('TyLe_May','Mây (%)',1),T('Mua_GiamSat','Mùa')];}
  else{w.innerHTML='<div class="empty">Đang tải...</div>';rows=await (await fetch('/api/history')).json();empty='Chưa có lượt quét nào.';
   cols=[T('Ma_LuotQuet','Lượt'),T('ThoiGian_Quet','Thời gian'),T('Nam_BatDau','Từ năm'),T('Nam_KetThuc','Đến năm'),T('SoLuong_Nam_ThanhCong','Số năm OK'),T('TrangThai','Trạng thái'),N('ThoiGian_XuLy_Giay','Xử lý (giây)',0)];}
 }catch(e){w.innerHTML='<div class="empty err">Không đọc được dữ liệu từ PostgreSQL.</div>';return;}
 rows=[...rows];if(sortKey){rows.sort((a,b)=>{const x=a[sortKey],y=b[sortKey];return typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??''),undefined,{numeric:true});});if(sortDir<0)rows.reverse();}
 cur={cols,rows,click};w.innerHTML=rows.length?tbl(cols,rows,hl):`<div class="empty">${empty}</div>`;
}
$('tw').addEventListener('click',e=>{const th=e.target.closest('th');if(th){const k=th.dataset.k;sortDir=sortKey===k?-sortDir:1;sortKey=k;return render();}
 const tr=e.target.closest('tr[data-i]');if(tr&&cur.click)cur.click(cur.rows[+tr.dataset.i]);});
function csv(name,cols,rows){if(!rows.length)return alert('Chưa có dữ liệu để xuất.');const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const t=[cols.map(c=>q(c.l)).join(',')].concat(rows.map(r=>cols.map(c=>q(r[c.k])).join(','))).join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+t],{type:'text/csv'}));a.download=name;a.click();}
const dlcsv=()=>csv('bang_'+tab+'.csv',cur.cols,cur.rows);
$('yr').addEventListener('change',()=>{if(tab==='year'||tab==='img')render();});

/* ---------- quét ---------- */
async function scan(){const m=$('smsg');$('scan').disabled=true;m.className='msg';
 try{const r=await fetch(`/api/scan?start=${$('y1').value}&end=${$('y2').value}&cloud=${$('c').value}&mode=${$('mode').value}`,{method:'POST'}),d=await r.json();if(!r.ok)throw new Error(d.detail||('Lỗi '+r.status));poll();}
 catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;$('scan').disabled=false;}}
async function poll(){const s=await (await fetch('/api/scan/status')).json(),m=$('smsg');
 m.textContent=s.msg+(s.errors.length?' · Lỗi: '+s.errors.join(' | '):'');m.className='msg '+(s.errors.length?'err':'ok');
 if(s.running)return setTimeout(poll,4000);$('scan').disabled=false;loadAll();
 m.insertAdjacentHTML('beforeend',' · <a href="#" onclick="go(\'tools\');setTool(\'ana\');return false">Xem phân tích &amp; đánh giá →</a>');}

/* ---------- chuỗi thời gian, kiểm chứng, dự báo ---------- */
let mode='year',chart;
async function loadAll(){try{yearRows=await (await fetch('/api/timeseries')).json();monthRows=await (await fetch('/api/monthly')).json();}catch(e){}
 if(tab==='year')render();drawSeries();valid();
 if(toolTab==='ana')drawAna();}
function setMode(m){mode=m;for(const [id,k] of [['mY','year'],['mM','month'],['mC','combo']])$(id).classList.toggle('on',m===k);drawSeries();}
function ols(x,y){const n=x.length,mx=x.reduce((a,b)=>a+b)/n,my=y.reduce((a,b)=>a+b)/n;let sxx=0,sxy=0;x.forEach((v,i)=>{sxx+=(v-mx)**2;sxy+=(v-mx)*(y[i]-my);});
 const b=sxy/sxx,a=my-b*mx,sd=Math.sqrt(y.reduce((s,v,i)=>s+(v-(a+b*x[i]))**2,0)/Math.max(n-2,1));return {a,b,sd};}
function erf(x){const t=1/(1+.3275911*Math.abs(x)),y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);return x>=0?y:-y;}
function mk(x,y){const n=y.length;let s=0,sl=[];for(let i=0;i<n-1;i++)for(let j=i+1;j<n;j++){s+=Math.sign(y[j]-y[i]);sl.push((y[j]-y[i])/(x[j]-x[i]));}
 const v=n*(n-1)*(2*n+5)/18,z=s>0?(s-1)/Math.sqrt(v):s<0?(s+1)/Math.sqrt(v):0,p=2*(1-.5*(1+erf(Math.abs(z)/Math.SQRT2)));
 sl.sort((a,b)=>a-b);const m=sl.length>>1;return {p,sen:sl.length%2?sl[m]:(sl[m-1]+sl[m])/2};}
const K={LST:'LST_TrungBinh',NDVI:'NDVI_TrungBinh',TVDI:'TVDI_TrungBinh'};
function forecast(){const x=yearRows.map(r=>r.Nam),L=x[x.length-1],o={};for(const k in K)o[k]=ols(x,yearRows.map(r=>+r[K[k]]));
 return [1,2,3].map(h=>{const yv=L+h,r={y:yv};for(const k in K){const v=o[k].a+o[k].b*yv;r[k]=k==='LST'?v:Math.max(0,Math.min(1,v));r[k+'sd']=1.96*o[k].sd;}return r;});}
function drawSeries(){
 const isY=mode!=='month',R=isY?yearRows:monthRows;chart&&chart.destroy();chart=null;
 if(!R.length){$('smsg2').textContent=isY?'Chưa có dữ liệu. Vào mục Bản đồ và bấm "Quét & lưu".':'Chưa có dữ liệu theo tháng. Chạy WebGIS_bosung_pg.sql rồi quét lại.';$('stw').innerHTML='';return;}
 $('smsg2').textContent='';const g=k=>R.map(r=>r[k]==null?null:+r[k]);let labels=R.map(r=>isY?String(r.Nam):r.Thang_Nam);
 const ds=[['LST (°C)','LST_TrungBinh','#d32f2f','y'],['NDVI','NDVI_TrungBinh','#2e7d32','y1'],['TVDI','TVDI_TrungBinh','#f9a825','y1']].map(([l,k,c,ax])=>({label:l,data:g(k),borderColor:c,yAxisID:ax,tension:.2}));
 if(mode==='combo'){ds[1].type='bar';ds[1].backgroundColor='#81c784aa';}   /* biểu đồ kết hợp: cột NDVI + đường LST, TVDI */
 if(mode==='year'&&R.length>=4){const f=forecast(),n=R.length;labels=[...labels,...f.map(r=>String(r.y))];ds.forEach(d=>d.data.push(null,null,null));
  [['LST','#d32f2f','y'],['NDVI','#2e7d32','y1'],['TVDI','#f9a825','y1']].forEach(([k,c,ax],i)=>ds.push({label:k+' (dự báo)',borderColor:c,borderDash:[6,4],yAxisID:ax,pointStyle:'triangle',
   data:[...Array(n-1).fill(null),ds[i].data[n-1],...f.map(r=>r[k])]}));}
 chart=new Chart($('chart'),{type:'line',data:{labels,datasets:ds},options:{scales:{y:{position:'left',title:{display:true,text:'LST (°C)'}},y1:{position:'right',min:0,max:1,grid:{drawOnChartArea:false}}}}});
 sortKey=null;$('stw').innerHTML=tbl(isY?YC:MC,R);}
function valid(){
 const R=yearRows;if(R.length<4){$('vtab').innerHTML='<div class="empty">Cần tối thiểu 4 năm dữ liệu (quét ở mục Bản đồ).</div>';$('ftab').innerHTML='';return;}
 const st=(k,rows=R)=>mk(rows.map(r=>r.Nam),rows.map(r=>+r[k])),f=(v,n)=>Number(v).toFixed(n);
 const L=st(K.LST),T2=st(K.TVDI),s2=R.filter(r=>r.Nam>=2016&&r.Nam<=2020),L2=s2.length>=3?st(K.LST,s2):null,r=lastR;
 const rows=[
  ['Xu hướng LST 2016–2020','[1] Nguyễn Huy Anh và cs. (2021)','LST tăng do bê tông hóa',L2?`Độ dốc Sen = ${f(L2.sen,3)} °C/năm`:'Chưa đủ năm',L2?(L2.sen>0?'Cùng chiều (tăng)':'Khác chiều (không tăng)'):'–'],
  ['Xu hướng LST toàn thành phố','[8] Hà Tuấn Cường (2025)','Tăng không rõ rệt về thống kê (p > 0,05)',`Sen = ${f(L.sen,3)} °C/năm; p = ${f(L.p,3)}`,L.p>0.05?'Cùng kết luận (chưa có ý nghĩa thống kê)':'Khác: xu hướng có ý nghĩa thống kê (p ≤ 0,05)'],
  ['Tương quan NDVI – LST','[9] Hà Tuấn Cường (2025)','Tương quan nghịch, R² > 0,5',r==null?'Chưa tính (bấm "Hiển thị bản đồ" ở mục Bản đồ)':`r = ${f(r,3)}; R² = ${f(r*r,3)} (năm ${lastRY})`,r==null?'–':(r<0&&r*r>0.5?'Phù hợp':'Chưa phù hợp, cần xem lại tiền xử lý')],
  ['Xu hướng khô hạn (TVDI)','[7] Dung và cs. (2025), NDDI Thủ Đức','Khô hạn tăng, liên hệ chu kỳ ENSO',`Sen = ${f(T2.sen,4)}/năm; p = ${f(T2.p,3)}`,'Đối chiếu định tính; cần so thêm với chuỗi ENSO']];
 $('vtab').innerHTML='<table class="v"><thead><tr><th>Nội dung</th><th>Nghiên cứu tham chiếu</th><th>Kết quả tham chiếu</th><th>Kết quả của đề tài</th><th>Nhận xét</th></tr></thead><tbody>'+rows.map(a=>'<tr>'+a.map(c=>`<td>${c}</td>`).join('')+'</tr>').join('')+'</tbody></table>';
 $('ftab').innerHTML='<table><thead><tr><th>Năm</th><th>LST (°C)</th><th>NDVI</th><th>TVDI</th></tr></thead><tbody>'+forecast().map(q=>`<tr><td>${q.y}</td><td>${f(q.LST,2)} ± ${f(q.LSTsd,2)}</td><td>${f(q.NDVI,3)} ± ${f(q.NDVIsd,3)}</td><td>${f(q.TVDI,3)} ± ${f(q.TVDIsd,3)}</td></tr>`).join('')+'</tbody></table>';}

/* ---------- phân tích & đánh giá sau quét ---------- */
const SEV={'-1':['Thông tin','#607d8b'],0:['Ổn định','#2e7d32'],1:['Lưu ý','#f9a825'],2:['Cảnh báo','#c62828']};
const ANAC=[{k:'tt',l:'Tình huống'},{k:'kq',l:'Kết quả'},{k:'muc',l:'Mức'},{k:'dg',l:'Đánh giá'},{k:'kn',l:'Khuyến nghị'}];
let anaRows=[];
const AU_ANA={y:'auAnY',s:'auAnSum',w:'auAnW'};   // vùng hiển thị phân tích ở mục Tự động hóa
function drawAna(ID={y:'anY',s:'ansum',w:'anw'}){
 const sel=$(ID.y),old=sel.value;sel.innerHTML=yearRows.map(r=>r.Nam).reverse().map(y=>`<option>${y}</option>`).join('');
 if(old&&[...sel.options].some(o=>o.value===old))sel.value=old;
 const w=$(ID.w);
 if(yearRows.length<2){w.innerHTML='<div class="empty">Chưa có dữ liệu. Hãy "Quét &amp; lưu" ở mục Bản đồ (tối thiểu 2 năm, nên ≥ 4 năm để xét xu hướng).</div>';$(ID.s).innerHTML='';anaRows=[];return;}
 const Yr=+sel.value,R=yearRows.filter(r=>r.Nam<=Yr),cur=R[R.length-1],n=R.length,x=R.map(r=>r.Nam);
 const col=k=>R.map(r=>+r[K[k]]),mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
 const sd=a=>Math.sqrt(a.reduce((s,v)=>s+(v-mean(a))**2,0)/Math.max(a.length-1,1))||1e-9;
 const f=(v,d=2)=>Number(v).toFixed(d),out=[],add=(tt,sev,kq,dg,kn)=>out.push({tt,sev,kq,dg,kn});
 const tier=(k,v)=>{const c=CLS[k]||[],nm=lvl(k,v),d=Math.max(c.length-1,1);
  if(nm){const i=c.findIndex(q=>q.name===nm);return {n:nm,s:i/d>=.67?2:i/d>=.34?1:0};}
  const t=k==='LST'?[32,36]:[.4,.6];return {n:'(chưa có phân cấp)',s:v>=t[1]?2:v>=t[0]?1:0};};

 // 1. Hiện trạng theo thang phân cấp
 const tl=tier('LST',+cur.LST_TrungBinh),tt=tier('TVDI',+cur.TVDI_TrungBinh),s1=Math.max(tl.s,tt.s);
 add('1. Hiện trạng năm '+Yr,s1,`LST ${f(cur.LST_TrungBinh)} °C (${tl.n}); TVDI ${f(cur.TVDI_TrungBinh,3)} (${tt.n}); NDVI ${f(cur.NDVI_TrungBinh,3)}`,
  s1===2?'Nhiệt độ bề mặt hoặc khô hạn ở mức cao so với thang phân cấp.':s1===1?'Ở mức trung bình, cần theo dõi.':'Ở mức thấp, chưa có dấu hiệu bất lợi.',
  s1===2?'Ưu tiên xác định khu vực nóng/khô (tab Ô lưới, Gi*) để tăng mảng xanh, mặt nước.':'Tiếp tục giám sát theo mùa khô hằng năm.');

 // 2-4. Xu hướng dài hạn (Mann–Kendall + độ dốc Sen)
 if(n>=4)[['LST','nhiệt độ bề mặt',true,'°C'],['NDVI','thảm thực vật',false,''],['TVDI','khô hạn',true,'']].forEach(([k,nm,upBad,u],i)=>{
  const t=mk(x,col(k)),bad=upBad?t.sen>0:t.sen<0,sig=t.p<.05,sev=bad?(sig?2:1):0,d=k==='LST'?3:4;
  add(`${2+i}. Xu hướng ${nm} (${x[0]}–${Yr})`,sev,`Sen = ${f(t.sen,d)}${u}/năm (≈ ${f(t.sen*10,2)}${u}/10 năm); p = ${f(t.p,3)}`,
   sig?(bad?`Xu hướng bất lợi có ý nghĩa thống kê (${upBad?'tăng':'giảm'}).`:`Xu hướng có lợi, có ý nghĩa thống kê.`):bad?'Có chiều hướng bất lợi nhưng chưa đủ ý nghĩa thống kê (p ≥ 0,05).':'Không thấy xu hướng bất lợi.',
   sev===2?'Cần đưa vào báo cáo và đề xuất giải pháp giảm thiểu.':sev===1?'Quét thêm năm để kiểm chứng xu hướng.':'Duy trì giám sát.');});
 else add('2-4. Xu hướng dài hạn',-1,`Mới có ${n} năm dữ liệu`,'Mann–Kendall cần tối thiểu 4 năm.','Quét thêm các năm trước ở mục Bản đồ.');

 // 5. Năm cực đoan
 if(n>=3){const L=col('LST'),z=(L[n-1]-mean(L))/sd(L),hi=R[L.indexOf(Math.max(...L))],lo=R[L.indexOf(Math.min(...L))],sev=z>=1.5?2:z>=1?1:0;
  add('5. Vị trí của năm '+Yr+' so với chuỗi',sev,`z(LST) = ${f(z)}; năm nóng nhất ${hi.Nam} (${f(hi.LST_TrungBinh)} °C), mát nhất ${lo.Nam} (${f(lo.LST_TrungBinh)} °C)`,
   sev===2?'Năm cực đoan nóng so với chuỗi quan sát.':sev===1?'Cao hơn đáng kể so với trung bình chuỗi.':'Trong phạm vi biến động bình thường của chuỗi.',
   sev?'Đối chiếu với điều kiện ENSO/thời tiết của mùa khô năm đó.':'–');}

 // 6. Biến động năm-qua-năm
 if(n>=2){let best={d:0,y:cur.Nam};for(let i=1;i<n;i++){const d=+R[i].LST_TrungBinh-+R[i-1].LST_TrungBinh;if(Math.abs(d)>Math.abs(best.d))best={d,y:R[i].Nam};}
  const a=Math.abs(best.d),sev=a>2?2:a>1?1:0,last=+cur.LST_TrungBinh-+R[n-2].LST_TrungBinh;
  add('6. Biến động LST giữa hai năm liên tiếp',sev,`Lớn nhất: ${best.d>0?'+':''}${f(best.d)} °C (năm ${best.y}); năm ${Yr} so với năm trước: ${last>0?'+':''}${f(last)} °C`,
   sev?'Biến động lớn, có thể do khác biệt số ảnh/mây hoặc thời tiết.':'Biến động nhỏ, chuỗi ổn định.',sev?'Kiểm tra số ảnh và tỷ lệ mây của năm đó (tab Lịch sử & ảnh).':'–');}

 // 7. Tổ hợp nóng – khô – ít xanh
 if(n>=3){const zs=k=>{const a=col(k);return (a[n-1]-mean(a))/sd(a);},zl=zs('LST'),zn=zs('NDVI'),zt=zs('TVDI'),c=(zl>=.5)+(zn<=-.5)+(zt>=.5),sev=c===3?2:c===2?1:0;
  add('7. Tổ hợp nóng – khô – ít thực vật',sev,`z: LST ${f(zl)}, NDVI ${f(zn)}, TVDI ${f(zt)} (${c}/3 điều kiện bất lợi)`,
   c===3?'Cả ba chỉ số cùng bất lợi: nguy cơ đảo nhiệt và hạn cao.':c===2?'Hai trong ba chỉ số bất lợi.':'Không có tổ hợp bất lợi.',c>=2?'Ưu tiên khu vực có NDVI thấp và LST cao để can thiệp.':'–');}

 // 8. Tương quan NDVI–LST (pixel)
 if(lastR==null)add('8. Tương quan NDVI–LST (pixel)',-1,'Chưa tính','Cần bấm "Hiển thị bản đồ" ít nhất một lần.','–');
 else{const ok=lastR<-.5;add(`8. Tương quan NDVI–LST (năm ${lastRY})`,ok?0:1,`r = ${f(lastR,3)}; R² = ${f(lastR*lastR,3)}`,
  ok?'Tương quan nghịch rõ, phù hợp lý thuyết: thực vật nhiều thì nhiệt độ thấp.':'Tương quan nghịch yếu hơn kỳ vọng.',ok?'Dùng tăng độ phủ xanh làm giải pháp giảm nhiệt có cơ sở.':'Kiểm tra mây, bóng mây và mặt nước ở tiền xử lý.');}

 // 9. Theo tháng trong mùa khô
 const mr=monthRows.filter(r=>+r.Nam===Yr);
 if(!mr.length)add('9. Diễn biến theo tháng (mùa khô '+Yr+')',-1,'Chưa có dữ liệu tháng','Quét ở chế độ "Chuỗi năm + chuỗi tháng".','–');
 else{const mx=k=>mr.reduce((a,b)=>+b[K[k]]>+a[K[k]]?b:a),h=mx('LST'),d=mx('TVDI');
  add('9. Diễn biến theo tháng (mùa khô '+Yr+')',-1,`Tháng nóng nhất: ${h.Thang_Nam} (${f(h.LST_TrungBinh)} °C); khô nhất: ${d.Thang_Nam} (TVDI ${f(d.TVDI_TrungBinh,3)})`,
   'Cho biết giai đoạn cao điểm trong mùa khô.','Tập trung cảnh báo/tưới/cấp nước vào các tháng này.');}

 // 10. Điểm nóng trên bản đồ đang hiển thị
 if(gridRows.length){const a=gridRows.filter(r=>r.mean!=null),hot=a.filter(r=>/Điểm nóng/.test(r.nhom||'')).length,sh=100*hot/a.length,
   top=[...a].sort((p,q)=>curIdx==='NDVI'?p.mean-q.mean:q.mean-p.mean).slice(0,3).map(r=>`${r.Name} (${f(r.mean,curIdx==='LST'?2:3)})`).join(', ');
  const sev=curIdx==='NDVI'?-1:sh>=15?2:sh>=5?1:0;
  add(`10. Điểm nóng Gi* (${curIdx} ${lastRY||''})`,sev,`${hot}/${a.length} ô là điểm nóng (${f(sh,1)}%); nổi bật: ${top}`,
   curIdx==='NDVI'?'Với NDVI, điểm "nóng" nghĩa là nhiều thực vật; xem top ô thấp nhất để tìm vùng thiếu xanh.':sev===2?'Điểm nóng tập trung nhiều.':sev===1?'Có điểm nóng cục bộ.':'Ít điểm nóng.',sev>0?'Mở tab Quận/huyện để xác định đơn vị hành chính chịu ảnh hưởng.':'–');}

 // 11. Thông số hiện tại (chụp nhanh tự động) so với chuỗi mùa khô
 if(auSnapLast&&n>=3){const s=auSnapLast,L=col('LST'),Nd=col('NDVI'),zl=(+s.LST_TB-mean(L))/sd(L),zn=(+s.NDVI_TB-mean(Nd))/sd(Nd),dv=+s.LST_TB-+cur.LST_TrungBinh,sev=zl>=1.5?2:zl>=1?1:0;
  add('11. Hiện tại (chụp nhanh '+String(s.Ngay_KetThuc).slice(0,10)+') so với chuỗi mùa khô',sev,
   `LST ${f(s.LST_TB)} °C (${s.Muc_LST||'–'}), lệch ${dv>0?'+':''}${f(dv)} °C so với mùa khô ${cur.Nam}; z(LST) = ${f(zl)}, z(NDVI) = ${f(zn)}; TVDI ${s.TVDI_TB==null?'–':f(s.TVDI_TB,3)} (${s.Muc_TVDI||'–'})`,
   sev===2?'Nhiệt độ hiện tại cao bất thường so với chuỗi mùa khô.':sev===1?'Cao hơn đáng kể so với trung bình chuỗi.':'Trong phạm vi bình thường của chuỗi.',
   'Chỉ để tham khảo: ảnh hiện tại không cùng mùa khô nên so sánh có độ lệch theo mùa.');}

 anaRows=out.map(r=>({...r,muc:SEV[r.sev][0]}));
 const wmax=Math.max(...out.map(r=>r.sev)),c2=out.filter(r=>r.sev===2).length,c1=out.filter(r=>r.sev===1).length;
 $(ID.s).innerHTML=`<div class="ana-sum" style="border-left-color:${SEV[wmax][1]}"><b>Kết luận năm ${Yr}:</b> ${c2} cảnh báo, ${c1} lưu ý trên ${out.length} tình huống. `+
  (wmax===2?'Có chỉ báo ở mức cảnh báo, nên xem chi tiết bên dưới và đối chiếu với điều kiện thực địa.':wmax===1?'Có một số chỉ báo cần lưu ý nhưng chưa nghiêm trọng.':'Các chỉ báo hiện ổn định.')+'</div>';
 w.innerHTML='<table class="v"><thead><tr><th>Tình huống</th><th>Kết quả</th><th>Mức</th><th>Đánh giá</th><th>Khuyến nghị</th></tr></thead><tbody>'+
  out.map(r=>`<tr><td><b>${r.tt}</b></td><td>${r.kq}</td><td><span class="badge" style="background:${SEV[r.sev][1]}">${SEV[r.sev][0]}</span></td><td>${r.dg}</td><td>${r.kn}</td></tr>`).join('')+'</tbody></table>';}

/* ---------- xuất file ---------- */
async function exCarto(fmt){const m=$('exmsg');m.className='msg';m.textContent='Đang dựng bản đồ bố cục (lần đầu có thể mất 1–3 phút)...';
 try{const q=new URLSearchParams({index:$('ei').value,year:$('ey').value,cloud:$('c').value,classify:$('ecls').checked,region:$('ereg').value,fmt});
  const r=await fetch('/api/cartomap?'+q);
  if(!r.ok){let d={};try{d=await r.json()}catch{}throw new Error(d.detail||('Lỗi '+r.status));}
  const a=document.createElement('a');a.href=URL.createObjectURL(await r.blob());
  a.download=`ban_do_${$('ei').value}_${$('ey').value}.${fmt}`;a.click();
  m.className='msg ok';m.textContent='Đã tạo bản đồ.';}
 catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}}
 
async function exTif(){const m=$('exmsg');m.className='msg';m.textContent='Đang tạo GeoTIFF trên GEE...';
 try{const r=await fetch(`/api/geotiff?index=${$('ei').value}&year=${$('ey').value}&cloud=${$('c').value}`),d=await r.json();if(!r.ok)throw new Error(d.detail||('Lỗi '+r.status));m.className='msg ok';m.textContent='Sẵn sàng, đang tải xuống.';location.href=d.url;}
 catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}}
function exVec(){if(!lastOutline)return alert('Hãy bấm "Hiển thị bản đồ" ở mục Bản đồ trước.');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(lastOutline)],{type:'application/geo+json'}));a.download='ranh_gioi_TPHCM.geojson';a.click();}
async function exCsv(t){if(t==='year')return csv('thong_ke_theo_nam.csv',YC,yearRows);if(t==='month')return csv('thong_ke_theo_thang.csv',MC,monthRows);
 const rows=await (await fetch('/api/images?year='+$('ey').value)).json();csv('metadata_landsat_'+$('ey').value+'.csv',[{k:'Ma_Anh',l:'Ma_Anh'},{k:'Loai_VeTinh',l:'Loai_VeTinh'},{k:'Ngay_ThuNhan',l:'Ngay_ThuNhan'},{k:'TyLe_May',l:'TyLe_May'},{k:'Mua_GiamSat',l:'Mua_GiamSat'}],rows);}

/* ---------- lịch sử & ảnh ---------- */
let runs=[],htab='sum';
(()=>{const hy=$('hy');hy.add(new Option('Tất cả',''));for(let y=Y;y>=2016;y--)hy.add(new Option(y,y));})();
async function loadRuns(){try{runs=await (await fetch('/api/runs')).json();}catch(e){runs=[];}
 $('runSel').innerHTML=runs.map(r=>`<option value="${r.Ma_LuotQuet}">#${r.Ma_LuotQuet} · ${String(r.ThoiGian_Quet).replace('T',' ').slice(0,16)} · ${r.Che_Do==='THANG'?'năm + tháng':'năm'} ${r.Nam_BatDau}–${r.Nam_KetThuc} · ${r.TrangThai}</option>`).join('');
 if(!runs.length){$('runInfo').textContent='Chưa có lượt quét nào (hoặc chưa chạy WebGIS_bosung_pg.sql).';$('hw').innerHTML='';return;}showRun();}
function setH(t){htab=t;document.querySelectorAll('#hseg button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));showRun();}
async function showRun(){const id=$('runSel').value;if(!id)return;const r=runs.find(x=>x.Ma_LuotQuet==id),w=$('hw');
 $('hfil').style.display=(htab==='reg'||htab==='img')?'flex':'none';
 $('runInfo').textContent=`Mây ≤ ${r.Nguong_May_Max??'–'}% · ${r.So_Nam_CoSoLieu} năm có số liệu · ${r.So_Dong_Vung} dòng vùng · ${r.So_Anh_BanDo} ảnh bản đồ · ${r.So_ThongSo_DaLuu} thông số đã lưu · xử lý ${r.ThoiGian_XuLy_Giay??'–'} giây`;
 const JJ=u=>fetch(u).then(x=>x.json());sortKey=null;w.innerHTML='<div class="empty">Đang tải...</div>';
 try{
  if(htab==='sum')w.innerHTML=tbl([T('Nam','Năm'),T('Thang_Nam','Tháng'),N('LST_TB','LST TB',2),N('LST_Min','LST min',2),N('LST_Max','LST max',2),N('LST_DoLech','LST độ lệch',2),N('NDVI_TB','NDVI TB'),N('TVDI_TB','TVDI TB'),T('So_Anh','Số ảnh')],await JJ(`/api/run/${id}/summary`));
  else if(htab==='coef')w.innerHTML=tbl([T('Nam','Năm'),T('Thang_Nam','Tháng'),T('Ten_HeSo','Hệ số'),N('GiaTri','Giá trị',4),T('DonVi','Đơn vị')],await JJ(`/api/run/${id}/coef`));
  else if(htab==='par')w.innerHTML=tbl([T('Nhom','Nhóm'),T('Ten_ThongSo','Thông số'),T('GiaTri_TaiThoiDiem','Giá trị đã dùng'),T('DonVi','Đơn vị')],await JJ(`/api/run/${id}/params`));
  else if(htab==='reg'){const y=$('hy').value,i=$('hi').value||'LST';if(!y){w.innerHTML='<div class="empty">Chọn một năm (và chỉ số) để xem màu từng vùng.</div>';return;}
   w.innerHTML=tbl([T('Ma_Vung','Mã vùng'),N('TrungBinh','Trung bình'),N('Gia_Tri_Min','Min'),N('Gia_Tri_Max','Max'),N('Do_Lech_Chuan','Độ lệch chuẩn'),N('So_Pixel','Số pixel',0),T('Muc_Do','Mức độ'),
    {k:'Ma_Mau_Hex',l:'Màu',f:v=>v?`<span class="sw" style="background:${v}"></span> ${v}`:'–'},N('Gi_Z','Gi* (z)',2),T('Gi_Nhom','Nhóm điểm nóng/lạnh')],await JJ(`/api/run/${id}/regions?year=${y}&index=${i}`));}
  else{let im=await JJ(`/api/run/${id}/images`);const y=$('hy').value,i=$('hi').value;im=im.filter(a=>(!y||String(a.Nam)===y)&&(!i||a.Chi_So===i));
   w.innerHTML=im.length?'<div style="display:flex;flex-wrap:wrap;gap:12px">'+im.map(a=>`<a href="/api/image/${a.Ma_AnhKetQua}" target="_blank" style="width:260px;font-size:12px;color:#222;text-decoration:none"><img loading="lazy" src="/api/image/${a.Ma_AnhKetQua}" style="width:100%;background:#eee;border:1px solid #ccd"><br><b>${a.Chi_So} · ${a.Nam}</b> · ${a.Che_Do_HienThi}<br>SHA-256: ${String(a.Ma_Hash||'').slice(0,12)}…</a>`).join('')+'</div>':'<div class="empty">Không có ảnh phù hợp bộ lọc.</div>';}
 }catch(e){w.innerHTML='<div class="empty err">Không đọc được dữ liệu. Đã chạy WebGIS_bosung_pg.sql chưa?</div>';}}

/* ---------- thang màu (trang chủ) ---------- */
let CLS={};
let VISJS={LST:{min:20,max:45,palette:["#0000FF","#0066FF","#00FFFF","#00FF00","#FFFF00","#FFCC00","#FF6600","#FF0000"]},NDVI:{min:-0.2,max:1,palette:["#FF0000","#FF7F00","#FFFF00","#ADFF2F","#00FF00","#00FFFF","#007FFF","#0000FF"]},TVDI:{min:0,max:1,palette:["#066b00","#0bc400","#0ce100","#00ff00","#ffff00","#ffcc00","#ff6600","#ff0000"]}};
const UN={LST:' °C',NDVI:'',TVDI:''},NM={LST:'LST – Nhiệt độ bề mặt (°C)',NDVI:'NDVI – Chỉ số thực vật',TVDI:'TVDI – Chỉ số khô hạn'},IDX=['LST','NDVI','TVDI'];
const giColor=z=>z==null?null:z>=2.58?'#b2182b':z>=1.96?'#ef8a62':z>=1.65?'#fddbc7':z<=-2.58?'#2166ac':z<=-1.96?'#67a9cf':z<=-1.65?'#d1e5f0':null;
const J=async u=>{
  const r=await fetch(u), t=await r.text();
  let d=null; try{d=JSON.parse(t)}catch{}
  if(!r.ok) throw new Error((d&&d.detail)||`HTTP ${r.status}: ${t.slice(0,200)}`);
  return d;
};
const norm=(k,v)=>Math.max(0,Math.min(1,(v-VISJS[k].min)/(VISJS[k].max-VISJS[k].min)));
function drawScale(c){
 $('scale').innerHTML=IDX.map(k=>{const v=VISJS[k],n=v.palette.length,st=(v.max-v.min)/n,d=k==='LST'?1:2;
  return `<div style="margin:14px 0"><b>${NM[k]}</b> <span style="color:#666">· dải ${v.min} → ${v.max}</span>
  <div style="display:flex;max-width:760px;margin-top:6px">${v.palette.map(p=>`<div style="flex:1;background:${p};height:26px"></div>`).join('')}</div>
  <div style="display:flex;max-width:760px;font-size:12px;color:#444">${v.palette.map((p,i)=>`<div style="flex:1;text-align:center">${(v.min+st*i).toFixed(d)}</div>`).join('')}</div>
  <div class="hint">Mỗi ô màu ứng với một khoảng ${st.toFixed(k==='LST'?2:3)}${UN[k]} · mã màu: ${v.palette.join(', ')}</div></div>`;}).join('');
 const rows=['TVDI','LST'].flatMap(k=>(c[k]||[]).map(x=>({k,...x})));
 $('clsTab').innerHTML=rows.length?'<b>Phân cấp mức độ (bảng PhanCap_UHI_Khohan)</b>'+tbl([T('k','Chỉ số'),T('name','Mức độ'),T('lo','Từ'),T('hi','Đến'),{k:'color',l:'Màu',f:v=>`<span class="sw" style="background:${v}"></span> ${v}`}],rows):'';}
(async()=>{let c={};try{c=await J('/api/classes');VISJS=c.vis;}catch(e){}CLS=c;drawScale(c);})();

/* ---------- bảng thống kê ---------- */
const SD={desc:'Max, Min, Trung bình, Độ lệch chuẩn, Trung vị và tứ phân vị cho toàn thành phố và từng khu vực (3 tỉnh cũ).',
 spa:'Zonal statistics theo khu vực, bảng nhiệt (heat table), Moran\'s I (tụ cụm không gian) và Getis-Ord Gi* (điểm nóng/lạnh) trên ô lưới 5,5 km.',
 tim:'So sánh theo năm, xu hướng Mann–Kendall/độ dốc Sen và trung bình theo tháng trong mùa khô (cần đã quét chuỗi).',
 cor:'Tương quan Pearson (r), R² và hồi quy tuyến tính giữa LST, NDVI, TVDI trên ô lưới; kèm r NDVI–LST ở mức pixel.',
 cls:'LST, NDVI, TVDI trung bình theo nhóm lớp phủ (ESA WorldCover 2021).'};
let stab='desc';
function setS(t){stab=t;document.querySelectorAll('#sseg button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));drawStats();}
function pearson(x,y){const n=x.length,mx=x.reduce((a,b)=>a+b)/n,my=y.reduce((a,b)=>a+b)/n;let a=0,b=0,c=0;x.forEach((v,i)=>{a+=(v-mx)*(y[i]-my);b+=(v-mx)**2;c+=(y[i]-my)**2;});return a/Math.sqrt(b*c);}
const fm=(v,n=3)=>v==null?'–':Number(v).toFixed(n);
async function drawStats(){
 const w=$('sw'),m=$('smsg3'),q=`year=${$('sy').value}&cloud=${$('c').value}`;$('sdesc').textContent=SD[stab];sortKey=null;m.className='msg';
 try{
  if(stab==='tim'){m.textContent='';
   if(yearRows.length<2){w.innerHTML='<div class="empty">Chưa có chuỗi năm. Hãy quét ở mục Bản đồ.</div>';return;}
   const dl=(r,i,k)=>i?fm(r[k]-yearRows[i-1][k],3):'–';
   let h='<b>So sánh theo năm (year-to-year)</b>'+tbl([T('Nam','Năm'),N('LST_TrungBinh','LST TB',2),{k:'dL',l:'Δ LST',f:v=>v},N('NDVI_TrungBinh','NDVI TB'),{k:'dN',l:'Δ NDVI',f:v=>v},N('TVDI_TrungBinh','TVDI TB'),{k:'dT',l:'Δ TVDI',f:v=>v}],
    yearRows.map((r,i)=>({...r,dL:dl(r,i,'LST_TrungBinh'),dN:dl(r,i,'NDVI_TrungBinh'),dT:dl(r,i,'TVDI_TrungBinh')})));
   if(yearRows.length>=4){const x=yearRows.map(r=>r.Nam);h+='<br><b>Xu hướng dài hạn (Mann–Kendall, độ dốc Sen)</b>'+tbl([T('k','Chỉ số'),N('sen','Độ dốc Sen / năm',4),N('p','p-value'),T('kl','Kết luận')],
    IDX.map(k=>{const t=mk(x,yearRows.map(r=>+r[K[k]]));return {k,sen:t.sen,p:t.p,kl:t.p<0.05?(t.sen>0?'Tăng có ý nghĩa':'Giảm có ý nghĩa'):'Không có ý nghĩa thống kê'};}));}
   const mm={};monthRows.forEach(r=>{const k=r.Thang_Nam.slice(5);(mm[k]=mm[k]||[]).push(r);});
   const avg=(a,k)=>a.reduce((s,r)=>s+(+r[k]),0)/a.length;
   h+='<br><b>Theo tháng trong mùa khô (trung bình nhiều năm)</b>'+(monthRows.length?tbl([T('t','Tháng'),N('l','LST TB',2),N('n','NDVI TB'),N('v','TVDI TB'),T('c','Số năm')],
    ['12','01','02','03','04'].filter(k=>mm[k]).map(k=>({t:'Tháng '+k,l:avg(mm[k],'LST_TrungBinh'),n:avg(mm[k],'NDVI_TrungBinh'),v:avg(mm[k],'TVDI_TrungBinh'),c:mm[k].length}))):'<div class="empty">Chưa có dữ liệu theo tháng (quét chế độ "Chuỗi năm + chuỗi tháng").</div>');
   w.innerHTML=h;return;}
  m.textContent='Đang tính trên GEE (lần đầu có thể mất 1–3 phút)...';
  if(stab==='desc'){const R=(await J('/api/stats/zones?'+q)).rows;
   w.innerHTML=tbl([T('zone','Khu vực'),T('k','Chỉ số'),N('min','Min'),N('p25','Q1'),N('median','Trung vị'),N('p75','Q3'),N('max','Max'),N('mean','Trung bình'),N('stdDev','Độ lệch chuẩn'),N('count','Số pixel',0)],
    R.flatMap(z=>IDX.map(k=>({zone:z.zone,k,...z[k]}))));}
  else if(stab==='spa'){const [Z,S]=await Promise.all([J('/api/stats/zones?'+q),J('/api/stats/spatial?'+q)]);
   w.innerHTML='<b>Zonal statistics – bảng nhiệt (trung bình theo khu vực)</b><table class="heat"><thead><tr><th>Khu vực</th>'+IDX.map(k=>`<th>${k}${UN[k]}</th>`).join('')+'</tr></thead><tbody>'+
    Z.rows.map(z=>'<tr><td style="text-align:left">'+z.zone+'</td>'+IDX.map(k=>`<td style="background:${colorAt(norm(k,z[k].mean),VISJS[k].palette)}">${fm(z[k].mean,k==='LST'?2:3)}</td>`).join('')+'</tr>').join('')+'</tbody></table><br><b>Tự tương quan không gian và điểm nóng</b>'+
    tbl([T('k','Chỉ số'),N('I',"Moran's I"),N('z','z-score',1),N('p','p-value'),T('kl','Kết luận'),T('hot','Ô điểm nóng (Gi*)'),T('cold','Ô điểm lạnh (Gi*)')],
     IDX.filter(k=>S[k]).map(k=>{const o=S[k],c=o.nhom,sum=p=>Object.entries(c).filter(([n])=>n.startsWith(p)).reduce((a,[,v])=>a+v,0);
      return {k,...o.moran,kl:o.moran.I>0&&o.moran.p<0.05?'Tụ cụm (I > 0)':o.moran.p<0.05?'Phân tán (I < 0)':'Ngẫu nhiên',hot:sum('Điểm nóng'),cold:sum('Điểm lạnh')};}));}
  else if(stab==='cor'){const [P,Z]=await Promise.all([J('/api/charts/cells?'+q),J('/api/stats/zones?'+q)]);
   const pairs=[['LST – NDVI','NDVI','LST','ndvi','lst'],['LST – TVDI','TVDI','LST','tvdi','lst'],['NDVI – TVDI','TVDI','NDVI','tvdi','ndvi']];
   const pr=pairs.map(([cap,a,b,x,y])=>{const xs=P.map(p=>p[x]),ys=P.map(p=>p[y]),r=pearson(xs,ys),o=ols(xs,ys);
    return {cap,r,r2:r*r,hq:`${b} = ${o.a.toFixed(3)} ${o.b<0?'−':'+'} ${Math.abs(o.b).toFixed(3)}·${a}`,nx:Math.abs(r)>=.7?'Chặt':Math.abs(r)>=.4?'Trung bình':'Yếu'};});
   w.innerHTML=`<b>Tương quan trên ${P.length} ô lưới</b>`+tbl([T('cap','Cặp chỉ số'),N('r','r (Pearson)'),N('r2','R²'),T('hq','Hồi quy tuyến tính'),T('nx','Mức độ')],pr)+
    `<br><b>Mức pixel (toàn khu vực):</b> r(NDVI–LST) = ${Z.r==null?'–':fm(Z.r)}, R² = ${Z.r==null?'–':fm(Z.r*Z.r)}`;}
  else{const C=await J('/api/stats/classes?'+q),tot=C.reduce((a,c)=>a+((c.LST||{}).n||0),0);
   w.innerHTML=tbl([T('ten','Nhóm lớp phủ'),N('pct','Tỷ lệ diện tích (%)',1),N('l','LST TB',2),N('ls','LST độ lệch',2),N('n','NDVI TB'),N('v','TVDI TB')],
    C.map(c=>({ten:c.ten,pct:100*((c.LST||{}).n||0)/tot,l:(c.LST||{}).mean,ls:(c.LST||{}).std,n:(c.NDVI||{}).mean,v:(c.TVDI||{}).mean})));}
  m.textContent='';
 }catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}}

/* ---------- biểu đồ so sánh ---------- */
const CH={col:'Cột: so sánh giá trị trung bình LST, NDVI, TVDI giữa TP.HCM (cũ), Bình Dương và Bà Rịa – Vũng Tàu.',
 sca:'Phân tán: quan hệ NDVI–LST trên các ô lưới, màu điểm thể hiện TVDI; đường hồi quy kèm r và R².',
 box:'Hộp: phân bố Min, Q1, trung vị, Q3, Max của chỉ số được chọn theo khu vực (tính trên pixel).',
 bub:'Bong bóng: trục X NDVI, trục Y LST, kích thước bong bóng = TVDI, mỗi màu là một khu vực.',
 rad:'Radar: so sánh tổng hợp LST, NDVI, TVDI giữa các khu vực (chuẩn hóa 0–1 theo thang màu). Chưa có trục NDWI, Albedo.',
 his:'Histogram: phân bố tần suất pixel của chỉ số được chọn trên toàn khu vực nghiên cứu.',
 tri:'Tam giác TVDI: không gian Ts–NDVI với biên khô (đỏ) và biên ướt (xanh).'};
const ZC=['#455a64','#e53935','#1e88e5','#43a047'];let cc=[];
function canv(n){$('cw').innerHTML=Array.from({length:n},(_,i)=>`<div style="flex:1 1 ${n>1?300:640}px;max-width:${n>1?'32%':'900px'}"><canvas id="cv${i}"></canvas></div>`).join('');return [...Array(n).keys()].map(i=>$('cv'+i));}
async function drawLab(){
 const t=$('ct').value,k=$('ci').value,m=$('cmsg2'),q=`year=${$('cy').value}&cloud=${$('c').value}`;m.className='msg';m.textContent='Đang lấy dữ liệu từ GEE (lần đầu có thể mất 1–3 phút)...';$('cdesc').textContent=CH[t];cc.forEach(c=>c.destroy());cc=[];
 const mk2=(el,cfg)=>cc.push(new Chart(el,cfg));
 try{
  if(['col','box','bub','rad'].includes(t)){const Z=(await J('/api/stats/zones?'+q)).rows,L=Z.map(z=>z.zone);
   if(t==='col'){const cs=canv(3);IDX.forEach((i,n)=>mk2(cs[n],{type:'bar',data:{labels:L,datasets:[{data:Z.map(z=>z[i].mean),backgroundColor:ZC}]},options:{plugins:{title:{display:true,text:NM[i]},legend:{display:false}}}}));}
   else if(t==='box'){mk2(canv(1)[0],{type:'bar',data:{labels:L,datasets:[{label:'Q1–Q3',data:Z.map(z=>[z[k].p25,z[k].p75]),backgroundColor:'#90caf9',borderColor:'#1565c0',borderWidth:1},
     {type:'line',label:'Trung vị',data:Z.map(z=>z[k].median),showLine:false,pointStyle:'rectRot',pointRadius:8,borderColor:'#c62828',backgroundColor:'#c62828'},
     {type:'line',label:'Min',data:Z.map(z=>z[k].min),showLine:false,pointStyle:'line',pointRadius:14,borderColor:'#333'},
     {type:'line',label:'Max',data:Z.map(z=>z[k].max),showLine:false,pointStyle:'line',pointRadius:14,borderColor:'#333'}]},options:{plugins:{title:{display:true,text:'Boxplot '+NM[k]}}}});}
   else if(t==='bub'){mk2(canv(1)[0],{type:'bubble',data:{datasets:Z.slice(1).map((z,n)=>({label:z.zone,data:[{x:z.NDVI.mean,y:z.LST.mean,r:6+z.TVDI.mean*40}],backgroundColor:ZC[n+1]+'aa',borderColor:ZC[n+1]}))},
     options:{scales:{x:{title:{display:true,text:'NDVI'}},y:{title:{display:true,text:'LST (°C)'}}},plugins:{title:{display:true,text:'Kích thước bong bóng = TVDI'},tooltip:{callbacks:{label:c=>`${c.dataset.label}: NDVI ${c.raw.x.toFixed(3)}, LST ${c.raw.y.toFixed(2)} °C, TVDI ${((c.raw.r-6)/40).toFixed(3)}`}}}}});}
   else mk2(canv(1)[0],{type:'radar',data:{labels:['LST','NDVI','TVDI'],datasets:Z.map((z,n)=>({label:z.zone,data:IDX.map(i=>norm(i,z[i].mean)),borderColor:ZC[n],backgroundColor:ZC[n]+'22'}))},options:{scales:{r:{min:0,max:1}}}});}
  else if(t==='sca'){const P=await J('/api/charts/cells?'+q),xs=P.map(p=>p.ndvi),ys=P.map(p=>p.lst),r=pearson(xs,ys),o=ols(xs,ys),x0=Math.min(...xs),x1=Math.max(...xs);
   mk2(canv(1)[0],{type:'scatter',data:{datasets:[{label:'Ô lưới (màu = TVDI)',data:P.map(p=>({x:p.ndvi,y:p.lst})),pointBackgroundColor:P.map(p=>colorAt(norm('TVDI',p.tvdi),VISJS.TVDI.palette)),pointRadius:4},
    {type:'line',label:'Hồi quy tuyến tính',data:[{x:x0,y:o.a+o.b*x0},{x:x1,y:o.a+o.b*x1}],borderColor:'#000',pointRadius:0}]},
    options:{scales:{x:{title:{display:true,text:'NDVI'}},y:{title:{display:true,text:'LST (°C)'}}},plugins:{title:{display:true,text:`r = ${r.toFixed(3)} · R² = ${(r*r).toFixed(3)} · n = ${P.length}`}}}});}
  else if(t==='his'){const H=await J(`/api/charts/hist?index=${k}&${q}`);mk2(canv(1)[0],{type:'bar',data:{labels:H.map(h=>h.x.toFixed(2)),datasets:[{label:'Số pixel',data:H.map(h=>h.n),backgroundColor:H.map(h=>colorAt(norm(k,h.x),VISJS[k].palette))}]},
    options:{plugins:{title:{display:true,text:'Phân bố '+NM[k]},legend:{display:false}},scales:{x:{title:{display:true,text:k+UN[k]}}}}});}
  else{const D=await J('/api/charts/triangle?'+q),e=D.edges;mk2(canv(1)[0],{type:'scatter',data:{datasets:[{label:'Pixel mẫu',data:D.pts.map(p=>({x:p[0],y:p[1]})),pointRadius:2,backgroundColor:'#90a4aeaa'},
    {type:'line',label:`Biên khô: Ts = ${e.a.toFixed(1)} ${e.b<0?'−':'+'} ${Math.abs(e.b).toFixed(1)}·NDVI`,data:[{x:0,y:e.a},{x:.9,y:e.a+e.b*.9}],borderColor:'#d32f2f',pointRadius:0},
    {type:'line',label:`Biên ướt: Ts = ${e.tmin.toFixed(1)} °C`,data:[{x:0,y:e.tmin},{x:.9,y:e.tmin}],borderColor:'#1565c0',pointRadius:0}]},
    options:{scales:{x:{min:0,max:.9,title:{display:true,text:'NDVI'}},y:{title:{display:true,text:'LST / Ts (°C)'}}}}});}
  m.textContent='';
 }catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}}

/* ---------- tự động hóa: trạng thái, thông số hiện tại, nhật ký & phân tích tự động ---------- */
let auTimer=null,auInit=false,auWas=false,auLastId,auSnapLast=null,auImgKey='',auM='year',auCh=null;
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
const MUCC={'Ổn định':'#2e7d32','Lưu ý':'#f9a825','Cảnh báo':'#c62828'};
const EV={KIEM_TRA:'Không có ảnh mới',ANH_MOI:'Có ảnh mới (ngoài mùa khô)',QUET_NAM:'Đã quét lại năm',LOI:'Lỗi'};
const dsg=(k,l,n)=>({k,l,f:v=>v==null?'–':(v>0?'+':'')+Number(v).toFixed(n)});
const AUC=[T('ThoiGian','Thời gian'),T('Nguon','Nguồn'),{k:'Su_Kien',l:'Sự kiện',f:v=>EV[v]||v||'–'},T('Nam','Năm'),N('So_Anh_MuaKho','Ảnh mùa khô',0),dsg('So_Anh_Moi','Ảnh mới',0),
 T('Ngay_Anh_MoiNhat','Ảnh mới nhất'),dsg('D_LST','Δ LST (°C)',2),dsg('D_NDVI','Δ NDVI',3),dsg('D_TVDI','Δ TVDI',3),
 {k:'Muc_Do',l:'Mức',f:v=>v?`<span class="badge" style="background:${MUCC[v]||'#607d8b'}">${v}</span>`:'–'},
 {k:'GhiChu',l:'Nhận xét / đánh giá',f:v=>esc(v)||'–'},T('Ma_LuotQuet','Lượt quét')];
const SNC=[T('ThoiGian','Chụp lúc'),T('Ngay_BatDau','Từ ngày'),T('Ngay_KetThuc','Đến ngày'),N('So_Anh','Số ảnh',0),N('LST_TB','LST TB (°C)',2),dsg('dL','Δ LST',2),N('LST_Min','LST min',2),N('LST_Max','LST max',2),
 N('NDVI_TB','NDVI TB'),dsg('dN','Δ NDVI',3),N('TVDI_TB','TVDI TB'),dsg('dT','Δ TVDI',3),T('Muc_LST','Mức LST'),T('Muc_TVDI','Mức khô hạn')];
async function loadAuto(){
 const m=$('auMsg');
 try{
  const [s,lg,sn]=await Promise.all([J('/api/auto/status'),J('/api/auto/log'),J('/api/auto/snapshots')]);
  const c=s.cfg,a=s.auto,j=s.job,busy=a.checking||j.running,on=c.BAT==='1',fdt=v=>v?String(v).replace('T',' ').slice(0,16):'–';
  if(!auInit){$('auOn').checked=on;$('auH').value=c.CHU_KY_GIO;$('auC').value=c.MAY_MAX;$('auW').value=c.CUA_SO_NGAY;auInit=true;}
  $('autoState').innerHTML=`<span class="badge" style="background:${on?'#2e7d32':'#607d8b'}">${on?'ĐANG BẬT':'ĐANG TẮT'}</span> `+
   (busy?`<b>Đang chạy:</b> ${esc(j.running?j.msg:a.last_msg)}`:`Kiểm tra gần nhất: <b>${fdt(a.last_check)}</b>${on?` · Lần tới: <b>${fdt(a.next_check)}</b>`:''}`)+
   `<br>Chu kỳ ${c.CHU_KY_GIO} giờ · mây ≤ ${c.MAY_MAX}% · năm theo dõi ${s.year} (mùa khô ${s.season})`+
   (!busy&&a.last_msg?`<br>Kết quả gần nhất: ${esc(a.last_msg)}`:'')+(a.last_error?`<br><span class="err">Lỗi: ${esc(a.last_error)}</span>`:'');
  const x=sn[0];auSnapLast=x||null;
  $('auNow').innerHTML=x?`<div class="cards"><div><b>LST – nhiệt độ bề mặt</b><br><span class="kpi">${fm(x.LST_TB,2)} °C</span><br><span class="card-desc">Min ${fm(x.LST_Min,1)} · Max ${fm(x.LST_Max,1)} · ${esc(x.Muc_LST)||'–'}</span></div>
   <div><b>NDVI – thực vật</b><br><span class="kpi">${fm(x.NDVI_TB)}</span></div>
   <div><b>TVDI – khô hạn</b><br><span class="kpi">${fm(x.TVDI_TB)}</span><br><span class="card-desc">${esc(x.Muc_TVDI)||'–'}</span></div></div>
   <div class="hint mt-8">Ghép ${x.So_Anh} ảnh từ ${x.Ngay_BatDau} đến ${x.Ngay_KetThuc} · chụp lúc ${fdt(x.ThoiGian)}</div>`
   :'<div class="empty">Chưa có chụp nhanh. Bật tự động hoặc bấm "Kiểm tra ngay".</div>';
  sortKey=null;
  $('auLog').innerHTML=lg.length?tbl(AUC,lg).replace('<table>','<table class="v">'):'<div class="empty">Chưa có nhật ký.</div>';
  const snd=sn.map((r,i)=>{const p=sn[i+1],d=k=>p&&r[k]!=null&&p[k]!=null?r[k]-p[k]:null;return {...r,dL:d('LST_TB'),dN:d('NDVI_TB'),dT:d('TVDI_TB')};});
  $('auSnap').innerHTML=sn.length?tbl(SNC,snd):'<div class="empty">Chưa có chụp nhanh nào.</div>';
  const key=x?`${x.Ma_ChupNhanh}|${c.CUA_SO_NGAY}`:'';             // chỉ nạp lại ảnh khi có chụp nhanh mới
  if(key!==auImgKey){auImgKey=key;
   $('auImgs').innerHTML=x?IDX.map(k=>{const v=VISJS[k],u=`/api/auto/image?index=${k}&days=${c.CUA_SO_NGAY}&cloud=60&v=${x.Ma_ChupNhanh}`;
    return `<div><b>${NM[k]}</b><br><a href="${u}" download="${k}_hien_tai.png"><img loading="lazy" src="${u}" alt="Đang tạo ảnh ${k}..." style="width:100%;background:#eee;border:1px solid #ccd"></a>`+
     `<span style="display:block;height:10px;margin-top:6px;background:linear-gradient(to right,${v.palette.join(',')})"></span>`+
     `<span style="display:flex;justify-content:space-between;font-size:12px"><span>${v.min}</span><span>${v.max}</span></span></div>`;}).join(''):'<div class="empty">Chưa có chụp nhanh để vẽ ảnh.</div>';}
  auSeries();drawAna(AU_ANA);
  const id=lg[0]?lg[0].Ma_NhatKy_TD:null;
  if((auLastId!==undefined&&id!==auLastId)||(auWas&&!busy))loadAll();   // có lượt tự quét mới: làm mới các tab khác
  auLastId=id;auWas=busy;
  if(m.classList.contains('err')){m.className='msg';m.textContent='';}
 }catch(e){m.className='msg err';m.textContent='Không đọc được dữ liệu tự động hóa: '+e.message+' (đã chạy WebGIS_tudong.sql chưa?)';}}
async function auVec(kind){const m=$('auMsg');m.className='msg';m.textContent='Đang tạo vector...';
 try{const d=await J(`/api/auto/vector?kind=${kind}&days=${$('auW').value}&cloud=60`);
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d)],{type:'application/geo+json'}));
  a.download=kind==='grid'?'o_luoi_hien_tai.geojson':'ranh_gioi_TPHCM.geojson';a.click();m.className='msg ok';m.textContent='Đã tải vector.';}
 catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}}

function auMode(m){auM=m;for(const [id,k] of [['aY','year'],['aM','month'],['aC','combo']])$(id).classList.toggle('on',m===k);auSeries();}
function auSeries(){   // cùng quy tắc mục Chuỗi thời gian (năm / tháng / kết hợp) + điểm "Hiện tại" từ chụp nhanh tự động
 const s=auSnapLast,isY=auM!=='month',R0=isY?yearRows:monthRows;auCh&&auCh.destroy();auCh=null;
 if(!R0.length&&!s){$('auSer').innerHTML='<div class="empty">Chưa có dữ liệu chuỗi thời gian (quét ở mục Bản đồ hoặc bật tự động).</div>';return;}
 const R=R0.map(r=>({lb:isY?String(r.Nam):r.Thang_Nam,lst:+r.LST_TrungBinh,ndvi:+r.NDVI_TrungBinh,tvdi:+r.TVDI_TrungBinh}));
 if(s)R.push({lb:'Hiện tại ('+String(s.Ngay_KetThuc).slice(0,10)+')',lst:+s.LST_TB,ndvi:+s.NDVI_TB,tvdi:s.TVDI_TB==null?null:+s.TVDI_TB});
 const ds=[['LST (°C)','lst','#d32f2f','y'],['NDVI','ndvi','#2e7d32','y1'],['TVDI','tvdi','#f9a825','y1']].map(([l,k,c,ax])=>({label:l,data:R.map(r=>r[k]),borderColor:c,yAxisID:ax,tension:.2,
  pointRadius:R.map((_,i)=>s&&i===R.length-1?7:3)}));
 if(auM==='combo'){ds[1].type='bar';ds[1].backgroundColor='#81c784aa';}
 auCh=new Chart($('auChart'),{type:'line',data:{labels:R.map(r=>r.lb),datasets:ds},options:{scales:{y:{position:'left',title:{display:true,text:'LST (°C)'}},y1:{position:'right',min:0,max:1,grid:{drawOnChartArea:false}}}}});
 const dd=(i,k)=>i&&R[i][k]!=null&&R[i-1][k]!=null?R[i][k]-R[i-1][k]:null;
 const rows=R.map((r,i)=>({...r,dL:dd(i,'lst'),dN:dd(i,'ndvi'),dT:dd(i,'tvdi')}));
 sortKey=null;
 $('auSer').innerHTML=tbl([T('lb',isY?'Năm / hiện tại':'Tháng / hiện tại'),N('lst','LST TB (°C)',2),dsg('dL','Δ LST',2),N('ndvi','NDVI TB'),dsg('dN','Δ NDVI',3),N('tvdi','TVDI TB'),dsg('dT','Δ TVDI',3)],rows);}

async function auSave(){const m=$('auMsg');
 try{const q=new URLSearchParams({bat:$('auOn').checked,hours:$('auH').value,cloud:$('auC').value,window:$('auW').value}),
   r=await fetch('/api/auto/config?'+q,{method:'POST'}),d=await r.json();if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Giá trị không hợp lệ');
  m.className='msg ok';m.textContent='Đã lưu cấu hình.';loadAuto();}
 catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}}
async function auRun(force){const m=$('auMsg');m.className='msg';
 try{const r=await fetch('/api/auto/run?force='+force,{method:'POST'}),d=await r.json();if(!r.ok)throw new Error(d.detail||('Lỗi '+r.status));
  m.textContent='Đã bắt đầu, trang tự cập nhật...';setTimeout(loadAuto,2000);}
 catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}}

/* ---------- khởi động ---------- */
render();loadAll();fetch('/api/scan/status').then(r=>r.json()).then(s=>{if(s.running){$('scan').disabled=true;poll();}});

/* nút "⌂ Trang chính" ở Map.html trỏ về /#home: bỏ qua bìa, vào thẳng giao diện chính */
if(location.hash==='#home'){enter();history.replaceState(null,'',location.pathname);}