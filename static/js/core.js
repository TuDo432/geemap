/* ===== CORE: tiện ích và trạng thái dùng chung (nạp ĐẦU TIÊN) ===== */
const $=id=>document.getElementById(id), Y=new Date().getFullYear();
const hex2rgb=h=>{const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255];};
function colorAt(t,pal){t=Math.max(0,Math.min(1,t));const k=t*(pal.length-1),i=Math.min(Math.floor(k),pal.length-2),f=k-i,a=hex2rgb(pal[i]),b=hex2rgb(pal[i+1]);return 'rgb('+a.map((v,j)=>Math.round(v+(b[j]-v)*f)).join(',')+')';}
const J=async u=>{
  const r=await fetch(u), t=await r.text();
  let d=null; try{d=JSON.parse(t)}catch{}
  if(!r.ok) throw new Error((d&&d.detail)||`HTTP ${r.status}: ${t.slice(0,200)}`);
  return d;
};
const thr=(f,ms)=>{let t=0,p=null;return(...a)=>{const n=Date.now();if(n-t>=ms){t=n;f(...a);}else{clearTimeout(p);p=setTimeout(()=>{t=Date.now();f(...a);},ms);}};};
const fm=(v,n=3)=>v==null?'–':Number(v).toFixed(n);
const f3=v=>v==null?'–':v.toFixed(3);
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');

/* ---------- thang màu / hằng số chỉ số ---------- */
let CLS={};
let VISJS={LST:{min:20,max:45,palette:["#0000FF","#0066FF","#00FFFF","#00FF00","#FFFF00","#FFCC00","#FF6600","#FF0000"]},NDVI:{min:-0.2,max:1,palette:["#FF0000","#FF7F00","#FFFF00","#ADFF2F","#00FF00","#00FFFF","#007FFF","#0000FF"]},TVDI:{min:0,max:1,palette:["#066b00","#0bc400","#0ce100","#00ff00","#ffff00","#ffcc00","#ff6600","#ff0000"]}};
const UN={LST:' °C',NDVI:'',TVDI:''},NM={LST:'LST – Nhiệt độ bề mặt (°C)',NDVI:'NDVI – Chỉ số thực vật',TVDI:'TVDI – Chỉ số khô hạn'},IDX=['LST','NDVI','TVDI'];
const K={LST:'LST_TrungBinh',NDVI:'NDVI_TrungBinh',TVDI:'TVDI_TrungBinh'};
const giColor=z=>z==null?null:z>=2.58?'#b2182b':z>=1.96?'#ef8a62':z>=1.65?'#fddbc7':z<=-2.58?'#2166ac':z<=-1.96?'#67a9cf':z<=-1.65?'#d1e5f0':null;
const norm=(k,v)=>Math.max(0,Math.min(1,(v-VISJS[k].min)/(VISJS[k].max-VISJS[k].min)));
const lvl=(k,v)=>{const c=(CLS[k]||[]);for(let i=0;i<c.length;i++)if(v<c[i].hi||i===c.length-1)return c[i].name;return null;};

/* ---------- thống kê: hồi quy, Mann–Kendall ---------- */
function ols(x,y){const n=x.length,mx=x.reduce((a,b)=>a+b)/n,my=y.reduce((a,b)=>a+b)/n;let sxx=0,sxy=0;x.forEach((v,i)=>{sxx+=(v-mx)**2;sxy+=(v-mx)*(y[i]-my);});
 const b=sxy/sxx,a=my-b*mx,sd=Math.sqrt(y.reduce((s,v,i)=>s+(v-(a+b*x[i]))**2,0)/Math.max(n-2,1));return {a,b,sd};}
function erf(x){const t=1/(1+.3275911*Math.abs(x)),y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);return x>=0?y:-y;}
function mk(x,y){const n=y.length;let s=0,sl=[];for(let i=0;i<n-1;i++)for(let j=i+1;j<n;j++){s+=Math.sign(y[j]-y[i]);sl.push((y[j]-y[i])/(x[j]-x[i]));}
 const v=n*(n-1)*(2*n+5)/18,z=s>0?(s-1)/Math.sqrt(v):s<0?(s+1)/Math.sqrt(v):0,p=2*(1-.5*(1+erf(Math.abs(z)/Math.SQRT2)));
 sl.sort((a,b)=>a-b);const m=sl.length>>1;return {p,sen:sl.length%2?sl[m]:(sl[m-1]+sl[m])/2};}
function pearson(x,y){const n=x.length,mx=x.reduce((a,b)=>a+b)/n,my=y.reduce((a,b)=>a+b)/n;let a=0,b=0,c=0;x.forEach((v,i)=>{a+=(v-mx)*(y[i]-my);b+=(v-mx)**2;c+=(y[i]-my)**2;});return a/Math.sqrt(b*c);}

/* ---------- bảng số liệu dùng chung ---------- */
const N=(k,l,n=3)=>({k,l,f:v=>v==null?'–':Number(v).toFixed(n)}),T=(k,l)=>({k,l,f:v=>v==null?'–':/^\d{4}-\d{2}-\d{2}T/.test(v)?String(v).replace('T',' ').slice(0,19):String(v)});
let tab='year',yearRows=[],monthRows=[],gridRows=[],gridLayers={},sortKey=null,sortDir=1,cur={cols:[],rows:[],click:null};
const tbl=(cols,rows,hl)=>'<table><thead><tr>'+cols.map(c=>`<th data-k="${c.k}">${c.l}${sortKey===c.k?(sortDir>0?' ▲':' ▼'):''}</th>`).join('')+'</tr></thead><tbody>'+
 rows.map((r,i)=>`<tr data-i="${i}"${hl&&hl(r)?' class="hl"':''}>`+cols.map(c=>`<td>${c.f(r[c.k])}</td>`).join('')+'</tr>').join('')+'</tbody></table>';
function csv(name,cols,rows){if(!rows.length)return alert('Chưa có dữ liệu để xuất.');const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const t=[cols.map(c=>q(c.l)).join(',')].concat(rows.map(r=>cols.map(c=>q(r[c.k])).join(','))).join('\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+t],{type:'text/csv'}));a.download=name;a.click();}
