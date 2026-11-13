/* ===== TỰ ĐỘNG HÓA: trạng thái, thông số hiện tại, nhật ký & phân tích tự động ===== */
let auTimer=null,auInit=false,auWas=false,auLastId,auSnapLast=null,auImgKey='',auM='year',auCh=null;
const MUCC={'Ổn định':'#2e7d32','Lưu ý':'#f9a825','Cảnh báo':'#c62828'};
const EV={KIEM_TRA:'Không có ảnh mới',ANH_MOI:'Có ảnh mới (ngoài mùa khô)',QUET_NAM:'Đã quét lại năm',LOI:'Lỗi'};
const dsg=(k,l,n)=>({k,l,f:v=>v==null?'–':(v>0?'+':'')+Number(v).toFixed(n)});
const AUC=[T('ThoiGian','Thời gian'),T('Nguon','Nguồn'),{k:'Su_Kien',l:'Sự kiện',f:v=>EV[v]||v||'–'},T('Nam','Năm'),N('So_Anh_MuaKho','Ảnh mùa khô',0),dsg('So_Anh_Moi','Ảnh mới',0),
 T('Ngay_Anh_MoiNhat','Ảnh mới nhất'),dsg('D_LST','Δ LST (°C)',2),dsg('D_NDVI','Δ NDVI',3),dsg('D_TVDI','Δ TVDI',3),
 {k:'Muc_Do',l:'Mức',f:v=>v?`<span class="badge" style="background:${MUCC[v]||'#607d8b'}">${v}</span>`:'–'},
 {k:'GhiChu',l:'Nhận xét / đánh giá',f:v=>esc(v)||'–'},T('Ma_LuotQuet','Lượt quét')];
const SNC=[T('ThoiGian','Chụp lúc'),T('Ngay_BatDau','Từ ngày'),T('Ngay_KetThuc','Đến ngày'),N('So_Anh','Số ảnh',0),N('LST_TB','LST TB (°C)',2),dsg('dL','Δ LST',2),N('LST_Min','LST min',2),N('LST_Max','LST max',2),
 N('NDVI_TB','NDVI TB'),dsg('dN','Δ NDVI',3),N('TVDI_TB','TVDI TB'),dsg('dT','Δ TVDI',3),T('Muc_LST','Mức LST'),T('Muc_TVDI','Mức khô hạn')];
