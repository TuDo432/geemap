/* ===== BẢN ĐỒ 3D (MapLibre GL): địa hình + lớp GEE + cột nổi theo chỉ số =====
   Nạp SAU map.js và TRƯỚC main.js. Dùng chung biến của map.js: map, curIdx, curVis, geo, lastOutline, opacityNow(). */
let m3=null,ready3=false,is3D=false,lastTile=null,lastGrid=null;
const ESRI_IMG='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const DEM_URL='https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

function init3D(){
 if(m3)return;
 m3=new maplibregl.Map({
  container:'map3d',center:[106.7,10.8],zoom:9,pitch:60,bearing:-20,maxPitch:80,
  style:{version:8,
   sources:{
    sat:{type:'raster',tiles:[ESRI_IMG],tileSize:256,maxzoom:18,attribution:'Tiles © Esri'},
    dem:{type:'raster-dem',tiles:[DEM_URL],encoding:'terrarium',tileSize:256,maxzoom:14,attribution:'Terrain: Mapzen/AWS'}},
   layers:[{id:'sat',type:'raster',source:'sat'}]}});
 m3.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-left');   // trên trái: không bị bảng "Toàn thành phố" che
 m3.on('load',()=>{ready3=true;terrain3D();sync3D();});
 /* bấm cột nổi để xem số liệu (kiểm tra lớp 'ext' đã có chưa để không báo lỗi) */
 m3.on('click',e=>{
  if(!m3.getLayer('ext'))return;
  const fs=m3.queryRenderedFeatures(e.point,{layers:['ext']});if(!fs.length)return;
  const p=fs[0].properties;
  new maplibregl.Popup().setLngLat(e.lngLat)
   .setHTML(`<b>${esc(p.name)}</b><br>${curIdx}: ${fm(p.v,curIdx==='LST'?2:3)}${curIdx==='LST'?' °C':''}`).addTo(m3);});
 m3.on('mousemove',e=>{
  if(!m3.getLayer('ext'))return;
  m3.getCanvas().style.cursor=m3.queryRenderedFeatures(e.point,{layers:['ext']}).length?'pointer':'';});
 /* khung đổi kích thước (mở/thu cột trái, toàn màn hình...) thì vẽ lại */
 new ResizeObserver(()=>m3&&m3.resize()).observe($('map3d'));
 /* độ trong suốt dùng chung với thanh trượt #op của bản đồ 2D */
 const op=$('op');
 if(op)op.addEventListener('input',()=>{if(m3.getLayer('gee'))m3.setPaintProperty('gee','raster-opacity',opacityNow());});
}

function terrain3D(){
 if(!ready3)return;
 m3.setTerrain({source:'dem',exaggeration:parseFloat($('x3').value)||1.5});
}

/* chuyển đổi 2D <-> 3D, giữ vị trí nhìn */
function setView(v){
 is3D=v==='3d';
 document.querySelectorAll('#viewSwitch button').forEach(b=>b.classList.toggle('on',b.dataset.m===v));
 $('right').classList.toggle('is3d',is3D);
 if(is3D){
  init3D();const c=map.getCenter();m3.resize();
  if(lastOutline){   // đã có dữ liệu: phóng vừa khít ranh giới TP.HCM
   const pts=outlineRings(lastOutline).flat(),la=pts.map(p=>p[0]),ln=pts.map(p=>p[1]);
   m3.fitBounds([[Math.min(...ln),Math.min(...la)],[Math.max(...ln),Math.max(...la)]],{padding:60,pitch:60,bearing:-20,duration:0});
  }else m3.jumpTo({center:[c.lng,c.lat],zoom:Math.max(map.getZoom()-1,5),pitch:60,bearing:-20});   // zoom MapLibre ≈ zoom Leaflet − 1
  sync3D();
 }else if(m3){
  const c=m3.getCenter();map.invalidateSize();
  map.setView([c.lat,c.lng],Math.round(m3.getZoom()+1),{animate:false});
 }
}

/* dựng FeatureCollection có chiều cao + màu theo chỉ số đang xem */
function ext3D(gj,getV){
 const H=parseFloat($('h3').value)||2500,{min,max,palette}=curVis,out=[];
 for(const f of gj.features){
  const v=getV(f.properties);if(v==null||!f.geometry)continue;
  const t=Math.max(0,Math.min(1,(v-min)/(max-min)));
  out.push({type:'Feature',geometry:f.geometry,
   properties:{name:f.properties.name||f.properties.Name||'',v,h:Math.max(t*H,30),c:colorAt(t,palette)}});
 }
 return {type:'FeatureCollection',features:out};
}

function setSrc(id,data){const s=m3.getSource(id);s?s.setData(data):m3.addSource(id,{type:'geojson',data});}

/* đồng bộ dữ liệu 2D -> 3D (gọi sau "Hiển thị bản đồ", sau khi tải xong phường/xã, hoặc khi đổi tuỳ chọn) */
function sync3D(){
 if(!is3D||!m3||!ready3||!curVis)return;
 /* 1) lớp màu chỉ số từ GEE (URL đổi theo năm/chỉ số nên dựng lại) */
 if(m3.getLayer('gee'))m3.removeLayer('gee');
 if(m3.getSource('gee'))m3.removeSource('gee');
 if(lastTile){
  m3.addSource('gee',{type:'raster',tiles:[lastTile],tileSize:256});
  m3.addLayer({id:'gee',type:'raster',source:'gee',paint:{'raster-opacity':opacityNow()}});
 }
 /* 2) cột nổi */
 if(m3.getLayer('ext'))m3.removeLayer('ext');
 const u=$('u3').value;let data=null;
 if(u==='grid'&&lastGrid)data=ext3D(lastGrid,p=>p.mean);
 else if(u==='ward'&&geo)data=ext3D(geo.districts,p=>((p.stats||{})[curIdx]||{}).mean);
 if(data){
  setSrc('extsrc',data);
  m3.addLayer({id:'ext',type:'fill-extrusion',source:'extsrc',
   paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-height':['get','h'],'fill-extrusion-base':0,'fill-extrusion-opacity':.85}});
 }
 /* 3) ranh giới TP.HCM */
 if(m3.getLayer('outline'))m3.removeLayer('outline');
 if(lastOutline){
  setSrc('outsrc',lastOutline);
  m3.addLayer({id:'outline',type:'line',source:'outsrc',paint:{'line-color':'#d32f2f','line-width':2}});
 }
}