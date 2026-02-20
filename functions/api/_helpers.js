const json = (obj, status=200, headers={}) => new Response(JSON.stringify(obj), {
  status,
  headers: { "content-type":"application/json; charset=utf-8", ...headers }
});

function b64u(buf){
  const b = new Uint8Array(buf); let s=""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
function fromB64u(s){
  s = s.replaceAll("-","+").replaceAll("_","/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i);
  return b;
}
async function pbkdf2(password, saltB64u, iterations){
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), {name:"PBKDF2"}, false, ["deriveBits"]);
  const salt = fromB64u(saltB64u);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt, iterations }, key, 256);
  return b64u(bits);
}
function randomB64u(n=16){
  const b = crypto.getRandomValues(new Uint8Array(n));
  return b64u(b);
}
async function hashPassword(password){
  const salt = randomB64u(16);
  const iterations = 100000;
  const hash = await pbkdf2(password, salt, iterations);
  return { algo:"pbkdf2-sha256", iterations, salt, hash };
}
async function verifyPassword(password, rec){
  if (!rec || rec.algo !== "pbkdf2-sha256") return false;
  const hash = await pbkdf2(password, rec.salt, rec.iterations);
  return hash === rec.hash;
}
function cookie(name, value, opts={}){
  const parts=[`${name}=${value}`];
  if (opts.maxAge!=null) parts.push(`Max-Age=${opts.maxAge}`);
  parts.push("Path=/","HttpOnly","SameSite=Lax","Secure");
  return parts.join("; ");
}
function parseCookies(req){
  const h=req.headers.get("cookie")||""; const out={};
  h.split(";").forEach(p=>{ const [k,...r]=p.trim().split("="); if(!k) return; out[k]=r.join("="); });
  return out;
}

const K_USERS="users:index";
const K_USER="user:";
const K_SESS="sess:";
const K_PROG="prog:";

function builtInModules(){
  const introHtml = `
    <p><b>Congratulations on commencing your employment at Bright Waves Swim School!</b></p>
    <p>This Employee Manual details the processes, expectations, and guidelines that we follow in our workplace.</p>
    <p>As you make your way through the manual, you can click on the Bright Waves logo at any time to go back to the menu.</p>
    <p>Should you have any questions, or require further clarification, please speak to your site manager.</p>
    <p>We are excited to have you as part of the team!</p>
    <p style="margin-top:16px"><b>Regards,</b><br>Brett Connors<br><i>Founder – Managing Director</i></p>
  `;
  return [
    { id:"intro", type:"intro", title:"Welcome to Bright Waves", description:"Introduction and acknowledgement to unlock training.", roles:["admin","it","instructor","cs"], pages:[{type:"rich", title:"Introduction", html:introHtml}], quiz:[] },
    { id:"vision", type:"standard", title:"Vision & Mission", description:"Our vision, mission, and purpose.", roles:["admin","it","instructor","cs"], pages:[{type:"rich", title:"Vision", html:"<p>Vision content here.</p>"}], quiz:[{question:"Our Vision is to…", correct:"Create a lifelong love of the water", answers:["Create a lifelong love of the water","Win competitions","Teach adults only","Focus on speed swimming"]}] },
    { id:"attendance", type:"standard", title:"Attendance & Absence", description:"Expectations for attendance and notifying absences.", roles:["admin","it","instructor","cs"], pages:[{type:"rich", title:"Attendance", html:"<p>Attendance content here.</p>"}], quiz:[] },
  ];
}

async function seedIfNeeded(env){
  const idx = await env.BW_LMS.get(K_USERS);
  if (idx) return;
  const users=[];
  async function add(name, username, password, roles){
    const id=randomB64u(10);
    const u={ id, name, username, roles, pwd: await hashPassword(password) };
    await env.BW_LMS.put(K_USER+id, JSON.stringify(u));
    users.push({id, username});
  }
  await add("Admin User","admin","admin123",["admin"]);
  await add("IT Support","it","it123",["it"]);
  await add("Swim Instructor","instructor","teach123",["instructor"]);
  await add("Customer Service","cs","cs123",["cs"]);
  await env.BW_LMS.put(K_USERS, JSON.stringify(users));
}

async function findUserByUsername(env, username){
  const idx=JSON.parse(await env.BW_LMS.get(K_USERS)||"[]");
  const hit=idx.find(x=>x.username===username);
  if(!hit) return null;
  const rec=await env.BW_LMS.get(K_USER+hit.id);
  return rec? JSON.parse(rec):null;
}
async function loadUserById(env, id){
  const rec=await env.BW_LMS.get(K_USER+id);
  return rec? JSON.parse(rec):null;
}
async function createSession(env, userId){
  const sid=randomB64u(24);
  await env.BW_LMS.put(K_SESS+sid, JSON.stringify({userId, at:Date.now()}), {expirationTtl:60*60*24*7});
  return sid;
}
async function getSession(env, req){
  const c=parseCookies(req);
  const sid=c["bw_sess"]; if(!sid) return null;
  const rec=await env.BW_LMS.get(K_SESS+sid); if(!rec) return null;
  return {sid, ...JSON.parse(rec)};
}
async function requireUser(env, req){
  await seedIfNeeded(env);
  const sess=await getSession(env, req);
  if(!sess) return null;
  return await loadUserById(env, sess.userId);
}
async function loadProgress(env, userId){
  const rec=await env.BW_LMS.get(K_PROG+userId);
  return rec? JSON.parse(rec):{};
}
async function saveProgress(env, userId, prog){
  await env.BW_LMS.put(K_PROG+userId, JSON.stringify(prog));
}

async function getAccessibleModules(env, user){
  const all=builtInModules();
  const prog=await loadProgress(env, user.id);
  const introDone=!!prog?.intro?.done;
  const roles=user.roles||[];
  const relevant=all.filter(m=> (m.roles||[]).some(r=>roles.includes(r)));
  return relevant.map(m=> ({...m, locked:(m.id!=="intro" && !introDone)}));
}

export { json, seedIfNeeded, findUserByUsername, verifyPassword, createSession, cookie, parseCookies, requireUser, getAccessibleModules, loadProgress, saveProgress };
