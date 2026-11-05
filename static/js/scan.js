/* ===== QUÉT CHUỖI THỜI GIAN ===== */
async function scan(){const m=$('smsg');$('scan').disabled=true;m.className='msg';
 try{const r=await fetch(`/api/scan?start=${$('y1').value}&end=${$('y2').value}&cloud=${$('c').value}&mode=${$('mode').value}`,{method:'POST'}),d=await r.json();if(!r.ok)throw new Error(d.detail||('Lỗi '+r.status));poll();}
 catch(e){m.className='msg err';m.textContent='Lỗi: '+e.message;$('scan').disabled=false;}}
async function poll(){const s=await (await fetch('/api/scan/status')).json(),m=$('smsg');
 m.textContent=s.msg+(s.errors.length?' · Lỗi: '+s.errors.join(' | '):'');m.className='msg '+(s.errors.length?'err':'ok');
 if(s.running)return setTimeout(poll,4000);$('scan').disabled=false;loadAll();
 m.insertAdjacentHTML('beforeend',' · <a href="#" onclick="go(\'tools\');setTool(\'ana\');return false">Xem phân tích &amp; đánh giá →</a>');}
