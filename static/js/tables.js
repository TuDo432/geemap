/* ===== BẢNG BÊN CẠNH BẢN ĐỒ (năm, ô lưới, phường/xã, thời gian thực, ảnh, lịch sử) ===== */
const YC=[T('Nam','Năm'),N('LST_TrungBinh','LST TB (°C)',2),N('LST_Min','LST min',2),N('LST_Max','LST max',2),N('NDVI_TrungBinh','NDVI TB'),N('TVDI_TrungBinh','TVDI TB'),T('MucLST','Mức LST'),T('MucTVDI','Mức khô hạn')];
const MC=[T('Thang_Nam','Tháng'),T('Nam','Mùa khô năm'),N('LST_TrungBinh','LST TB (°C)',2),N('NDVI_TrungBinh','NDVI TB'),N('TVDI_TrungBinh','TVDI TB'),T('SoAnh','Số ảnh')];

/* open=true: mở cột nội dung ở mục tương ứng; open=false: chỉ cập nhật dữ liệu ngầm (không đổi cột đang xem) */
function setTab(t,open=true){if(open)return showSide(t);tab=t;sortKey=null;render();}
async function render(){
 const w=$('tw');let cols,rows,click=null,hl=null,empty='Chưa có dữ liệu.';
 $('livebar').style.display=tab==='live'?'block':'none';
 try{
  if(tab==='year'){rows=yearRows;cols=YC;empty='Chưa có dữ liệu. Mở Bảng điều khiển › Quét chuỗi thời gian và bấm "Quét & lưu".';hl=r=>String(r.Nam)===$('yr').value;click=r=>{$('yr').value=r.Nam;render();};}
  else if(tab==='grid'){rows=gridRows;empty='Bấm "Hiển thị bản đồ" để xem thống kê từng ô lưới.';
   cols=[T('Name','Ô lưới'),N('mean','Trung bình'),N('min','Min'),N('max','Max'),N('stdDev','Độ lệch chuẩn'),N('count','Số pixel',0),N('gi','Gi* (z)',2),T('nhom','Nhóm điểm nóng/lạnh')];
   click=r=>{const l=gridLayers[r.Code];if(l){if(gridGroup&&!map.hasLayer(gridGroup))map.addLayer(gridGroup);map.fitBounds(l.getBounds());l.openPopup();}};}
  else if(tab==='dist'){rows=distRows();empty='Bấm "Hiển thị bản đồ" để tải thống kê phường/xã.';
   const tx=(k,l)=>({k,l,f:v=>v==null?'–':String(v)});
   cols=[tx('name','Phường/xã'),N('lst','LST TB (°C)',2),N('ndvi','NDVI TB'),N('tvdi','TVDI TB'),N('n','Số pixel (chỉ số đang xem)',0)];
   click=r=>{const l=distLayers[r.key];if(l){map.fitBounds(l.getBounds());l.openPopup();}};}
  else if(tab==='live'){if(!sortKey){sortKey='v';sortDir=-1;}
   rows=liveRows($('liveU').value);empty='Bấm "Hiển thị bản đồ" để có dữ liệu theo thời gian thực.';
   const tx=(k,l)=>({k,l,f:v=>v==null?'–':String(v)}),d=curIdx==='LST'?2:3;
   cols=[tx('name','Đơn vị'),N('v',curIdx+' TB',d),N('lo','Min',d),N('hi','Max',d),tx('mc','Mức độ')];
   click=r=>{if(r.f){map.fitBounds(fb(r.f));}else{const l=gridLayers[r.key];if(l){if(gridGroup&&!map.hasLayer(gridGroup))map.addLayer(gridGroup);map.fitBounds(l.getBounds());l.openPopup();}}};}
  else if(tab==='img'){w.innerHTML='<div class="empty">Đang tải...</div>';rows=await (await fetch('/api/images?year='+$('yr').value)).json();empty='Năm '+$('yr').value+' chưa có ảnh trong CSDL.';
   cols=[T('Ma_Anh','Mã ảnh'),T('Loai_VeTinh','Vệ tinh'),T('Ngay_ThuNhan','Ngày thu nhận'),N('TyLe_May','Mây (%)',1),T('Mua_GiamSat','Mùa')];}
  else{w.innerHTML='<div class="empty">Đang tải...</div>';rows=await (await fetch('/api/history')).json();empty='Chưa có lượt quét nào.';
   cols=[T('Ma_LuotQuet','Lượt'),T('ThoiGian_Quet','Thời gian'),T('Nam_BatDau','Từ năm'),T('Nam_KetThuc','Đến năm'),T('SoLuong_Nam_ThanhCong','Số năm OK'),T('TrangThai','Trạng thái'),N('ThoiGian_XuLy_Giay','Xử lý (giây)',0)];}
 }catch(e){w.innerHTML='<div class="empty err">Không đọc được dữ liệu từ PostgreSQL.</div>';return;}
 rows=[...rows];if(sortKey){rows.sort((a,b)=>{const x=a[sortKey],y=b[sortKey];return typeof x==='number'&&typeof y==='number'?x-y:String(x??'').localeCompare(String(y??''),undefined,{numeric:true});});if(sortDir<0)rows.reverse();}
 cur={cols,rows,click};w.innerHTML=rows.length?tbl(cols,rows,hl):`<div class="empty">${empty}</div>`;
}
$('tw').addEventListener('click',e=>{const th=e.target.closest('th');if(th){const k=th.dataset.k;sortDir=sortKey===k?-sortDir:1;sortKey=k;return render();}
 const tr=e.target.closest('tr[data-i]');if(tr&&cur.click)cur.click(cur.rows[+tr.dataset.i]);});
const dlcsv=()=>csv('bang_'+tab+'.csv',cur.cols,cur.rows);
$('yr').addEventListener('change',()=>{if(tab==='year'||tab==='img')render();});
