const API = {
  async get(path){
    const res = await fetch(path, {credentials:'include'});
    if(!res.ok) throw await safeErr(res);
    return res.json();
  },
  async post(path, body){
    const res = await fetch(path, {method:'POST', headers:{'content-type':'application/json'}, credentials:'include', body: JSON.stringify(body||{})});
    if(!res.ok) throw await safeErr(res);
    return res.json();
  },
  async put(path, body){
    const res = await fetch(path, {method:'PUT', headers:{'content-type':'application/json'}, credentials:'include', body: JSON.stringify(body||{})});
    if(!res.ok) throw await safeErr(res);
    return res.json();
  },
  async del(path){
    const res = await fetch(path, {method:'DELETE', credentials:'include'});
    if(!res.ok) throw await safeErr(res);
    return res.json();
  }
};
async function safeErr(res){
  let txt = '';
  try{ txt = await res.text(); }catch(e){}
  let msg = txt;
  try{ const j = JSON.parse(txt); msg = j.error || j.message || txt; }catch(e){}
  return new Error(`${res.status} ${res.statusText}: ${msg}`);
}
function qs(name){
  return new URLSearchParams(location.search).get(name);
}
function setText(id, t){ const el=document.getElementById(id); if(el) el.textContent=t; }
function show(id){ const el=document.getElementById(id); if(el) el.style.display=''; }
function hide(id){ const el=document.getElementById(id); if(el) el.style.display='none'; }
function escapeHtml(s){
  return String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function roleLabel(r){
  const map={admin:'Admin', it:'IT', instructor:'Instructor', customer_service:'Customer Service'};
  return map[r]||r;
}
function logout(){
  return API.post('/api/logout',{}).then(()=>location.href='/');
}
async function requireAuth(){
  try{
    const me = await API.get('/api/me');
    return me;
  }catch(e){
    location.href='/?next='+encodeURIComponent(location.pathname+location.search);
    throw e;
  }
}
