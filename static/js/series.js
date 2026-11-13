/* ===== CHUỖI THỜI GIAN, ĐỐI CHIẾU DỮ LIỆU ĐỘC LẬP, ƯỚC LƯỢNG NGOẠI SUY =====
   Vẽ biểu đồ Chart.js khổ lớn trong thẻ có tiêu đề; typography do main.js đặt mặc định chung. */
let mode='year',chart;
const SE_T={year:['Biểu đồ theo mùa khô (nhiều năm)','Bảng số liệu theo mùa khô'],
 month:['Biểu đồ theo tháng','Bảng số liệu theo tháng'],
 combo:['Kết hợp: cột NDVI + đường LST · TVDI','Bảng số liệu theo mùa khô']};

async function loadAll(){try{yearRows=await (await fetch('/api/timeseries')).json();monthRows=await (await fetch('/api/monthly')).json();}catch(e){}
 if(tab==='year')render();drawSeries();valid();
 if(toolTab==='ana')drawAna();}

function setMode(m){mode=m;for(const [id,k] of [['mY','year'],['mM','month'],['mC','combo']])$(id).classList.toggle('on',m===k);drawSeries();}

/* ước lượng ngoại suy tuyến tính trên chính chuỗi đã quét (không phải số liệu quan trắc) */
function forecast(){const x=yearRows.map(r=>r.Nam),L=x[x.length-1],o={};for(const k in K)o[k]=ols(x,yearRows.map(r=>+r[K[k]]));
 return [1,2,3].map(h=>{const yv=L+h,r={y:yv};for(const k in K){const v=o[k].a+o[k].b*yv;r[k]=k==='LST'?v:Math.max(0,Math.min(1,v));r[k+'sd']=1.96*o[k].sd;}return r;});}

function drawSeries(){
 const isY=mode!=='month',R=isY?yearRows:monthRows;chart&&chart.destroy();chart=null;
 const T=SE_T[mode]||SE_T.year;$('seChartT').textContent=T[0];$('seTabT').textContent=T[1];
 if(!R.length){$('smsg2').textContent='';$('stw').innerHTML=`<div class="empty">${isY?'Chưa có dữ liệu. Vào mục Bản đồ › Quét chuỗi thời gian rồi bấm "Quét &amp; lưu".':'Chưa có dữ liệu theo tháng. Chạy WebGIS_bosung_pg.sql rồi quét lại (chế độ "Chuỗi năm + chuỗi tháng").'}</div>`;return;}
 $('smsg2').textContent='';const g=k=>R.map(r=>r[k]==null?null:+r[k]);let labels=R.map(r=>isY?String(r.Nam):r.Thang_Nam);
 const ds=[['LST (°C)','LST_TrungBinh','#d32f2f','y'],['NDVI','NDVI_TrungBinh','#2e7d32','y1'],['TVDI','TVDI_TrungBinh','#f9a825','y1']].map(([l,k,c,ax])=>({label:l,data:g(k),borderColor:c,backgroundColor:c,yAxisID:ax,tension:.2}));
 if(mode==='combo'){ds[1].type='bar';ds[1].backgroundColor='#81c784aa';}   /* biểu đồ kết hợp: cột NDVI + đường LST, TVDI */
 if(mode==='year'&&R.length>=4){const f=forecast(),n=R.length;labels=[...labels,...f.map(r=>String(r.y))];ds.forEach(d=>d.data.push(null,null,null));
  [['LST','#d32f2f','y'],['NDVI','#2e7d32','y1'],['TVDI','#f9a825','y1']].forEach(([k,c,ax],i)=>ds.push({label:k+' (ngoại suy)',borderColor:c,backgroundColor:c,borderDash:[6,4],pointStyle:'triangle',pointRadius:4,
   data:[...Array(n-1).fill(null),ds[i].data[n-1],...f.map(r=>r[k])]}));}
 const ax=(t)=>({title:{display:true,text:t,font:{size:14.5,weight:'700'},color:'#0b2a4a'},ticks:{font:{size:14},color:'#33475c'},grid:{color:'#e6ecf3'}});
 chart=new Chart($('chart'),{type:'line',data:{labels,datasets:ds},options:{responsive:true,maintainAspectRatio:false,
  interaction:{mode:'index',intersect:false},
  plugins:{legend:{position:'top',align:'start',labels:{usePointStyle:true,boxWidth:9,padding:18,font:{size:14.5,weight:'600'},color:'#22303d'}},
   tooltip:{backgroundColor:'#0b2a4a',padding:12,cornerRadius:10,usePointStyle:true,titleFont:{size:15,weight:'700'},bodyFont:{size:14}}},
  scales:{x:{grid:{display:false},ticks:{font:{size:14},color:'#33475c',maxRotation:0,autoSkip:true}},
   y:{position:'left',...ax('LST (°C)')},
   y1:{position:'right',min:0,max:1,grid:{drawOnChartArea:false},...ax('NDVI · TVDI')}}}});
 sortKey=null;$('stw').innerHTML=tbl(isY?YC:MC,R);}


