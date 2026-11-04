const $=id=>document.getElementById(id),Y=new Date().getFullYear();
for(let y=Y;y>=2016;y--)$('yr').add(new Option(y,y));$('yr').value=Math.min(2025,Y);
$('t1').onclick=()=>{const m=$('ctl').classList.toggle('min');$('t1').textContent=m?'+':'–';};
$('t2').onclick=()=>{const m=$('leg').classList.toggle('min');$('t2').textContent=m?'+':'–';};

const map=L.map('map',{zoomControl:false,minZoom:6}).setView([10.8,106.7],9);
L.control.zoom({position:'bottomright'}).addTo(map);
map.createPane('gee').style.zIndex=250;
map.createPane('mask').style.zIndex=300;map.getPane('mask').style.pointerEvents='none';

/* ---------- CSS của hộp chọn lớp: tự chèn từ JS để không phụ thuộc file CSS/cache ---------- */
(()=>{const s=document.createElement('style');s.textContent=`
.lc{background:#fff!important;border-radius:12px!important;box-shadow:0 2px 12px rgba(0,0,0,.35)!important;border:0!important;
 min-width:200px;max-width:250px;overflow:hidden;font:13px "Segoe UI",sans-serif;color:#222}
.lc button{all:unset;box-sizing:border-box;display:flex!important;justify-content:space-between;align-items:center;width:100%;
 padding:10px 14px!important;cursor:pointer;font:600 13px "Segoe UI",sans-serif!important;color:#0b2a4a!important;background:#fff!important}
.lc button:hover{background:#f1f5fa!important}
.lc .lc-ovhead{background:#f1f4f8!important;border-top:1px solid #dde}
.lc .lc-body{padding:4px 14px 8px;border-top:1px solid #dde;background:#fff}
.lc .lc-ov{max-height:240px;overflow:auto}
.lc label{display:flex!important;align-items:center;gap:6px;margin:0!important;padding:5px 0;font-size:13px!important;color:#222!important;cursor:pointer}
.lc input{width:auto!important;margin:0!important;padding:0!important}
.lc .lc-empty{color:#666;font-size:12px;padding:4px 0}`;
document.head.appendChild(s);})();

/* CSS của hộp chọn lớp: tự chèn từ JS để không phụ thuộc style.css/cache */
(()=>{const s=document.createElement('style');s.textContent=`
.lc{background:#fff!important;border-radius:12px!important;box-shadow:0 2px 12px rgba(0,0,0,.35)!important;border:0!important;
 min-width:200px;max-width:250px;overflow:hidden;font:13px "Segoe UI",sans-serif;color:#222}
.lc button{all:unset;box-sizing:border-box;display:flex!important;justify-content:space-between;align-items:center;width:100%;
 padding:10px 14px!important;cursor:pointer;font:600 13px "Segoe UI",sans-serif!important;color:#0b2a4a!important;background:#fff!important}
.lc button:hover{background:#f1f5fa!important}
.lc .lc-ovhead{background:#f1f4f8!important;border-top:1px solid #dde}
.lc .lc-body{padding:4px 14px 8px;border-top:1px solid #dde;background:#fff}
.lc .lc-ov{max-height:240px;overflow:auto}
.lc label{display:flex!important;align-items:center;gap:6px;margin:0!important;padding:5px 0;font-size:13px!important;color:#222!important;cursor:pointer}
.lc input{width:auto!important;margin:0!important;padding:0!important}
.lc .lc-empty{color:#666;font-size:12px;padding:4px 0}`;
document.head.appendChild(s);})();

/* ---------- hộp chọn lớp thu gọn (bấm mới mở) ----------
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

/* các nền Esri không cần API key */
const base={maxZoom:19,noWrap:true};
const esri=p=>`https://server.arcgisonline.com/ArcGIS/rest/services/${p}/MapServer/tile/{z}/{y}/{x}`;
const street=L.tileLayer(esri('World_Street_Map'),{...base,attribution:'Tiles © Esri'}).addTo(map);
const light=L.tileLayer(esri('Canvas/World_Light_Gray_Base'),{...base,maxNativeZoom:16,attribution:'Tiles © Esri'});
const dark=L.tileLayer(esri('Canvas/World_Dark_Gray_Base'),{...base,maxNativeZoom:16,attribution:'Tiles © Esri'});
const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{...base,attribution:'© OpenStreetMap contributors'});
const sat=L.tileLayer(esri('World_Imagery'),{...base,maxNativeZoom:18,attribution:'Tiles © Esri'});
const ctrl=layerBox([['Bản đồ đường',street],['Xám sáng',light],['Xám tối',dark],['OpenStreetMap',osm],['Ảnh vệ tinh',sat]]).addTo(map);
/* nền đường lỗi liên tục (mất mạng/bị chặn) thì tự chuyển sang ảnh vệ tinh */
let fails=0;
street.on('tileerror',()=>{if(++fails===6&&map.hasLayer(street))ctrl.setBase(sat);});

