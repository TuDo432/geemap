/* ===== BẢN ĐỒ LEAFLET: nền, lớp, thanh icon, phường/xã, bảng thời gian thực ===== */
const VN=[[6,102],[24,118]];              // phạm vi Việt Nam (gồm biển đảo): bản đồ không kéo ra ngoài vùng này
const HCM=[[10.3,106.2],[11.6,107.6]];    // vùng TP.HCM: mặc định phóng vào khi mở bản đồ
let map,ctrl,dyn=[],lastR=null,lastRY=null,lastOutline=null;
let geo=null,regTok=0,curIdx='LST',curVis=null;      // ranh giới + thống kê phường/xã
let gridGroup=null,distLayer=null,maskLayer=null,outlineLayer=null,distLayers={};
let geeLayer=null;                                   // lớp màu chỉ số từ GEE (để chỉnh độ trong suốt)
const geomRings=g=>(g.type==='Polygon'?[g.coordinates]:g.coordinates).map(x=>x[0].map(c=>[c[1],c[0]]));
const outlineRings=gj=>gj.features.flatMap(f=>geomRings(f.geometry));
/* độ trong suốt lấy từ thanh trượt #op; thiếu thanh trượt hoặc giá trị lạ thì dùng 0,6 và luôn nằm trong 0,1–1 */
const opacityNow=()=>{const el=$('op'),v=el?parseFloat(el.value):NaN;return Number.isFinite(v)?Math.max(0.1,Math.min(1,v)):0.6;};

/* ---------- hộp chọn lớp thu gọn (tự dựng, không phụ thuộc cấu trúc bên trong của Leaflet) ----------
   bases: [[tên, lớp nền], ...]   ctrl.addOverlay / ctrl.removeLayer / ctrl.refresh / ctrl.setBase */
function layerBox(bases){
 let openB=false,openO=false,ovs=[];
 const c=L.control({position:'topright'});
 const mk=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;};
 function setBase(l){
  bases.forEach(([,b])=>{if(b!==l&&map.hasLayer(b))map.removeLayer(b);});
  if(!map.hasLayer(l))l.addTo(map);
  render();
 }
 function render(){
  const d=c._box;if(!d)return;
  d.textContent='';
  const cur=bases.find(([,b])=>map.hasLayer(b));
  const head=mk('button','lc-head');head.type='button';
  head.append(mk('span','','🗺 '+(cur?cur[0]:'Chọn nền')),mk('span','',openB?'▴':'▾'));
  head.onclick=()=>{openB=!openB;render();};
  d.append(head);
  if(!openB)return;
  const body=mk('div','lc-body');
  bases.forEach(([name,l])=>{
   const lb=mk('label'),r=mk('input');r.type='radio';r.name='lcbase';r.checked=map.hasLayer(l);
   r.onchange=()=>setBase(l);lb.append(r,' '+name);body.append(lb);
  });
  d.append(body);
  const n=ovs.filter(o=>map.hasLayer(o.l)).length;
  const oh=mk('button','lc-ovhead');oh.type='button';
  oh.append(mk('span','','Lớp dữ liệu ('+n+')'),mk('span','',openO?'▴':'▾'));
  oh.onclick=()=>{openO=!openO;render();};
  d.append(oh);
  if(!openO)return;
  const ob=mk('div','lc-body lc-ov');
  if(!ovs.length)ob.append(mk('div','lc-empty','Chưa có lớp dữ liệu. Bấm "Hiển thị bản đồ".'));
  ovs.forEach(o=>{
   const lb=mk('label'),cb=mk('input');cb.type='checkbox';cb.checked=map.hasLayer(o.l);
   cb.onchange=()=>{if(cb.checked)map.addLayer(o.l);else map.removeLayer(o.l);render();};
   lb.append(cb,' '+o.name);ob.append(lb);
  });
  d.append(ob);
 }
 c.onAdd=()=>{
  const d=L.DomUtil.create('div','leaflet-control lc');
  L.DomEvent.disableClickPropagation(d);L.DomEvent.disableScrollPropagation(d);
  c._box=d;render();return d;
 };
 c.addOverlay=(l,name)=>{ovs.push({l,name});render();};
 c.removeLayer=l=>{ovs=ovs.filter(o=>o.l!==l);render();};
 c.refresh=render;
 c.setBase=setBase;
 return c;
}

