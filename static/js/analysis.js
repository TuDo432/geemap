/* ===== PHÂN TÍCH & ĐÁNH GIÁ SAU QUÉT ===== */
const SEV={'-1':['Thông tin','#607d8b'],0:['Ổn định','#2e7d32'],1:['Lưu ý','#f9a825'],2:['Cảnh báo','#c62828']};
const ANAC=[{k:'tt',l:'Tình huống'},{k:'kq',l:'Kết quả'},{k:'muc',l:'Mức'},{k:'dg',l:'Đánh giá'},{k:'kn',l:'Khuyến nghị'}];
let anaRows=[];
const AU_ANA={y:'auAnY',s:'auAnSum',w:'auAnW'};   // vùng hiển thị phân tích ở mục Tự động hóa
function drawAna(ID={y:'anY',s:'ansum',w:'anw'}){
 const sel=$(ID.y),old=sel.value;sel.innerHTML=yearRows.map(r=>r.Nam).reverse().map(y=>`<option>${y}</option>`).join('');
 if(old&&[...sel.options].some(o=>o.value===old))sel.value=old;
 const w=$(ID.w);
 if(yearRows.length<2){w.innerHTML='<div class="empty">Chưa có dữ liệu. Hãy "Quét &amp; lưu" ở mục Bản đồ (tối thiểu 2 năm, nên ≥ 4 năm để xét xu hướng).</div>';$(ID.s).innerHTML='';anaRows=[];return;}
 const Yr=+sel.value,R=yearRows.filter(r=>r.Nam<=Yr),cur=R[R.length-1],n=R.length,x=R.map(r=>r.Nam);
 const col=k=>R.map(r=>+r[K[k]]),mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
 const sd=a=>Math.sqrt(a.reduce((s,v)=>s+(v-mean(a))**2,0)/Math.max(a.length-1,1))||1e-9;
 const f=(v,d=2)=>Number(v).toFixed(d),out=[],add=(tt,sev,kq,dg,kn)=>out.push({tt,sev,kq,dg,kn});
 const tier=(k,v)=>{const c=CLS[k]||[],nm=lvl(k,v),d=Math.max(c.length-1,1);
  if(nm){const i=c.findIndex(q=>q.name===nm);return {n:nm,s:i/d>=.67?2:i/d>=.34?1:0};}
  const t=k==='LST'?[32,36]:[.4,.6];return {n:'(chưa có phân cấp)',s:v>=t[1]?2:v>=t[0]?1:0};};

 // 1. Hiện trạng theo thang phân cấp
 const tl=tier('LST',+cur.LST_TrungBinh),tt=tier('TVDI',+cur.TVDI_TrungBinh),s1=Math.max(tl.s,tt.s);
 add('1. Hiện trạng năm '+Yr,s1,`LST ${f(cur.LST_TrungBinh)} °C (${tl.n}); TVDI ${f(cur.TVDI_TrungBinh,3)} (${tt.n}); NDVI ${f(cur.NDVI_TrungBinh,3)}`,
  s1===2?'Nhiệt độ bề mặt hoặc khô hạn ở mức cao so với thang phân cấp.':s1===1?'Ở mức trung bình, cần theo dõi.':'Ở mức thấp, chưa có dấu hiệu bất lợi.',
  s1===2?'Ưu tiên xác định khu vực nóng/khô (tab Ô lưới, Gi*) để tăng mảng xanh, mặt nước.':'Tiếp tục giám sát theo mùa khô hằng năm.');

 // 2-4. Xu hướng dài hạn (Mann–Kendall + độ dốc Sen)
 if(n>=4)[['LST','nhiệt độ bề mặt',true,'°C'],['NDVI','thảm thực vật',false,''],['TVDI','khô hạn',true,'']].forEach(([k,nm,upBad,u],i)=>{
  const t=mk(x,col(k)),bad=upBad?t.sen>0:t.sen<0,sig=t.p<.05,sev=bad?(sig?2:1):0,d=k==='LST'?3:4;
  add(`${2+i}. Xu hướng ${nm} (${x[0]}–${Yr})`,sev,`Sen = ${f(t.sen,d)}${u}/năm (≈ ${f(t.sen*10,2)}${u}/10 năm); p = ${f(t.p,3)}`,
   sig?(bad?`Xu hướng bất lợi có ý nghĩa thống kê (${upBad?'tăng':'giảm'}).`:`Xu hướng có lợi, có ý nghĩa thống kê.`):bad?'Có chiều hướng bất lợi nhưng chưa đủ ý nghĩa thống kê (p ≥ 0,05).':'Không thấy xu hướng bất lợi.',
   sev===2?'Cần đưa vào báo cáo và đề xuất giải pháp giảm thiểu.':sev===1?'Quét thêm năm để kiểm chứng xu hướng.':'Duy trì giám sát.');});
 else add('2-4. Xu hướng dài hạn',-1,`Mới có ${n} năm dữ liệu`,'Mann–Kendall cần tối thiểu 4 năm.','Quét thêm các năm trước ở mục Bản đồ.');

 // 5. Năm cực đoan
 if(n>=3){const L=col('LST'),z=(L[n-1]-mean(L))/sd(L),hi=R[L.indexOf(Math.max(...L))],lo=R[L.indexOf(Math.min(...L))],sev=z>=1.5?2:z>=1?1:0;
  add('5. Vị trí của năm '+Yr+' so với chuỗi',sev,`z(LST) = ${f(z)}; năm nóng nhất ${hi.Nam} (${f(hi.LST_TrungBinh)} °C), mát nhất ${lo.Nam} (${f(lo.LST_TrungBinh)} °C)`,
   sev===2?'Năm cực đoan nóng so với chuỗi quan sát.':sev===1?'Cao hơn đáng kể so với trung bình chuỗi.':'Trong phạm vi biến động bình thường của chuỗi.',
   sev?'Đối chiếu với điều kiện ENSO/thời tiết của mùa khô năm đó.':'–');}

 // 6. Biến động năm-qua-năm
 if(n>=2){let best={d:0,y:cur.Nam};for(let i=1;i<n;i++){const d=+R[i].LST_TrungBinh-+R[i-1].LST_TrungBinh;if(Math.abs(d)>Math.abs(best.d))best={d,y:R[i].Nam};}
  const a=Math.abs(best.d),sev=a>2?2:a>1?1:0,last=+cur.LST_TrungBinh-+R[n-2].LST_TrungBinh;
  add('6. Biến động LST giữa hai năm liên tiếp',sev,`Lớn nhất: ${best.d>0?'+':''}${f(best.d)} °C (năm ${best.y}); năm ${Yr} so với năm trước: ${last>0?'+':''}${f(last)} °C`,
   sev?'Biến động lớn, có thể do khác biệt số ảnh/mây hoặc thời tiết.':'Biến động nhỏ, chuỗi ổn định.',sev?'Kiểm tra số ảnh và tỷ lệ mây của năm đó (tab Lịch sử & ảnh).':'–');}

 // 7. Tổ hợp nóng – khô – ít xanh
 if(n>=3){const zs=k=>{const a=col(k);return (a[n-1]-mean(a))/sd(a);},zl=zs('LST'),zn=zs('NDVI'),zt=zs('TVDI'),c=(zl>=.5)+(zn<=-.5)+(zt>=.5),sev=c===3?2:c===2?1:0;
  add('7. Tổ hợp nóng – khô – ít thực vật',sev,`z: LST ${f(zl)}, NDVI ${f(zn)}, TVDI ${f(zt)} (${c}/3 điều kiện bất lợi)`,
   c===3?'Cả ba chỉ số cùng bất lợi: nguy cơ đảo nhiệt và hạn cao.':c===2?'Hai trong ba chỉ số bất lợi.':'Không có tổ hợp bất lợi.',c>=2?'Ưu tiên khu vực có NDVI thấp và LST cao để can thiệp.':'–');}

 // 8. Tương quan NDVI–LST (pixel)
 if(lastR==null)add('8. Tương quan NDVI–LST (pixel)',-1,'Chưa tính','Cần bấm "Hiển thị bản đồ" ít nhất một lần.','–');
 else{const ok=lastR<-.5;add(`8. Tương quan NDVI–LST (năm ${lastRY})`,ok?0:1,`r = ${f(lastR,3)}; R² = ${f(lastR*lastR,3)}`,
  ok?'Tương quan nghịch rõ, phù hợp lý thuyết: thực vật nhiều thì nhiệt độ thấp.':'Tương quan nghịch yếu hơn kỳ vọng.',ok?'Dùng tăng độ phủ xanh làm giải pháp giảm nhiệt có cơ sở.':'Kiểm tra mây, bóng mây và mặt nước ở tiền xử lý.');}

 // 9. Theo tháng trong mùa khô
 const mr=monthRows.filter(r=>+r.Nam===Yr);
 if(!mr.length)add('9. Diễn biến theo tháng (mùa khô '+Yr+')',-1,'Chưa có dữ liệu tháng','Quét ở chế độ "Chuỗi năm + chuỗi tháng".','–');
 else{const mx=k=>mr.reduce((a,b)=>+b[K[k]]>+a[K[k]]?b:a),h=mx('LST'),d=mx('TVDI');
  add('9. Diễn biến theo tháng (mùa khô '+Yr+')',-1,`Tháng nóng nhất: ${h.Thang_Nam} (${f(h.LST_TrungBinh)} °C); khô nhất: ${d.Thang_Nam} (TVDI ${f(d.TVDI_TrungBinh,3)})`,
   'Cho biết giai đoạn cao điểm trong mùa khô.','Tập trung cảnh báo/tưới/cấp nước vào các tháng này.');}

 // 10. Điểm nóng trên bản đồ đang hiển thị
 if(gridRows.length){const a=gridRows.filter(r=>r.mean!=null),hot=a.filter(r=>/Điểm nóng/.test(r.nhom||'')).length,sh=100*hot/a.length,
   top=[...a].sort((p,q)=>curIdx==='NDVI'?p.mean-q.mean:q.mean-p.mean).slice(0,3).map(r=>`${r.Name} (${f(r.mean,curIdx==='LST'?2:3)})`).join(', ');
  const sev=curIdx==='NDVI'?-1:sh>=15?2:sh>=5?1:0;
  add(`10. Điểm nóng Gi* (${curIdx} ${lastRY||''})`,sev,`${hot}/${a.length} ô là điểm nóng (${f(sh,1)}%); nổi bật: ${top}`,
   curIdx==='NDVI'?'Với NDVI, điểm "nóng" nghĩa là nhiều thực vật; xem top ô thấp nhất để tìm vùng thiếu xanh.':sev===2?'Điểm nóng tập trung nhiều.':sev===1?'Có điểm nóng cục bộ.':'Ít điểm nóng.',sev>0?'Mở tab Phường/xã để xác định đơn vị hành chính chịu ảnh hưởng.':'–');}

 // 11. Thông số hiện tại (chụp nhanh tự động) so với chuỗi mùa khô
 if(auSnapLast&&n>=3){const s=auSnapLast,L=col('LST'),Nd=col('NDVI'),zl=(+s.LST_TB-mean(L))/sd(L),zn=(+s.NDVI_TB-mean(Nd))/sd(Nd),dv=+s.LST_TB-+cur.LST_TrungBinh,sev=zl>=1.5?2:zl>=1?1:0;
  add('11. Hiện tại (chụp nhanh '+String(s.Ngay_KetThuc).slice(0,10)+') so với chuỗi mùa khô',sev,
   `LST ${f(s.LST_TB)} °C (${s.Muc_LST||'–'}), lệch ${dv>0?'+':''}${f(dv)} °C so với mùa khô ${cur.Nam}; z(LST) = ${f(zl)}, z(NDVI) = ${f(zn)}; TVDI ${s.TVDI_TB==null?'–':f(s.TVDI_TB,3)} (${s.Muc_TVDI||'–'})`,
   sev===2?'Nhiệt độ hiện tại cao bất thường so với chuỗi mùa khô.':sev===1?'Cao hơn đáng kể so với trung bình chuỗi.':'Trong phạm vi bình thường của chuỗi.',
   'Chỉ để tham khảo: ảnh hiện tại không cùng mùa khô nên so sánh có độ lệch theo mùa.');}

 anaRows=out.map(r=>({...r,muc:SEV[r.sev][0]}));
 const wmax=Math.max(...out.map(r=>r.sev)),c2=out.filter(r=>r.sev===2).length,c1=out.filter(r=>r.sev===1).length;
 $(ID.s).innerHTML=`<div class="ana-sum" style="border-left-color:${SEV[wmax][1]}"><b>Kết luận năm ${Yr}:</b> ${c2} cảnh báo, ${c1} lưu ý trên ${out.length} tình huống. `+
  (wmax===2?'Có chỉ báo ở mức cảnh báo, nên xem chi tiết bên dưới và đối chiếu với điều kiện thực địa.':wmax===1?'Có một số chỉ báo cần lưu ý nhưng chưa nghiêm trọng.':'Các chỉ báo hiện ổn định.')+'</div>';
 w.innerHTML='<table class="v"><thead><tr><th>Tình huống</th><th>Kết quả</th><th>Mức</th><th>Đánh giá</th><th>Khuyến nghị</th></tr></thead><tbody>'+
  out.map(r=>`<tr><td><b>${r.tt}</b></td><td>${r.kq}</td><td><span class="badge" style="background:${SEV[r.sev][1]}">${SEV[r.sev][0]}</span></td><td>${r.dg}</td><td>${r.kn}</td></tr>`).join('')+'</tbody></table>';}