let L_={},geo=null,outline=null,vis=null,idx='LST',tok=0;
const hex=h=>{const n=parseInt(h.slice(1),16);return[n>>16&255,n>>8&255,n&255]};
function colorAt(t,p){t=Math.max(0,Math.min(1,t));const k=t*(p.length-1),i=Math.min(Math.floor(k),p.length-2),f=k-i,a=hex(p[i]),b=hex(p[i+1]);return'rgb('+a.map((v,j)=>Math.round(v+(b[j]-v)*f)).join(',')+')'}
const rings=g=>(g.type==='Polygon'?[g.coordinates]:g.coordinates).map(x=>x[0].map(c=>[c[1],c[0]]));
function put(k,l,name,show=true){drop(k);L_[k]=l;ctrl.addOverlay(l,name);if(show)l.addTo(map);ctrl.refresh()}
function drop(k){const l=L_[k];if(l){ctrl.removeLayer(l);map.removeLayer(l);delete L_[k]}}
const fx=(v,n)=>v==null?'–':v.toFixed(n);

function mask(){drop('mask');if(!outline)return;
 put('mask',L.polygon([[[-85,-180],[-85,180],[85,180],[85,-180]],...outline.features.flatMap(f=>rings(f.geometry))],
  {pane:'mask',stroke:false,fillColor:'#000',fillOpacity:.5,interactive:false}),'Làm tối ngoài vùng')}
function dStyle(f){const v=((f.properties.stats||{})[idx]||{}).mean,fill=$('fill').checked&&v!=null;
 return{color:'#1a237e',weight:.9,fillColor:fill?colorAt((v-vis.min)/(vis.max-vis.min),vis.palette):'#000',fillOpacity:fill?.55:0}}
function showInfo(p){const s=p.stats||{},v=(b,n)=>fx((s[b]||{}).mean,n);
 $('infob').innerHTML=`<b>${p.name}</b><br>LST TB: ${v('LST',2)} °C · NDVI TB: ${v('NDVI',3)} · TVDI TB: ${v('TVDI',3)}<br>Số pixel: ${(s[idx]||{}).count??'–'}`;
 $('info').style.display='block'}
let dl={};
function districts(){drop('dist');dl={};if(!geo||!$('dist').checked)return;
 put('dist',L.geoJSON(geo.districts,{style:dStyle,onEachFeature:(f,l)=>{
  const p=f.properties;dl[p.name]=l;l.bindTooltip(p.name,{sticky:true});
  l.on({click:()=>showInfo(p),mouseover:e=>e.target.setStyle({weight:2.5,color:'#d32f2f'}),mouseout:e=>L_.dist.resetStyle(e.target)})}}),'Phường/xã')}
function fillDist(){const s=$('dsel');s.length=1;
 if(geo)geo.districts.features.map(f=>f.properties.name).sort((a,b)=>a.localeCompare(b,'vi',{numeric:true})).forEach(n=>s.add(new Option(n,n)))}
$('dsel').onchange=e=>{const l=dl[e.target.value];if(l){map.fitBounds(l.getBounds(),{padding:[40,40]});showInfo(l.feature.properties)}};
$('dist').onchange=districts;$('fill').onchange=districts;
$('op').oninput=e=>L_.gee&&L_.gee.setOpacity(+e.target.value);

async function J(u){const r=await fetch(u),d=await r.json();if(!r.ok)throw new Error(d.detail||'Lỗi '+r.status);return d}
async function loadRegions(y,c){const t=++tok;$('rgmsg').textContent='Đang tải phường/xã từ GEE (lần đầu có thể mất 1–2 phút)...';
 try{const d=await J(`/api/stats/regions?year=${y}&cloud=${c}`);if(t!==tok)return;geo=d;
  districts();fillDist();$('rgmsg').textContent='Bấm vào một phường/xã để xem số liệu, hoặc chọn trong danh sách.'}
 catch(e){if(t===tok)$('rgmsg').innerHTML='<span class="err">Không tải được phường/xã: '+e.message+(e.message==='Not Found'?' (hãy khởi động lại uvicorn)':'')+'</span>'}}

$('btn').onclick=async()=>{
 const b=$('btn'),m=$('msg');idx=$('idx').value;b.disabled=true;m.className='msg';m.textContent='Đang tính trên GEE (lần đầu mỗi năm có thể mất 1–3 phút)...';
 try{
  const d=await J('/api/map?'+new URLSearchParams({index:idx,year:$('yr').value,cloud:$('c').value,classify:$('cls').checked&&idx!=='NDVI'}));
  geo=null;tok++;drop('dist');fillDist();
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