/* Bản đồ chỉ được tạo khi mở mục Bản đồ lần đầu (lúc đó khung bản đồ đã có kích thước thật, tránh lệch vị trí) */
function initMap(){
 if(map)return;
 /* nút zoom đặt góc dưới phải để không bị cột nổi bên trái che */
 map=L.map('map',{minZoom:6,maxBounds:VN,maxBoundsViscosity:1,zoomControl:false}).fitBounds(HCM);
 L.control.zoom({position:'bottomright'}).addTo(map);
 map.createPane('gee');map.getPane('gee').style.zIndex=250;
 map.createPane('mask');map.getPane('mask').style.zIndex=300;map.getPane('mask').style.pointerEvents='none';
 /* các nền Esri không cần API key */
 const base={maxZoom:19,bounds:VN,noWrap:true};
 const esri=p=>`https://server.arcgisonline.com/ArcGIS/rest/services/${p}/MapServer/tile/{z}/{y}/{x}`;
 const street=L.tileLayer(esri('World_Street_Map'),{...base,attribution:'Tiles © Esri'}).addTo(map);
 const light=L.tileLayer(esri('Canvas/World_Light_Gray_Base'),{...base,maxNativeZoom:16,attribution:'Tiles © Esri'});
 const dark=L.tileLayer(esri('Canvas/World_Dark_Gray_Base'),{...base,maxNativeZoom:16,attribution:'Tiles © Esri'});
 const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{...base,attribution:'© OpenStreetMap contributors'});
 const sat=L.tileLayer(esri('World_Imagery'),{...base,maxNativeZoom:18,attribution:'Tiles © Esri'});
 ctrl=layerBox([['Bản đồ đường',street],['Xám sáng',light],['Xám tối',dark],['OpenStreetMap',osm],['Ảnh vệ tinh',sat]]).addTo(map);
 /* nếu nền mặc định liên tục lỗi (mất mạng/bị chặn) thì tự chuyển sang ảnh vệ tinh */
 let fails=0;
 street.on('tileerror',()=>{
  if(++fails!==6||!map.hasLayer(street))return;
  ctrl.setBase(sat);
  const m=$('rgmsg');if(m){m.className='msg err';m.textContent='Không tải được bản đồ đường, đã chuyển sang ảnh vệ tinh. Kiểm tra mạng rồi chọn lại nền ở góc trên phải bản đồ.';}
 });
 const curBox=L.control({position:'bottomleft'});
 curBox.onAdd=()=>{const d=L.DomUtil.create('div','map-btn');d.id='livecur';d.textContent='Rê chuột lên bản đồ để xem giá trị';return d;};curBox.addTo(map);
 map.on('move',liveRefresh);map.on('mousemove',thr(curMove,60));
}
function addLayer(l,name,show=true){dyn.push(l);ctrl.addOverlay(l,name);if(show)l.addTo(map);ctrl.refresh();}
function dropLayer(l){if(!l)return;ctrl.removeLayer(l);map.removeLayer(l);dyn=dyn.filter(x=>x!==l);}
function clearLayers(){dyn.forEach(l=>{ctrl.removeLayer(l);map.removeLayer(l);});dyn=[];gridGroup=distLayer=maskLayer=outlineLayer=geeLayer=null;distLayers={};}

/* ---------- thanh icon (kiểu Discord) + cột nội dung nổi trên bản đồ ---------- */
const PT={ctl:'Bảng điều khiển',year:'Thống kê theo năm',grid:'Ô lưới (bản đồ hiện tại)',dist:'Phường/xã',live:'Bảng thời gian thực (khung nhìn)',img:'Ảnh Landsat',hist:'Lịch sử quét'};
let sideP='ctl';
const fixMap=()=>setTimeout(()=>map&&map.invalidateSize(),50);
function showSide(p){sideP=p;$('v-map').classList.remove('wide');
 document.querySelectorAll('#rail .rb[data-p]').forEach(b=>b.classList.toggle('on',b.dataset.p===p));
 $('panel').style.display=p==='ctl'?'block':'none';
 $('datapane').style.display=p==='ctl'?'none':'flex';
 $('side').classList.toggle('data',p!=='ctl');$('dtitle').textContent=PT[p]||'';
 if(p!=='ctl'){tab=p;sortKey=null;render();}
 fixMap();}
