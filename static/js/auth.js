/* ===== ĐĂNG NHẬP & PHÂN QUYỀN (nạp ngay SAU core.js, TRƯỚC nav.js) =====
   Lớp này chỉ để giao diện gọn: backend (app/auth.py) mới là chốt chặn thật. */
let ROLE='user';
const isAdmin=()=>ROLE==='admin';
function needAdmin(){if(isAdmin())return false;alert('Chức năng này chỉ dành cho Admin. Hãy đăng nhập để sử dụng.');return true;}

/* Lưu danh sách lựa chọn gốc một lần, để Admin đăng nhập lại vẫn thấy đủ */
const OPT0={};
function gateOptions(){
 const rules={dtab:['dist','img','hist'],liveU:['dist'],u3:['ward']};   // các lựa chọn cần dữ liệu phường/xã hoặc dữ liệu quản trị
 for(const id in rules){const el=$(id);if(!el)continue;
  if(!OPT0[id])OPT0[id]=el.innerHTML;
  const old=el.value;el.innerHTML=OPT0[id];
  if(!isAdmin())[...el.options].forEach(o=>{if(rules[id].includes(o.value))o.remove();});
  if([...el.options].some(o=>o.value===old))el.value=old;}
}

async function refreshAuth(){
 try{const d=await J('/api/auth/me');ROLE=d.role;}catch(e){ROLE='user';}
 applyRole();
}
function applyRole(){
 gateOptions();
 document.body.classList.toggle('is-admin',isAdmin());
 const b=$('roleBadge'),a=$('roleBtn');
 if(b){b.textContent=isAdmin()?'Admin':'Khách';b.style.background=isAdmin()?'#2e7d32':'#607d8b';}
 if(a)a.textContent=isAdmin()?'Đăng xuất':'Đăng nhập Admin';
}

/* ---------- modal đăng nhập ---------- */
function openLogin(){
 if(isAdmin()){enter();return;}                       // đã có phiên Admin -> vào thẳng
 $('lgMsg').textContent='';$('lgPass').value='';
 $('loginModal').classList.add('on');$('lgUser').focus();
}
function closeLogin(){$('loginModal').classList.remove('on');}
async function doLogin(ev){
 if(ev)ev.preventDefault();
 const u=$('lgUser').value.trim(),p=$('lgPass').value,m=$('lgMsg');
 if(!u&&!p)return asGuest();                          // bỏ trống = Khách
 const btn=$('lgGo');btn.disabled=true;m.className='msg';m.textContent='Đang kiểm tra...';
 try{
  await J('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
  await refreshAuth();closeLogin();enter();
 }catch(e){m.className='msg err';m.textContent=e.message;}
 finally{btn.disabled=false;}
}
async function asGuest(){
 try{await fetch('/api/auth/logout',{method:'POST'});}catch(e){}
 await refreshAuth();closeLogin();enter();
}
async function roleAction(){
 if(isAdmin()){try{await fetch('/api/auth/logout',{method:'POST'});}catch(e){}await refreshAuth();leave();}
 else{leave();openLogin();}
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLogin();});
window.addEventListener('load',refreshAuth);