/* ===== ĐỐI CHIẾU VỚI DỮ LIỆU ĐỘC LẬP TRÊN GEE (MODIS, ERA5-Land, CHIRPS) =====
   Backend: /api/validate (theo pixel/ô lưới, một năm) và /api/validate/city (trung bình toàn thành phố, từng năm). */
let vCh=[];
const vf=(v,d=3)=>v==null||Number.isNaN(v)?'–':Number(v).toFixed(d);
function vCanvases(id,n,minw=340){
 $(id).innerHTML=Array.from({length:n},(_,i)=>`<div style="flex:1 1 ${minw}px;max-width:480px"><canvas id="${id}${i}"></canvas></div>`).join('');
 return [...Array(n).keys()].map(i=>$(id+i));}

/* nhận xét tự sinh: chỉ dùng đại lượng tính từ số liệu, không có mốc "đạt/không đạt" cố định */
function vRemark(c,m){
 const d=c.idx==='LST'?2:3;
 if(c.mode==='agree')return `RMSE = ${vf(m.rmse/m.sd_ref,2)} × độ lệch chuẩn của tham chiếu; bias = ${vf(m.bias,d)} (${vf(100*Math.abs(m.bias)/m.sd_ref,0)}% SD); độ dốc ${vf(m.slope,2)} (${m.slope>1?'web biến thiên mạnh hơn':'web biến thiên yếu hơn'} tham chiếu)`;
 const same=c.expect<0?m.r<0:m.r>0,sig=m.ci&&(m.ci[0]>0||m.ci[1]<0);
 return `r ${m.r<0?'âm':'dương'}: ${same?'cùng chiều':'NGƯỢC chiều'} kỳ vọng vật lý (TVDI cao ↔ đất khô/ít mưa); ${sig?'có':'không'} ý nghĩa thống kê (khoảng tin cậy 95% ${sig?'không chứa':'chứa'} 0)`;
}

