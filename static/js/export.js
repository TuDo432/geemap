/* ===== XUẤT FILE ===== */
async function exCarto(fmt){const m=$('exmsg');m.className='msg';m.textContent='Đang dựng bản đồ bố cục (lần đầu có thể mất 1–3 phút)...';
 try{const q=new URLSearchParams({index:$('ei').value,year:$('ey').value,cloud:$('c').value,classify:$('ecls').checked,region:$('ereg').value,fmt});
  const r=await fetch('/api/cartomap?'+q);
  if(!r.ok){let d={};try{d=await r.json()}catch{}throw new Error(d.detail||('Lỗi '+r.status));}
  const a=document.createElement('a');a.href=URL.createObjectURL(await r.blob());
  a.download=`ban_do_${$('ei').value}_${$('ey').value}.${fmt}`;a.click();
  m.className='msg ok';m.textContent='Đã tạo bản đồ.';}
 catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}}

async function exTif(){const m=$('exmsg');m.className='msg';m.textContent='Đang tạo GeoTIFF trên GEE...';
 try{const r=await fetch(`/api/geotiff?index=${$('ei').value}&year=${$('ey').value}&cloud=${$('c').value}`),d=await r.json();if(!r.ok)throw new Error(d.detail||('Lỗi '+r.status));m.className='msg ok';m.textContent='Sẵn sàng, đang tải xuống.';location.href=d.url;}
 catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}}
function exVec(){if(!lastOutline)return alert('Hãy bấm "Hiển thị bản đồ" ở mục Bản đồ trước.');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(lastOutline)],{type:'application/geo+json'}));a.download='ranh_gioi_TPHCM.geojson';a.click();}
async function exCsv(t){if(t==='year')return csv('thong_ke_theo_nam.csv',YC,yearRows);if(t==='month')return csv('thong_ke_theo_thang.csv',MC,monthRows);
 const rows=await (await fetch('/api/images?year='+$('ey').value)).json();csv('metadata_landsat_'+$('ey').value+'.csv',[{k:'Ma_Anh',l:'Ma_Anh'},{k:'Loai_VeTinh',l:'Loai_VeTinh'},{k:'Ngay_ThuNhan',l:'Ngay_ThuNhan'},{k:'TyLe_May',l:'TyLe_May'},{k:'Mua_GiamSat',l:'Mua_GiamSat'}],rows);}
