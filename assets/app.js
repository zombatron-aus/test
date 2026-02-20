const API = (p)=> (p.startsWith("/")?p:"/"+p);
const qs = (s)=>document.querySelector(s);
const qsa = (s)=>Array.from(document.querySelectorAll(s));
function escapeHtml(s){return (s??"").toString().replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
function toast(msg, err=false){
  const el=document.createElement("div");
  el.style.position="fixed"; el.style.right="18px"; el.style.bottom="18px"; el.style.zIndex="9999";
  el.style.padding="12px 14px"; el.style.borderRadius="14px"; el.style.border="1px solid #e2e8f0";
  el.style.background="#fff"; el.style.boxShadow="0 18px 50px rgba(2,12,27,.2)";
  el.style.fontWeight="800"; el.style.fontSize="13px"; el.style.color=err?"#b91c1c":"#0f172a";
  el.textContent=msg; document.body.appendChild(el); setTimeout(()=>el.remove(),2600);
}
async function apiFetch(path, opts={}){
  const res = await fetch(API(path), {credentials:"include", headers:{"content-type":"application/json", ...(opts.headers||{})}, ...opts});
  const ct = res.headers.get("content-type")||"";
  let body=null;
  if (ct.includes("application/json")) body = await res.json().catch(()=>null);
  else body = await res.text().catch(()=> "");
  if (!res.ok) throw new Error(body?.error || body?.message || "Request failed");
  return body;
}
async function ensureAuthed(){ try{return await apiFetch("/api/me");}catch(e){return null;} }
function setTopbar(user){
  const who=qs("#who"); if (who) who.textContent = user ? `${user.name} • ${user.roles.map(r=>r.toUpperCase()).join(", ")}` : "";
  const logout=qs("#logoutBtn");
  if (logout) logout.onclick = async ()=>{ try{await apiFetch("/api/logout",{method:"POST",body:"{}"});}catch(e){} location.href="/"; };
}
function getParam(n){ return new URL(location.href).searchParams.get(n); }

async function loginInit(){
  const form=qs("#loginForm"); if(!form) return;
  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    try{
      await apiFetch("/api/login",{method:"POST", body: JSON.stringify({username:qs("#username").value.trim(), password:qs("#password").value})});
      location.href="/dashboard.html";
    }catch(err){ toast(err.message,true); }
  });
}

async function dashboardInit(){
  const root=qs("#dashboardRoot"); if(!root) return;
  const me = await ensureAuthed(); if(!me){ location.href="/"; return; }
  setTopbar(me);
  const out = await apiFetch("/api/modules");
  const modules = out.modules||[];
  const progress = out.progress||{};
  const total=modules.length;
  const done=modules.filter(m=>progress?.[m.id]?.done).length;
  const pct = total? Math.round(done/total*100):0;
  qs("#progressBar").style.width=pct+"%";
  qs("#progressPct").textContent=pct+"% complete";
  qs("#progressKpi").textContent=`${done} / ${total} modules`;

  const list=qs("#moduleList"); list.innerHTML="";
  modules.forEach(m=>{
    const locked=!!m.locked;
    const isDone=!!progress?.[m.id]?.done;
    const div=document.createElement("div");
    div.className="item";
    div.innerHTML=`
      <div class="meta">
        <div class="title">${escapeHtml(m.title)}</div>
        <div class="sub">${escapeHtml(m.description||"")}</div>
      </div>
      <span class="badge">${locked?"LOCKED":(isDone?"DONE":"PENDING")}</span>
      <div class="actions"><button class="btn ${locked?"secondary":""}" ${locked?"disabled":""} type="button">${locked?"Locked":"Open"}</button></div>
    `;
    div.querySelector("button").onclick=()=>{ if(!locked) location.href=`/module.html?id=${encodeURIComponent(m.id)}`; };
    list.appendChild(div);
  });
}