/* run=false: chỉ vẽ phần ước lượng + gợi ý (gọi tự động khi mở tab); run=true: chạy đối chiếu thật */
async function valid(run){
 drawForecast();
 const w=$('vtab'),m=$('vmsg'),b=$('vbtn');
 if(!w||!m||!b)return;
 if(!run){if(!w.innerHTML.trim())w.innerHTML='<div class="empty">Chọn năm rồi bấm "Đối chiếu" để so sánh với MODIS, ERA5-Land, CHIRPS trên GEE.</div>';return;}
 b.disabled=true;m.className='msg';m.textContent='Đang lấy dữ liệu tham chiếu từ GEE (lần đầu có thể mất vài phút)...';
 try{
  const D=await J(`/api/validate?year=${$('vy').value}&cloud=${$('c').value}`);
  vCh.forEach(c=>c.destroy());vCh=[];
  const ok=D.cases.filter(c=>c.m);
  w.innerHTML='<table class="v"><thead><tr><th>Chỉ số</th><th>Dữ liệu tham chiếu độc lập</th><th>Lưới</th><th>n</th><th>r [KTC 95%]</th><th>R²</th><th>RMSE</th><th>MAE</th><th>Bias</th><th>Nhận xét (tính từ số liệu)</th></tr></thead><tbody>'+
   D.cases.map(c=>{const x=c.m,d=c.idx==='LST'?2:3;
    if(!x)return `<tr><td><b>${c.idx}</b></td><td>${c.ref}</td><td>${c.res}</td><td colspan="7" class="err">${esc(c.error||'Không có dữ liệu')}</td></tr>`;
    const ag=c.mode==='agree';
    return `<tr><td><b>${c.idx}</b></td><td><b>${c.title}</b><br>${c.ref}</td><td>${c.res}</td><td>${x.n}</td>`+
     `<td>${vf(x.r)} [${x.ci?vf(x.ci[0],2)+' ; '+vf(x.ci[1],2):'–'}]</td><td>${vf(x.r2)}</td>`+
     `<td>${ag?vf(x.rmse,d)+' '+c.unit:'–'}</td><td>${ag?vf(x.mae,d)+' '+c.unit:'–'}</td><td>${ag?vf(x.bias,d)+' '+c.unit:'–'}</td><td>${vRemark(c,x)}</td></tr>`;}).join('')+'</tbody></table>';
  const cs=vCanvases('vsc',ok.length);
  ok.forEach((c,i)=>{const P=c.scatter.map(p=>({x:p[1],y:p[0]})),xs=P.map(p=>p.x),x0=Math.min(...xs),x1=Math.max(...xs),q=c.m;
   const ds=[{label:'Pixel / ô lưới',data:P,pointRadius:2,backgroundColor:'#1a73e8aa'}];
   if(c.mode==='agree')ds.push({type:'line',label:'Đường 1 : 1',data:[{x:x0,y:x0},{x:x1,y:x1}],borderColor:'#000',borderDash:[5,4],pointRadius:0});
   ds.push({type:'line',label:'Hồi quy',data:[{x:x0,y:q.intercept+q.slope*x0},{x:x1,y:q.intercept+q.slope*x1}],borderColor:'#d32f2f',pointRadius:0});
   vCh.push(new Chart(cs[i],{type:'scatter',data:{datasets:ds},options:{plugins:{title:{display:true,text:`${c.title} · ${D.year}`}},
    scales:{x:{title:{display:true,text:c.ref_label}},y:{title:{display:true,text:'Landsat (web) · '+c.idx}}}}}));});
  m.className='msg ok';m.textContent=`Năm ${D.year}: ${D.n_images} ảnh Landsat 8/9; ${ok.length}/${D.cases.length} bộ tham chiếu có kết quả.`;
 }catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}finally{b.disabled=false;}
}

/* đối chiếu chuỗi năm: trung bình toàn thành phố của web vs MODIS trên cùng tập pixel hợp lệ (chỉ LST, NDVI;
   TVDI không đưa vào vì mỗi năm có biên khô/ướt riêng nên không cùng thang giữa các năm) */
