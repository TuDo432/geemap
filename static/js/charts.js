/* ===== BIỂU ĐỒ SO SÁNH ===== */
const CH={col:'Cột: so sánh giá trị trung bình LST, NDVI, TVDI giữa toàn thành phố, nhóm các phường và nhóm các xã.',
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