async function loadAuto(){
 const m=$('auMsg');
 try{
  const [s,lg,sn]=await Promise.all([J('/api/auto/status'),J('/api/auto/log'),J('/api/auto/snapshots')]);
  const c=s.cfg,a=s.auto,j=s.job,busy=a.checking||j.running,on=c.BAT==='1',fdt=v=>v?String(v).replace('T',' ').slice(0,16):'–';
  if(!auInit){$('auOn').checked=on;$('auH').value=c.CHU_KY_GIO;$('auC').value=c.MAY_MAX;$('auW').value=c.CUA_SO_NGAY;auInit=true;}
  $('autoState').innerHTML=`<span class="badge" style="background:${on?'#2e7d32':'#607d8b'}">${on?'ĐANG BẬT':'ĐANG TẮT'}</span> `+
   (busy?`<b>Đang chạy:</b> ${esc(j.running?j.msg:a.last_msg)}`:`Kiểm tra gần nhất: <b>${fdt(a.last_check)}</b>${on?` · Lần tới: <b>${fdt(a.next_check)}</b>`:''}`)+
   `<br>Chu kỳ ${c.CHU_KY_GIO} giờ · mây ≤ ${c.MAY_MAX}% · năm theo dõi ${s.year} (mùa khô ${s.season})`+
   (!busy&&a.last_msg?`<br>Kết quả gần nhất: ${esc(a.last_msg)}`:'')+(a.last_error?`<br><span class="err">Lỗi: ${esc(a.last_error)}</span>`:'');
  const x=sn[0];auSnapLast=x||null;
  $('auNow').innerHTML=x?`<div class="cards"><div><b>LST – nhiệt độ bề mặt</b><br><span class="kpi">${fm(x.LST_TB,2)} °C</span><br><span class="card-desc">Min ${fm(x.LST_Min,1)} · Max ${fm(x.LST_Max,1)} · ${esc(x.Muc_LST)||'–'}</span></div>
   <div><b>NDVI – thực vật</b><br><span class="kpi">${fm(x.NDVI_TB)}</span></div>
   <div><b>TVDI – khô hạn</b><br><span class="kpi">${fm(x.TVDI_TB)}</span><br><span class="card-desc">${esc(x.Muc_TVDI)||'–'}</span></div></div>
   <div class="hint mt-8">Ghép ${x.So_Anh} ảnh từ ${x.Ngay_BatDau} đến ${x.Ngay_KetThuc} · chụp lúc ${fdt(x.ThoiGian)}</div>`
   :'<div class="empty">Chưa có chụp nhanh. Bật tự động hoặc bấm "Kiểm tra ngay".</div>';
  sortKey=null;
  $('auLog').innerHTML=lg.length?tbl(AUC,lg).replace('<table>','<table class="v">'):'<div class="empty">Chưa có nhật ký.</div>';
  const snd=sn.map((r,i)=>{const p=sn[i+1],d=k=>p&&r[k]!=null&&p[k]!=null?r[k]-p[k]:null;return {...r,dL:d('LST_TB'),dN:d('NDVI_TB'),dT:d('TVDI_TB')};});
  $('auSnap').innerHTML=sn.length?tbl(SNC,snd):'<div class="empty">Chưa có chụp nhanh nào.</div>';
  const key=x?`${x.Ma_ChupNhanh}|${c.CUA_SO_NGAY}`:'';             // chỉ nạp lại ảnh khi có chụp nhanh mới
  if(key!==auImgKey){auImgKey=key;
   $('auImgs').innerHTML=x?IDX.map(k=>{const v=VISJS[k],u=`/api/auto/image?index=${k}&days=${c.CUA_SO_NGAY}&cloud=60&v=${x.Ma_ChupNhanh}`;
    return `<div><b>${NM[k]}</b><br><a href="${u}" download="${k}_hien_tai.png"><img loading="lazy" src="${u}" alt="Đang tạo ảnh ${k}..." style="width:100%;background:#eee;border:1px solid #ccd"></a>`+
     `<span style="display:block;height:10px;margin-top:6px;background:linear-gradient(to right,${v.palette.join(',')})"></span>`+
     `<span style="display:flex;justify-content:space-between;font-size:12px"><span>${v.min}</span><span>${v.max}</span></span></div>`;}).join(''):'<div class="empty">Chưa có chụp nhanh để vẽ ảnh.</div>';}
  auSeries();drawAna(AU_ANA);
  const id=lg[0]?lg[0].Ma_NhatKy_TD:null;
  if((auLastId!==undefined&&id!==auLastId)||(auWas&&!busy))loadAll();   // có lượt tự quét mới: làm mới các tab khác
  auLastId=id;auWas=busy;
  if(m.classList.contains('err')){m.className='msg';m.textContent='';}
 }catch(e){m.className='msg err';m.textContent='Không đọc được dữ liệu tự động hóa: '+e.message+' (đã chạy WebGIS_tudong.sql chưa?)';}}
async function auVec(kind){const m=$('auMsg');m.className='msg';m.textContent='Đang tạo vector...';
 try{const d=await J(`/api/auto/vector?kind=${kind}&days=${$('auW').value}&cloud=60`);
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(d)],{type:'application/geo+json'}));
  a.download=kind==='grid'?'o_luoi_hien_tai.geojson':'ranh_gioi_TPHCM.geojson';a.click();m.className='msg ok';m.textContent='Đã tải vector.';}
 catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}}

