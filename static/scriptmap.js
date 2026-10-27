const $=id=>document.getElementById(id),Y=new Date().getFullYear();
for(let y=Y;y>=2016;y--)$('yr').add(new Option(y,y));$('yr').value=Math.min(2025,Y);
$('t1').onclick=()=>{const m=$('ctl').classList.toggle('min');$('t1').textContent=m?'+':'–';};
$('t2').onclick=()=>{const m=$('leg').classList.toggle('min');$('t2').textContent=m?'+':'–';};

const map=L.map('map',{zoomControl:false,minZoom:6}).setView([10.8,106.7],9);
L.control.zoom({position:'bottomright'}).addTo(map);
map.createPane('gee').style.zIndex=250;
map.createPane('mask').style.zIndex=300;map.getPane('mask').style.pointerEvents='none';
const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19});
const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Tiles © Esri',maxZoom:19,maxNativeZoom:18}).addTo(map);
const ctrl=L.control.layers({'Ảnh vệ tinh':sat,'Bản đồ đường':osm},{},{position:'topright'}).addTo(map);

let L_={},geo=null,region='all',outline=null,vis=null,idx='LST',tok=0;
const hex=h=>{const n=parseInt(h.slice(1),16);return[n>>16&255,n>>8&255,n&255]};
function colorAt(t,p){t=Math.max(0,Math.min(1,t));const k=t*(p.length-1),i=Math.min(Math.floor(k),p.length-2),f=k-i,a=hex(p[i]),b=hex(p[i+1]);return'rgb('+a.map((v,j)=>Math.round(v+(b[j]-v)*f)).join(',')+')'}
const rings=g=>(g.type==='Polygon'?[g.coordinates]:g.coordinates).map(x=>x[0].map(c=>[c[1],c[0]]));
function put(k,l,name,show=true){drop(k);L_[k]=l;ctrl.addOverlay(l,name);if(show)l.addTo(map)}
function drop(k){const l=L_[k];if(l){ctrl.removeLayer(l);map.removeLayer(l);delete L_[k]}}
const selProv=()=>region==='all'||!geo?null:geo.provinces.features.find(f=>f.properties.zone===region);
const fx=(v,n)=>v==null?'–':v.toFixed(n);

function mask(){drop('mask');if(!outline)return;const s=selProv();
 put('mask',L.polygon([[[-85,-180],[-85,180],[85,180],[85,-180]],...(s?rings(s.geometry):outline.features.flatMap(f=>rings(f.geometry)))],
  {pane:'mask',stroke:false,fillColor:'#000',fillOpacity:.5,interactive:false}),'Làm tối ngoài vùng')}
const provStyle=f=>{const on=f.properties.zone===region;return{color:on?'#d32f2f':'#ffeb3b',weight:on?3:1.5,dashArray:on?null:'5 4',fillOpacity:0}};
function provinces(){put('prov',L.geoJSON(geo.provinces,{style:provStyle,onEachFeature:(f,l)=>{
 l.bindTooltip(f.properties.zone+' · bấm để xem chi tiết',{sticky:true});l.on('click',()=>setRegion(f.properties.zone))}}),'Tỉnh/thành')}
function dStyle(f){const v=((f.properties.stats||{})[idx]||{}).mean,fill=$('fill').checked&&v!=null;
 return{color:'#1a237e',weight:.9,fillColor:fill?colorAt((v-vis.min)/(vis.max-vis.min),vis.palette):'#000',fillOpacity:fill?.55:0}}
function showInfo(p){const s=p.stats||{},v=(b,n)=>fx((s[b]||{}).mean,n);
 $('infob').innerHTML=`<b>${p.name}</b><br><span style="color:#666">${p.zone}</span><br>LST TB: ${v('LST',2)} °C · NDVI TB: ${v('NDVI',3)} · TVDI TB: ${v('TVDI',3)}<br>Số pixel: ${(s[idx]||{}).count??'–'}`;
 $('info').style.display='block'}
let dl={};
function districts(){drop('dist');dl={};if(!geo||!$('dist').checked)return;const only=region!=='all';
 put('dist',L.geoJSON(geo.districts,{filter:f=>!only||f.properties.zone===region,interactive:only,style:dStyle,onEachFeature:(f,l)=>{
  if(!only)return;const p=f.properties;dl[p.name]=l;l.bindTooltip(p.name,{sticky:true});
  l.on({click:()=>showInfo(p),mouseover:e=>e.target.setStyle({weight:2.5,color:'#d32f2f'}),mouseout:e=>L_.dist.resetStyle(e.target)})}}),'Quận/huyện/phường/xã')}