function railClick(p){const m=$('v-map');
 if(sideP===p&&!m.classList.contains('wide')){m.classList.add('wide');document.querySelectorAll('#rail .rb[data-p]').forEach(b=>b.classList.remove('on'));fixMap();}   // bấm lại icon đang chọn: thu gọn cột
 else showSide(p);}

/* toàn màn hình thật (ẩn thanh trình duyệt): bản đồ + thanh icon + bảng nổi vẫn dùng bình thường */
function toggleFull(){
 const el=$('v-map');
 if(document.fullscreenElement)document.exitFullscreen();
 else if(el.requestFullscreen)el.requestFullscreen();
}
document.addEventListener('fullscreenchange',()=>{
 const b=$('fsBtn');if(b)b.dataset.tip=document.fullscreenElement?'Thoát toàn màn hình':'Toàn màn hình';
 fixMap();
});

/* ---------- ranh giới + số liệu phường/xã (TP.HCM sau sáp nhập, không gồm Côn Đảo) ---------- */
function buildMask(){      // làm tối phần ngoài ranh giới TP.HCM
 dropLayer(maskLayer);
 maskLayer=L.polygon([[[-85,-180],[-85,180],[85,180],[85,-180]],...outlineRings(lastOutline)],{pane:'mask',stroke:false,fillColor:'#000',fillOpacity:.5,interactive:false});
 addLayer(maskLayer,'Làm tối ngoài vùng');
}
function distStyle(f){const v=((f.properties.stats||{})[curIdx]||{}).mean,fill=$('fill').checked&&v!=null;
 return {color:'#1a237e',weight:.9,fillColor:fill?colorAt((v-curVis.min)/(curVis.max-curVis.min),curVis.palette):'#000',fillOpacity:fill?.55:0};}
function distPopup(p){const s=p.stats||{},v=(b,n)=>s[b]&&s[b].mean!=null?s[b].mean.toFixed(n):'–';
 return `<b>${p.name}</b><br>LST TB: ${v('LST',2)} °C<br>NDVI TB: ${v('NDVI',3)}<br>TVDI TB: ${v('TVDI',3)}<br>Số pixel: ${(s[curIdx]||{}).count??'–'}`;}
function buildDistricts(){
 dropLayer(distLayer);distLayer=null;distLayers={};if(!geo||!$('dist').checked)return;
 distLayer=L.geoJSON(geo.districts,{style:distStyle,onEachFeature:(f,l)=>{
  const p=f.properties;distLayers[p.name]=l;l.bindPopup(distPopup(p));l.bindTooltip(p.name,{sticky:true});
  l.on({mouseover:e=>e.target.setStyle({weight:2.5,color:'#d32f2f'}),mouseout:e=>distLayer.resetStyle(e.target)});}});
 addLayer(distLayer,'Phường/xã');
}
function applyDistricts(){
 if(!lastOutline||!geo)return;
 buildDistricts();
 const m=$('rgmsg');m.className='msg';m.textContent='Bấm vào phường/xã trên bản đồ để xem số liệu, hoặc mở mục "Phường/xã" ở thanh công cụ bên trái.';
 if(tab==='dist')render();
}
async function loadRegions(year,cloud){      // thống kê từng phường/xã (GEE; lần đầu mỗi năm có thể chậm)
 const tok=++regTok,m=$('rgmsg');m.className='msg';m.textContent='Đang tải thống kê phường/xã từ GEE (lần đầu có thể mất 1–2 phút)...';
 try{const d=await J(`/api/stats/regions?year=${year}&cloud=${cloud}`);if(tok!==regTok)return;
  geo=d;applyDistricts();}
 catch(e){if(tok!==regTok)return;m.className='msg err';m.textContent='Không tải được phường/xã: '+e.message;}
}
function distRows(){return geo?geo.districts.features.map(f=>{const p=f.properties,s=p.stats||{};
 return {key:p.name,name:p.name,lst:(s.LST||{}).mean,ndvi:(s.NDVI||{}).mean,tvdi:(s.TVDI||{}).mean,n:(s[curIdx]||{}).count};}):[];}

