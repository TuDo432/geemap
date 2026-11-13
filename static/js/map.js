/* ===== BẢN ĐỒ LEAFLET: nền, lớp, thanh icon, phường/xã, bảng thời gian thực ===== */
const VN=[[6,102],[24,118]];              // phạm vi Việt Nam (gồm biển đảo): bản đồ không kéo ra ngoài vùng này
const HCM=[[10.3,106.2],[11.6,107.6]];    // vùng TP.HCM: mặc định phóng vào khi mở bản đồ
let map,ctrl,dyn=[],lastR=null,lastRY=null,lastOutline=null;
let geo=null,curIdx='LST',curVis=null,lastC=null;    // geo = dữ liệu phường/xã của bản đồ ĐANG HIỂN THỊ (null = chưa tải)
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

/* ---------- một bảng điều khiển hợp nhất (không còn thanh icon phụ) ----------
   Mọi nhóm công cụ nằm trong #console; nút #conToggle thu gọn để trả toàn bộ
   diện tích cho bản đồ; #conHandle mở lại từ mép trái. */
let consoleOpen=true;
const fixMap=()=>setTimeout(()=>{if(map)map.invalidateSize();if(typeof m3!=='undefined'&&m3)m3.resize();},50);
function toggleConsole(force){
 consoleOpen=force===undefined?!consoleOpen:!!force;
 $('v-map').classList.toggle('noc',!consoleOpen);
 const t=$('conToggle');
 if(t){t.setAttribute('aria-expanded',consoleOpen);t.title=consoleOpen?'Thu gọn bảng điều khiển':'Mở rộng bảng điều khiển';}
 fixMap();
}
/* mở khối "Bảng dữ liệu" với bảng yêu cầu (tables.js gọi qua setTab) */
function showSide(p){tab=p;sortKey=null;
 if(!consoleOpen)toggleConsole(true);
 $('f-data').open=true;const s=$('dtab');if(s)s.value=p;
 if(p==='dist')loadRegions();                               // HÀNH ĐỘNG 2: bảng xếp hạng 167 phường/xã
 render();
 try{$('f-data').scrollIntoView({block:'nearest'});}catch(e){}
}