function fillDist(){const s=$('dsel');s.innerHTML='<option value="">'+(region==='all'?'— chọn tỉnh trước —':'— chọn đơn vị —')+'</option>';s.disabled=region==='all';
 if(region!=='all'&&geo)geo.districts.features.filter(f=>f.properties.zone===region).map(f=>f.properties.name).sort().forEach(n=>s.add(new Option(n,n)))}
function setRegion(v,fit=true){
 region=v;$('rg').value=v;$('info').style.display='none';
 if(!geo){$('rgmsg').textContent='Hãy bấm "Hiển thị bản đồ" trước.';return}
 L_.prov&&L_.prov.setStyle(provStyle);mask();districts();fillDist();
 if(fit){const s=selProv();map.fitBounds(s?L.geoJSON(s).getBounds():L_.outline.getBounds(),{padding:[30,30]})}
 $('rgmsg').textContent=v==='all'?'Bấm vào một tỉnh (viền vàng) để xem quận/huyện.':'Đang xem '+v+': bấm vào quận/huyện để xem số liệu.'}
$('rg').onchange=e=>setRegion(e.target.value);
$('dsel').onchange=e=>{const l=dl[e.target.value];if(l){map.fitBounds(l.getBounds(),{padding:[40,40]});showInfo(l.feature.properties)}};
$('dist').onchange=districts;$('fill').onchange=districts;
$('op').oninput=e=>L_.gee&&L_.gee.setOpacity(+e.target.value);

async function J(u){const r=await fetch(u),d=await r.json();if(!r.ok)throw new Error(d.detail||'Lỗi '+r.status);return d}
async function loadRegions(y,c){const t=++tok;$('rgmsg').textContent='Đang tải quận/huyện từ GEE (lần đầu có thể mất 1–2 phút)...';
 try{const d=await J(`/api/stats/regions?year=${y}&cloud=${c}`);if(t!==tok)return;geo=d;
  const s=$('rg');s.length=1;d.provinces.features.forEach(f=>s.add(new Option(f.properties.zone,f.properties.zone)));
  provinces();setRegion(region,region!=='all')}
 catch(e){if(t===tok)$('rgmsg').innerHTML='<span class="err">Không tải được quận/huyện: '+e.message+(e.message==='Not Found'?' (hãy khởi động lại uvicorn)':'')+'</span>'}}

$('btn').onclick=async()=>{
 const b=$('btn'),m=$('msg');idx=$('idx').value;b.disabled=true;m.className='msg';m.textContent='Đang tính trên GEE (lần đầu mỗi năm có thể mất 1–3 phút)...';
 try{
  const d=await J('/api/map?'+new URLSearchParams({index:idx,year:$('yr').value,cloud:$('c').value,classify:$('cls').checked&&idx!=='NDVI'}));
  geo=null;tok++;['prov','dist'].forEach(drop);region='all';$('rg').length=1;fillDist();
  vis=d.vis;outline=d.outline;
  put('gee',L.tileLayer(d.tile_url,{pane:'gee',opacity:+$('op').value}),`${idx} ${$('yr').value} (GEE)`);
  put('outline',L.geoJSON(d.outline,{style:{color:'#d32f2f',weight:2,fillOpacity:0},interactive:false}),'Ranh giới TP.HCM');
  mask();map.fitBounds(L_.outline.getBounds(),{padding:[30,30]});
  const cl=d.classes||[];$('bar').style.display=$('ends').style.display=cl.length?'none':'block';
  $('bar').style.background='linear-gradient(to right,'+vis.palette.join(',')+')';$('l0').textContent=vis.min;$('l1').textContent=vis.max;
  $('chips').innerHTML=cl.map(c=>`<div><span style="background:${c.color}"></span>${c.name} (${c.lo}–${c.hi})</div>`).join('');
  $('sum').innerHTML=`<b>${idx}</b> · TB ${fx(d.city.mean,3)} · min ${fx(d.city.min,3)} · max ${fx(d.city.max,3)}<br>`;
  m.className='msg ok';m.textContent=(d.db_error||'Hoàn tất')+` · ${d.n_images} ảnh Landsat 8/9`;
  $('ctl').classList.add('min');$('t1').textContent='+';   // thu bảng để bản đồ rộng tối đa
  loadRegions($('yr').value,$('c').value);
 }catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message}finally{b.disabled=false}};