async function run(){
 const btn=$('btn'),msg=$('msg'),idx=$('idx').value;btn.disabled=true;msg.className='';msg.textContent='Đang tính trên GEE (lần đầu mỗi năm có thể mất 1–3 phút)...';
 try{
  const q=new URLSearchParams({index:idx,year:$('yr').value,cloud:$('c').value,classify:$('cls').checked&&idx!=='NDVI'});
  const r=await fetch('/api/map?'+q),d=await r.json();if(!r.ok)throw new Error(d.detail||('Lỗi '+r.status));
  initMap();clearLayers();gridLayers={};geo=null;regTok++;const {min:lo,max:hi,palette:pal}=d.vis;
  curIdx=idx;curVis=d.vis;lastOutline=d.outline;lastR=d.r;lastRY=$('yr').value;
  geeLayer=L.tileLayer(d.tile_url,{pane:'gee',opacity:opacityNow()});
  addLayer(geeLayer,`${idx} ${$('yr').value} (GEE)`);
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
  loadRegions($('yr').value,$('c').value);       // không chờ: bản đồ đã hiện, phường/xã tải sau
  $('v-map').classList.add('wide');              // thu cột bên trái, bản đồ rộng tối đa (bấm icon để mở lại)
  document.querySelectorAll('#rail .rb[data-p]').forEach(b=>b.classList.remove('on'));fixMap();
 }catch(err){msg.className='err';msg.textContent='Lỗi: '+err.message;}finally{btn.disabled=false;}
}

/* ---------- bảng real-time theo khung nhìn + giá trị dưới con trỏ ---------- */
const liveRefresh=thr(()=>{if(tab==='live'&&sideP==='live'&&!$('v-map').classList.contains('wide'))render();},200);
const fb=f=>f._b||(f._b=L.geoJSON(f).getBounds());
function liveRows(u){
 if(!map)return[];const b=map.getBounds();let rows=[];
 if(u==='cell')rows=gridRows.filter(r=>{const l=gridLayers[r.Code];return l&&r.mean!=null&&b.intersects(l.getBounds());})
  .map(r=>({key:r.Code,name:r.Name,v:r.mean,lo:r.min,hi:r.max,mc:lvl(curIdx,r.mean)||'–'}));
 else if(geo)rows=geo.districts.features.filter(f=>b.intersects(fb(f)))
  .map(f=>{const p=f.properties,s=(p.stats||{})[curIdx]||{};return {key:p.name,name:p.name,v:s.mean,lo:s.min,hi:s.max,mc:s.mean==null?'–':(lvl(curIdx,s.mean)||'–'),f};});
 const vs=rows.map(r=>r.v).filter(v=>v!=null),d=curIdx==='LST'?2:3;
 $('livesum').innerHTML=vs.length?`<b>${curIdx}</b> trong khung nhìn: <b>${vs.length}</b> đơn vị · TB <b>${fm(vs.reduce((a,b)=>a+b,0)/vs.length,d)}</b> · Min ${fm(Math.min(...vs),d)} · Max ${fm(Math.max(...vs),d)} · zoom ${map.getZoom()}`:'Chưa có dữ liệu trong khung nhìn (bấm "Hiển thị bản đồ" hoặc kéo bản đồ về vùng có dữ liệu).';
 return rows;}
function curMove(e){
 const el=$('livecur');if(!el||!gridRows.length)return;
 for(const r of gridRows){const l=gridLayers[r.Code];if(l&&r.mean!=null&&l.getBounds().contains(e.latlng)){
  el.textContent=`${curIdx}: ${fm(r.mean,curIdx==='LST'?2:3)}${curIdx==='LST'?' °C':''} · ${lvl(curIdx,r.mean)||r.Name} · ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;return;}}
 el.textContent=`Ngoài vùng dữ liệu · ${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;}