function auMode(m){auM=m;for(const [id,k] of [['aY','year'],['aM','month'],['aC','combo']])$(id).classList.toggle('on',m===k);auSeries();}
function auSeries(){   // cùng quy tắc mục Chuỗi thời gian (năm / tháng / kết hợp) + điểm "Hiện tại" từ chụp nhanh tự động
 const s=auSnapLast,isY=auM!=='month',R0=isY?yearRows:monthRows;auCh&&auCh.destroy();auCh=null;
 if(!R0.length&&!s){$('auSer').innerHTML='<div class="empty">Chưa có dữ liệu chuỗi thời gian (quét ở mục Bản đồ hoặc bật tự động).</div>';return;}
 const R=R0.map(r=>({lb:isY?String(r.Nam):r.Thang_Nam,lst:+r.LST_TrungBinh,ndvi:+r.NDVI_TrungBinh,tvdi:+r.TVDI_TrungBinh}));
 if(s)R.push({lb:'Hiện tại ('+String(s.Ngay_KetThuc).slice(0,10)+')',lst:+s.LST_TB,ndvi:+s.NDVI_TB,tvdi:s.TVDI_TB==null?null:+s.TVDI_TB});
 const ds=[['LST (°C)','lst','#d32f2f','y'],['NDVI','ndvi','#2e7d32','y1'],['TVDI','tvdi','#f9a825','y1']].map(([l,k,c,ax])=>({label:l,data:R.map(r=>r[k]),borderColor:c,yAxisID:ax,tension:.2,
  pointRadius:R.map((_,i)=>s&&i===R.length-1?7:3)}));
 if(auM==='combo'){ds[1].type='bar';ds[1].backgroundColor='#81c784aa';}
  const ax=(t)=>({title:{display:true,text:t,font:{size:14.5,weight:'700'},color:'#0b2a4a'},ticks:{font:{size:14},color:'#33475c'},grid:{color:'#e6ecf3'}});
  auCh=new Chart($('auChart'),{type:'line',data:{labels:R.map(r=>r.lb),datasets:ds},options:{responsive:true,maintainAspectRatio:false,
   interaction:{mode:'index',intersect:false},
   plugins:{legend:{position:'top',align:'start',labels:{usePointStyle:true,boxWidth:9,padding:18,font:{size:14.5,weight:'600'},color:'#22303d'}},
    tooltip:{backgroundColor:'#0b2a4a',padding:12,cornerRadius:10,usePointStyle:true,titleFont:{size:15,weight:'700'},bodyFont:{size:14}}},
   scales:{x:{grid:{display:false},ticks:{font:{size:14},color:'#33475c',maxRotation:0,autoSkip:true}},
    y:{position:'left',...ax('LST (°C)')},
    y1:{position:'right',min:0,max:1,grid:{drawOnChartArea:false},...ax('NDVI · TVDI')}}}});
 const dd=(i,k)=>i&&R[i][k]!=null&&R[i-1][k]!=null?R[i][k]-R[i-1][k]:null;
 const rows=R.map((r,i)=>({...r,dL:dd(i,'lst'),dN:dd(i,'ndvi'),dT:dd(i,'tvdi')}));
 sortKey=null;
 $('auSer').innerHTML=tbl([T('lb',isY?'Năm / hiện tại':'Tháng / hiện tại'),N('lst','LST TB (°C)',2),dsg('dL','Δ LST',2),N('ndvi','NDVI TB'),dsg('dN','Δ NDVI',3),N('tvdi','TVDI TB'),dsg('dT','Δ TVDI',3)],rows);}

async function auSave(){const m=$('auMsg');
 try{const q=new URLSearchParams({bat:$('auOn').checked,hours:$('auH').value,cloud:$('auC').value,window:$('auW').value}),
   r=await fetch('/api/auto/config?'+q,{method:'POST'}),d=await r.json();if(!r.ok)throw new Error(typeof d.detail==='string'?d.detail:'Giá trị không hợp lệ');
  m.className='msg ok';m.textContent='Đã lưu cấu hình.';loadAuto();}
 catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}}
async function auRun(force){const m=$('auMsg');m.className='msg';
 try{const r=await fetch('/api/auto/run?force='+force,{method:'POST'}),d=await r.json();if(!r.ok)throw new Error(d.detail||('Lỗi '+r.status));
  m.textContent='Đã bắt đầu, trang tự cập nhật...';setTimeout(loadAuto,2000);}
 catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;}}
