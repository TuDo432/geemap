/* ===== LỊCH SỬ & ẢNH (tra ngược lượt quét) ===== */
let runs=[],htab='sum';
async function loadRuns(){try{runs=await (await fetch('/api/runs')).json();}catch(e){runs=[];}
 $('runSel').innerHTML=runs.map(r=>`<option value="${r.Ma_LuotQuet}">#${r.Ma_LuotQuet} · ${String(r.ThoiGian_Quet).replace('T',' ').slice(0,16)} · ${r.Che_Do==='THANG'?'năm + tháng':'năm'} ${r.Nam_BatDau}–${r.Nam_KetThuc} · ${r.TrangThai}</option>`).join('');
 if(!runs.length){$('runInfo').textContent='Chưa có lượt quét nào (hoặc chưa chạy WebGIS_bosung_pg.sql).';$('hw').innerHTML='';return;}showRun();}
function setH(t){htab=t;document.querySelectorAll('#hseg button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));showRun();}
async function showRun(){const id=$('runSel').value;if(!id)return;const r=runs.find(x=>x.Ma_LuotQuet==id),w=$('hw');
 $('hfil').style.display=(htab==='reg'||htab==='img')?'flex':'none';
 $('runInfo').textContent=`Mây ≤ ${r.Nguong_May_Max??'–'}% · ${r.So_Nam_CoSoLieu} năm có số liệu · ${r.So_Dong_Vung} dòng vùng · ${r.So_Anh_BanDo} ảnh bản đồ · ${r.So_ThongSo_DaLuu} thông số đã lưu · xử lý ${r.ThoiGian_XuLy_Giay??'–'} giây`;
 const JJ=u=>fetch(u).then(x=>x.json());sortKey=null;w.innerHTML='<div class="empty">Đang tải...</div>';
 try{
  if(htab==='sum')w.innerHTML=tbl([T('Nam','Năm'),T('Thang_Nam','Tháng'),N('LST_TB','LST TB',2),N('LST_Min','LST min',2),N('LST_Max','LST max',2),N('LST_DoLech','LST độ lệch',2),N('NDVI_TB','NDVI TB'),N('TVDI_TB','TVDI TB'),T('So_Anh','Số ảnh')],await JJ(`/api/run/${id}/summary`));
  else if(htab==='coef')w.innerHTML=tbl([T('Nam','Năm'),T('Thang_Nam','Tháng'),T('Ten_HeSo','Hệ số'),N('GiaTri','Giá trị',4),T('DonVi','Đơn vị')],await JJ(`/api/run/${id}/coef`));
  else if(htab==='par')w.innerHTML=tbl([T('Nhom','Nhóm'),T('Ten_ThongSo','Thông số'),T('GiaTri_TaiThoiDiem','Giá trị đã dùng'),T('DonVi','Đơn vị')],await JJ(`/api/run/${id}/params`));
  else if(htab==='reg'){const y=$('hy').value,i=$('hi').value||'LST';if(!y){w.innerHTML='<div class="empty">Chọn một năm (và chỉ số) để xem màu từng vùng.</div>';return;}
   w.innerHTML=tbl([T('Ma_Vung','Mã vùng'),N('TrungBinh','Trung bình'),N('Gia_Tri_Min','Min'),N('Gia_Tri_Max','Max'),N('Do_Lech_Chuan','Độ lệch chuẩn'),N('So_Pixel','Số pixel',0),T('Muc_Do','Mức độ'),
    {k:'Ma_Mau_Hex',l:'Màu',f:v=>v?`<span class="sw" style="background:${v}"></span> ${v}`:'–'},N('Gi_Z','Gi* (z)',2),T('Gi_Nhom','Nhóm điểm nóng/lạnh')],await JJ(`/api/run/${id}/regions?year=${y}&index=${i}`));}
   else{let im=await JJ(`/api/run/${id}/images`);const y=$('hy').value,i=$('hi').value;im=im.filter(a=>(!y||String(a.Nam)===y)&&(!i||a.Chi_So===i));
    w.innerHTML=im.length?'<div class="im-grid">'+im.map(a=>`<a class="ri" href="/api/image/${a.Ma_AnhKetQua}" target="_blank" rel="noopener"><img loading="lazy" src="/api/image/${a.Ma_AnhKetQua}" alt="${a.Chi_So} ${a.Nam}"><b>${a.Chi_So} · ${a.Nam}</b><span>${a.Che_Do_HienThi}</span><span class="hash">SHA-256: ${String(a.Ma_Hash||'').slice(0,12)}…</span></a>`).join('')+'</div>':'<div class="empty">Không có ảnh phù hợp bộ lọc.</div>';}
 }catch(e){w.innerHTML='<div class="empty err">Không đọc được dữ liệu. Đã chạy WebGIS_bosung_pg.sql chưa?</div>';}}