async function moduleInit(){
  const wrap=qs("#moduleWrap"); if(!wrap) return;
  const me=await ensureAuthed(); if(!me){ location.href="/"; return; }
  setTopbar(me);
  const id=getParam("id"); if(!id){ location.href="/dashboard.html"; return; }
  let out;
  try{ out=await apiFetch(`/api/module?id=${encodeURIComponent(id)}`); }
  catch(e){ toast(e.message,true); location.href="/dashboard.html"; return; }
  const m=out.module;
  qs("#modTitle").textContent=m.title;
  qs("#modDesc").textContent=m.description||"";
  const card=qs("#moduleCard");
  if (m.style?.font) card.style.fontFamily=m.style.font;
  if (m.style?.baseSize) card.style.fontSize=m.style.baseSize+"px";
  if (m.style?.textColor) card.style.color=m.style.textColor;

  const pages = (Array.isArray(m.pages)&&m.pages.length)? m.pages : [{type:"rich", title:m.title, html:(m.content||"")}];
  let idx=0;
  const pageTitle=qs("#pageTitle");
  const pageBody=qs("#pageBody");
  const btnPrev=qs("#btnPrev");
  const btnNext=qs("#btnNext");
  const btnDone=qs("#btnDone");
  const btnQuiz=qs("#btnQuiz");

  function render(){
    const p=pages[idx];
    pageTitle.textContent=p.title||"";
    if (p.type==="image"){
      pageBody.innerHTML=`<img alt="" style="max-width:100%;border-radius:16px;border:1px solid #e2e8f0" src="${escapeHtml(p.url||p.src||"")}">`;
    } else if (p.type==="video"){
      const url=p.url||p.src||"";
      pageBody.innerHTML=`<video controls style="width:100%;border-radius:16px;border:1px solid #e2e8f0"><source src="${escapeHtml(url)}"></video>`;
    } else {
      pageBody.innerHTML=p.html || "<p></p>";
    }
    btnPrev.disabled = idx===0;
    btnNext.style.display = idx<pages.length-1 ? "inline-block":"none";
    const last = idx===pages.length-1;
    btnDone.style.display = (last && m.type==="intro") ? "inline-block":"none";
    btnQuiz.style.display = (last && Array.isArray(m.quiz) && m.quiz.length) ? "inline-block":"none";
  }
  btnPrev.onclick=()=>{ if(idx>0){idx--;render();}};
  btnNext.onclick=()=>{ if(idx<pages.length-1){idx++;render();}};
  btnDone.onclick=async ()=>{
    try{ await apiFetch("/api/progress",{method:"POST", body: JSON.stringify({moduleId:m.id, done:true})}); toast("Acknowledged!"); location.href="/dashboard.html"; }
    catch(e){ toast(e.message,true); }
  };
  btnQuiz.onclick=()=> location.href=`/quiz.html?id=${encodeURIComponent(m.id)}`;
  render();
}

async function quizInit(){
  const root=qs("#quizRoot"); if(!root) return;
  const me=await ensureAuthed(); if(!me){ location.href="/"; return; }
  setTopbar(me);
  const id=getParam("id"); if(!id){ location.href="/dashboard.html"; return; }
  const out=await apiFetch(`/api/module?id=${encodeURIComponent(id)}`);
  const m=out.module;
  if (!Array.isArray(m.quiz) || !m.quiz.length){ toast("No quiz for this module",true); location.href=`/module.html?id=${encodeURIComponent(id)}`; return; }
  qs("#quizTitle").textContent=m.title+" — Quiz";
  const form=qs("#quizForm"); form.innerHTML="";
  m.quiz.forEach((q, i)=>{
    const card=document.createElement("div");
    card.className="card"; card.style.boxShadow="none"; card.style.borderRadius="16px";
    const answers = (q.answers||[]).slice();
    answers.sort(()=>Math.random()-0.5);
    card.innerHTML=`<h2 style="margin:0 0 10px 0;font-size:16px">${i+1}. ${escapeHtml(q.question)}</h2>`;
    answers.forEach((a,ai)=>{
      const idn=`q${i}_${ai}`;
      const row=document.createElement("div");
      row.style.display="flex"; row.style.gap="10px"; row.style.alignItems="center"; row.style.margin="8px 0";
      row.innerHTML=`<input type="radio" name="q${i}" id="${idn}" value="${escapeHtml(a)}"><label for="${idn}">${escapeHtml(a)}</label>`;
      card.appendChild(row);
    });
    form.appendChild(card);
  });
  qs("#backToModule").onclick=()=>location.href=`/module.html?id=${encodeURIComponent(id)}`;
  qs("#submitQuiz").onclick=async ()=>{
    for (let i=0;i<m.quiz.length;i++){
      if(!form.querySelector(`input[name="q${i}"]:checked`)){ toast("Answer all questions",true); return; }
    }
    let correct=0;
    m.quiz.forEach((q,i)=>{ const v=form.querySelector(`input[name="q${i}"]:checked`).value; if(v===q.correct) correct++; });
    if (correct !== m.quiz.length){ toast(`You scored ${correct}/${m.quiz.length}. 100% required.`, true); return; }
    await apiFetch("/api/progress",{method:"POST", body: JSON.stringify({moduleId:m.id, done:true, quizPassed:true})});
    toast("Quiz passed!");
    location.href="/dashboard.html";
  };
}

document.addEventListener("DOMContentLoaded", ()=>{
  loginInit(); dashboardInit(); moduleInit(); quizInit();
});
