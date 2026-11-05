/* ===== BẢNG THỐNG KÊ (mô tả, không gian, thời gian, tương quan, lớp phủ) ===== */
const SD={desc:'Max, Min, Trung bình, Độ lệch chuẩn, Trung vị và tứ phân vị cho toàn thành phố, nhóm các phường (đô thị) và nhóm các xã (ngoại thành).',
 spa:'Zonal statistics theo khu vực, bảng nhiệt (heat table), Moran\'s I (tụ cụm không gian) và Getis-Ord Gi* (điểm nóng/lạnh) trên ô lưới 5,5 km.',
 tim:'So sánh theo năm, xu hướng Mann–Kendall/độ dốc Sen và trung bình theo tháng trong mùa khô (cần đã quét chuỗi).',
 cor:'Tương quan Pearson (r), R² và hồi quy tuyến tính giữa LST, NDVI, TVDI trên ô lưới; kèm r NDVI–LST ở mức pixel.',
 cls:'LST, NDVI, TVDI trung bình theo nhóm lớp phủ (ESA WorldCover 2021).'};
let stab='desc';
function setS(t){stab=t;document.querySelectorAll('#sseg button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));drawStats();}
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