async function validSeries(){
 const m=$('vmsg'),b=$('vbtn2'),ys=yearRows.length?yearRows.map(r=>r.Nam):Array.from({length:Y-2015},(_,i)=>2016+i),R=[];
 b.disabled=true;m.className='msg';
 try{
  for(const y of ys){m.textContent=`Đang đối chiếu năm ${y} (${R.length+1}/${ys.length})...`;
   try{R.push(await J(`/api/validate/city?year=${y}&cloud=${$('c').value}`));}catch(e){R.push({year:y,error:e.message});}}
  const G=R.filter(r=>!r.error&&r.LST&&r.LST.web!=null&&r.LST.ref!=null&&r.NDVI&&r.NDVI.web!=null&&r.NDVI.ref!=null),bad=R.length-G.length;
  vCh.forEach(c=>c.destroy());vCh=[];
  if(G.length<4){$('vtab').innerHTML='<div class="empty">Cần tối thiểu 4 năm có đủ dữ liệu để đối chiếu chuỗi.</div>';m.className='msg err';m.textContent=R.filter(r=>r.error).map(r=>r.year+': '+r.error).join(' | ');return;}
  const rows=['LST','NDVI'].map(k=>{const web=G.map(r=>r[k].web),ref=G.map(r=>r[k].ref),n=G.length,d=web.map((v,i)=>v-ref[i]);
   let same=0;for(let i=1;i<n;i++)if(Math.sign(web[i]-web[i-1])===Math.sign(ref[i]-ref[i-1]))same++;
   return {k,n,r:pearson(ref,web),rmse:Math.sqrt(d.reduce((s,v)=>s+v*v,0)/n),bias:d.reduce((s,v)=>s+v,0)/n,dir:`${same}/${n-1} năm`,web,ref};});
  $('vtab').innerHTML='<table class="v"><thead><tr><th>Chỉ số</th><th>Tham chiếu</th><th>Số năm</th><th>r (TB năm)</th><th>RMSE</th><th>Bias</th><th>Năm biến động cùng chiều</th></tr></thead><tbody>'+
   rows.map(x=>`<tr><td><b>${x.k}</b></td><td>${x.k==='LST'?'MODIS MOD11A1 (cùng ngày)':'MODIS MOD13Q1'}</td><td>${x.n}</td><td>${vf(x.r)}</td><td>${vf(x.rmse,x.k==='LST'?2:3)}</td><td>${vf(x.bias,x.k==='LST'?2:3)}</td><td>${x.dir}</td></tr>`).join('')+'</tbody></table>';
  const cs=vCanvases('vsc',2,420);
  rows.forEach((x,i)=>vCh.push(new Chart(cs[i],{type:'line',data:{labels:G.map(r=>String(r.year)),datasets:[
   {label:'Landsat (web)',data:x.web,borderColor:'#d32f2f',backgroundColor:'#d32f2f'},
   {label:x.k==='LST'?'MODIS MOD11A1':'MODIS MOD13Q1',data:x.ref,borderColor:'#1565c0',backgroundColor:'#1565c0'}]},
   options:{plugins:{title:{display:true,text:`${x.k} trung bình toàn thành phố theo năm (cùng pixel hợp lệ)`}}}})));
  m.className='msg ok';m.textContent=`Đã đối chiếu ${G.length} năm`+(bad?` (bỏ ${bad} năm lỗi/thiếu dữ liệu)`:'')+'.';
 }catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}finally{b.disabled=false;}
}

/* bảng ước lượng ngoại suy 3 năm: hồi quy tuyến tính trên chính chuỗi đã quét */
function drawForecast(){
 const el=$('ftab');if(!el)return;
 if(yearRows.length<4){el.innerHTML='<div class="empty">Cần tối thiểu 4 năm dữ liệu (quét ở mục Bản đồ).</div>';return;}
 const f=(v,n)=>Number(v).toFixed(n);
 el.innerHTML='<table><thead><tr><th>Năm</th><th>LST (°C)</th><th>NDVI</th><th>TVDI</th></tr></thead><tbody>'+
  forecast().map(q=>`<tr><td>${q.y}</td><td>${f(q.LST,2)} ± ${f(q.LSTsd,2)}</td><td>${f(q.NDVI,3)} ± ${f(q.NDVIsd,3)}</td><td>${f(q.TVDI,3)} ± ${f(q.TVDIsd,3)}</td></tr>`).join('')+'</tbody></table>';
}