/* toàn màn hình thật (ẩn thanh trình duyệt): bản đồ + thanh icon + bảng nổi vẫn dùng bình thường */
function toggleFull(){
 const el=$('v-map');
 if(document.fullscreenElement)document.exitFullscreen();
 else if(el.requestFullscreen)el.requestFullscreen();
}
document.addEventListener('fullscreenchange',()=>{
 const b=$('fsBtn');
 if(b){const t=document.fullscreenElement?'Thoát toàn màn hình':'Toàn màn hình';b.dataset.tip=t;b.setAttribute('aria-label',t);b.innerHTML='⛶&nbsp;'+t;}
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

/* ======================= LAZY LOADING PHƯỜNG/XÃ =======================
   - run() KHÔNG tải phường/xã.
   - Chỉ tải khi người dùng chủ động: (1) bật lớp "phường/xã", (2) mở tab Phân tích / bảng xếp hạng phường/xã
     (ngoài ra: đổi "Đơn vị thống kê" sang phường/xã, hoặc chọn cột nổi 3D theo phường/xã – các nơi này cũng cần dữ liệu).
   - Cache: khóa "năm|mây" (dữ liệu trả về đã gồm cả 3 chỉ số nên không phụ thuộc chỉ số đang xem).
   - Mỗi thời điểm chỉ có 1 request: cùng khóa thì dùng chung, khác khóa thì hủy request cũ. */
const regCache=new Map();                                   // "năm|mây" -> {provinces, districts}
const regState={key:null,status:'idle',ctl:null,promise:null};   // status: idle | loading | error
const curKey=()=>lastRY&&lastC!=null?`${lastRY}|${lastC}`:null;  // khóa của bản đồ đang hiển thị (không phải giá trị ô chọn)

function setRegMsg(html,cls=''){const m=$('rgmsg');if(m){m.className='msg '+cls;m.innerHTML=html;}}   // chỉ truyền chuỗi tĩnh hoặc đã esc()

/* gọi sau khi dữ liệu phường/xã sẵn sàng (từ cache hoặc từ API) */
function applyDistricts(){
 if(!lastOutline||!geo)return;
 buildDistricts();
 sync3D();                                                  // cột nổi 3D theo phường/xã
 setRegMsg($('dist').checked?'Bấm vào phường/xã trên bản đồ để xem số liệu.':'Đã tải xong số liệu phường/xã.');
 if(tab==='dist'||tab==='live')render();
 if($('v-tools').classList.contains('on')&&toolTab==='ana')drawAna();   // tab Phân tích đang mở -> cập nhật mục xếp hạng
}

/* Hàm DUY NHẤT tải phường/xã. Gọi nhiều lần vẫn an toàn (có cache + dùng chung request đang chạy). */
async function loadRegions(){
 const key=curKey();
 if(!key||!lastOutline)return null;                         // chưa bấm "Hiển thị bản đồ"
 const hit=regCache.get(key);
 if(hit){                                                   // 1) CACHE: không gọi API
  if(geo!==hit){geo=hit;applyDistricts();}
  return hit;
 }
 if(regState.status==='loading'&&regState.key===key)return regState.promise;   // 2) đang tải đúng yêu cầu này
 if(regState.ctl)regState.ctl.abort();                      // 3) hủy yêu cầu cũ (khác năm/mây)

 const ctl=new AbortController(),[y,c]=key.split('|');
 Object.assign(regState,{key,status:'loading',ctl});
 setRegMsg('<span class="spin"></span>Đang tải thống kê 167 phường/xã từ GEE (lần đầu mỗi năm có thể mất 1–2 phút)...');
 if(tab==='dist')render();                                  // bảng xếp hạng hiện spinner

 regState.promise=(async()=>{
  try{
   const d=await J(`/api/stats/regions?year=${y}&cloud=${c}`,{signal:ctl.signal});
   regCache.set(key,d);                                     // luôn lưu cache, kể cả khi người dùng đã chuyển năm
   if(regState.ctl===ctl){
    Object.assign(regState,{status:'idle',ctl:null,promise:null});
    if(curKey()===key){geo=d;applyDistricts();}
   }
   return d;
  }catch(e){
   if(e.name==='AbortError')return null;                    // bị hủy chủ động: im lặng
   if(regState.ctl===ctl){
    Object.assign(regState,{status:'error',ctl:null,promise:null});
    setRegMsg('Không tải được phường/xã: '+esc(e.message)+' · bật lại lớp để thử lại.','err');
    if(tab==='dist')render();
   }
   return null;
  }
 })();
 return regState.promise;
}

/* run() đổi năm/mây -> hủy request phường/xã của bản đồ cũ (đổi chỉ số thì KHÔNG hủy vì cùng khóa) */
function cancelStaleRegions(){
 if(regState.ctl&&regState.key!==curKey()){
  regState.ctl.abort();
  Object.assign(regState,{key:null,status:'idle',ctl:null,promise:null});
 }
}

/* run() xong: cache đã có thì phục hồi ngay (0 request); chưa có thì tắt lớp và chờ người dùng bật */
function afterRunRegions(){
 const hit=regCache.get(curKey());
 if(hit){geo=hit;applyDistricts();return;}
 $('dist').checked=false;$('fill').checked=false;
 setRegMsg('Bật “Hiện ranh giới phường/xã” để tải số liệu 167 phường/xã.');
}

/* HÀNH ĐỘNG 1: bật/tắt lớp phường/xã (checkbox #dist, #fill) */
function onWardToggle(src){
 const d=$('dist'),f=$('fill');
 if(src==='fill'&&f.checked)d.checked=true;                 // tô màu cần có ranh giới
 if(src==='dist'&&!d.checked)f.checked=false;
 if(!d.checked){buildDistricts();return;}                   // tắt: chỉ gỡ lớp, GIỮ cache
 if(!lastOutline){d.checked=f.checked=false;setRegMsg('Hãy bấm “Hiển thị bản đồ” trước.','err');return;}
 geo?buildDistricts():loadRegions();                        // có sẵn -> dựng lại ngay; chưa có -> cache/API
}

/* các điểm dùng dữ liệu phường/xã khác */
function onLiveU(){if($('liveU').value==='dist')loadRegions();render();}
function onU3(){if($('u3').value==='ward')loadRegions();sync3D();}

function distRows(){return geo?geo.districts.features.map(f=>{const p=f.properties,s=p.stats||{};
 return {key:p.name,name:p.name,lst:(s.LST||{}).mean,ndvi:(s.NDVI||{}).mean,tvdi:(s.TVDI||{}).mean,n:(s[curIdx]||{}).count};}):[];}

/* ======================= HIỂN THỊ BẢN ĐỒ =======================
   Chỉ tải: lớp tile GEE + thống kê tổng quan TP.HCM (+ lưới 5,5 km đi kèm /api/map).
   KHÔNG tải phường/xã (xem LAZY LOADING phía trên). */
async function run(){
 // chụp tham số NGAY: nếu người dùng đổi ô chọn trong lúc chờ GEE thì nhãn/khóa cache vẫn đúng
 const btn=$('btn'),msg=$('msg'),idx=$('idx').value,year=$('yr').value,cloud=$('c').value;
 btn.disabled=true;msg.className='';msg.textContent='Đang tính trên GEE (lần đầu mỗi năm có thể mất 1–3 phút)...';
 try{
  const q=new URLSearchParams({index:idx,year,cloud,classify:$('cls').checked&&idx!=='NDVI'});
  const r=await fetch('/api/map?'+q),d=await r.json();if(!r.ok)throw new Error(d.detail||('Lỗi '+r.status));
  initMap();clearLayers();gridLayers={};geo=null;           // geo=null: bản đồ mới chưa có phường/xã (cache vẫn giữ)
  const {min:lo,max:hi,palette:pal}=d.vis;
  curIdx=idx;curVis=d.vis;lastOutline=d.outline;lastR=d.r;lastRY=year;lastC=cloud;
  cancelStaleRegions();                                     // đổi năm/mây -> hủy request phường/xã cũ

  // lớp ảnh chỉ số (tile GEE) + mặt nạ
  geeLayer=L.tileLayer(d.tile_url,{pane:'gee',opacity:opacityNow()});
  addLayer(geeLayer,`${idx} ${year} (GEE)`);
  buildMask();
  // lưới 5,5 km: tô màu / bấm xem số liệu / điểm nóng Gi*
  addLayer(L.geoJSON(d.geojson,{interactive:false,style:f=>{const m=f.properties.mean;return m==null?{fillOpacity:0,weight:0}:{color:'#444',weight:.4,fillColor:colorAt((m-lo)/(hi-lo),pal),fillOpacity:.6};}}),'Ô lưới tô màu theo trung bình',false);
  gridGroup=L.geoJSON(d.geojson,{style:{color:'#333',weight:.5,fillOpacity:0},onEachFeature:(f,l)=>{const p=f.properties;gridLayers[p.Code]=l;
   l.bindPopup(`<b>${p.Name}</b><br>Trung bình: ${f3(p.mean)}<br>Min: ${f3(p.min)} · Max: ${f3(p.max)}<br>Độ lệch chuẩn: ${f3(p.stdDev)}<br>Số pixel: ${p.count??'–'}`);}});
  addLayer(gridGroup,'Ô lưới (bấm xem số liệu)',false);      // mặc định tắt để bấm tỉnh/quận huyện không bị ô lưới chặn
  outlineLayer=L.geoJSON(d.outline,{style:{color:'#d32f2f',weight:2,fillOpacity:0},interactive:false});addLayer(outlineLayer,'Ranh giới TP.HCM');
  /* lớp điểm nóng/lạnh Getis-Ord Gi* (từ d.spatial do backend tính) */
  const gi=(d.spatial&&d.spatial.gi)||{};
  addLayer(L.geoJSON(d.geojson,{interactive:false,style:f=>{const c=giColor((gi[f.properties.Code]||{}).z);return c?{fillColor:c,fillOpacity:.7,weight:.3,color:'#555'}:{fillOpacity:0,weight:0};}}),'Điểm nóng/lạnh Gi* (ô lưới)',false);
  map.fitBounds(outlineLayer.getBounds());map.setMaxBounds(outlineLayer.getBounds().pad(0.6));

  // thống kê tổng quan cấp thành phố
  $('m').textContent=f3(d.city.mean);$('sd').textContent=f3(d.city.stdDev);$('mn').textContent=f3(d.city.min);$('mx').textContent=f3(d.city.max);$('n').textContent=d.city.count??'–';
  const cl=d.classes||[];$('legend').style.display=cl.length?'none':'block';$('lg').style.display=cl.length?'none':'flex';
  $('legend').style.background='linear-gradient(to right,'+pal.join(',')+')';$('l0').textContent=lo;$('l1').textContent=hi;
  $('chips').innerHTML=cl.map(c=>`<div><span style="background:${c.color}"></span>${c.name} (${c.lo}–${c.hi})</div>`).join('');$('stats').style.display='block';
  const mo=d.spatial&&d.spatial.moran;
  $('moran').innerHTML=mo?`<b>Moran's I</b> = ${mo.I.toFixed(3)} (z = ${mo.z.toFixed(1)}, p ${mo.p<0.001?'< 0,001':'= '+mo.p.toFixed(3)}) → ${mo.I>0&&mo.p<0.05?'giá trị tụ cụm theo không gian':'chưa thấy tụ cụm rõ rệt'}`:'';
  gridRows=d.geojson.features.map(f=>({...f.properties,gi:(gi[f.properties.Code]||{}).z,nhom:(gi[f.properties.Code]||{}).nhom}));setTab('grid',false);
  const e=d.edges;msg.className=d.db_error?'err':'ok';
  msg.textContent=(d.db_error||'Hoàn tất')+` · ${d.n_images} ảnh Landsat 8/9 · Ts_max = ${e.a.toFixed(1)} ${e.b<0?'−':'+'} ${Math.abs(e.b).toFixed(1)}·NDVI, Ts_min = ${e.tmin.toFixed(1)}°C`;
  lastTile=d.tile_url;lastGrid=d.geojson;sync3D();          // đẩy dữ liệu sang bản đồ 3D (map3d.js)

  afterRunRegions();                                        // KHÔNG gọi API: chỉ phục hồi từ cache nếu có
  const sh=$('statHint');if(sh)sh.style.display='none';     // số liệu đã sẵn sàng trong khối Thống kê
  $('f-stat').open=true;fixMap();
 }catch(err){msg.className='err';msg.textContent='Lỗi: '+err.message;}finally{btn.disabled=false;}
}

/* ---------- bảng real-time theo khung nhìn + giá trị dưới con trỏ ---------- */
const liveRefresh=thr(()=>{if(tab==='live'&&consoleOpen&&$('f-data').open)render();},200);
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
