/* ===== CHUỖI THỜI GIAN, KIỂM CHỨNG, DỰ BÁO =====
   Vẽ biểu đồ Chart.js khổ lớn trong thẻ có tiêu đề; typography do main.js đặt mặc định chung. */
let mode='year',chart;
const SE_T={year:['Biểu đồ theo mùa khô (nhiều năm)','Bảng số liệu theo mùa khô'],
 month:['Biểu đồ theo tháng','Bảng số liệu theo tháng'],
 combo:['Kết hợp: cột NDVI + đường LST · TVDI','Bảng số liệu theo mùa khô']};
async function loadAll(){try{yearRows=await (await fetch('/api/timeseries')).json();monthRows=await (await fetch('/api/monthly')).json();}catch(e){}
 if(tab==='year')render();drawSeries();valid();
 if(toolTab==='ana')drawAna();}
function setMode(m){mode=m;for(const [id,k] of [['mY','year'],['mM','month'],['mC','combo']])$(id).classList.toggle('on',m===k);drawSeries();}
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
  [['LST','#d32f2f','y'],['NDVI','#2e7d32','y1'],['TVDI','#f9a825','y1']].forEach(([k,c,ax],i)=>ds.push({label:k+' (dự báo)',borderColor:c,backgroundColor:c,borderDash:[6,4],pointStyle:'triangle',pointRadius:4,
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
