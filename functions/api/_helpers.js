// Cloudflare Pages Functions helpers (KV persistence + auth)
// Bind KV namespace in Pages settings: BW_LMS

export function json(data, status=200, headers={}){
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store",
      ...headers
    }
  });
}
export function getCookie(req, name){
  const raw = req.headers.get("Cookie") || "";
  const parts = raw.split(";").map(x=>x.trim());
  for(const p of parts){
    if(!p) continue;
    const i = p.indexOf("=");
    if(i<0) continue;
    const k=p.slice(0,i);
    const v=p.slice(i+1);
    if(k===name) return decodeURIComponent(v);
  }
  return null;
}
export function setCookieHeaders(name, value, opts={}){
  const {
    httpOnly=true, secure=true, sameSite="Lax", path="/", maxAge=null
  } = opts;
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if(secure) c += "; Secure";
  if(httpOnly) c += "; HttpOnly";
  if(maxAge!==null) c += `; Max-Age=${maxAge}`;
  return c;
}

export function randomId(prefix=""){
  // url-safe
  return prefix + crypto.getRandomValues(new Uint8Array(16)).reduce((s,b)=>s+("0"+b.toString(16)).slice(-2),"");
}

export function normalizeUsername(u){
  return String(u||"").trim().toLowerCase();
}

export function passwordPolicyOk(pw){
  if(typeof pw!=="string") return {ok:false, reason:"Password required."};
  if(pw.length < 10) return {ok:false, reason:"Password must be at least 10 characters."};
  if(!/[A-Z]/.test(pw)) return {ok:false, reason:"Password must include an uppercase letter."};
  if(!/[a-z]/.test(pw)) return {ok:false, reason:"Password must include a lowercase letter."};
  if(!/[0-9]/.test(pw)) return {ok:false, reason:"Password must include a number."};
  if(!/[^A-Za-z0-9]/.test(pw)) return {ok:false, reason:"Password must include a symbol."};
  return {ok:true};
}

// PBKDF2 (<=100000 iterations supported on CF in your logs)
const ITER = 100000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

export async function hashPasswordPBKDF2(password, saltB64=null){
  const enc = new TextEncoder();
  const salt = saltB64 ? b64ToBuf(saltB64) : crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), {name:"PBKDF2"}, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {name:"PBKDF2", hash:"SHA-256", salt, iterations: ITER},
    keyMaterial,
    KEY_BITS
  );
  return {
    alg: "pbkdf2-sha256",
    iterations: ITER,
    salt: bufToB64(salt),
    hash: bufToB64(new Uint8Array(bits))
  };
}
export async function verifyPasswordPBKDF2(password, stored){
  if(!stored || stored.alg!=="pbkdf2-sha256") return false;
  const derived = await hashPasswordPBKDF2(password, stored.salt);
  return timingSafeEq(derived.hash, stored.hash);
}
function timingSafeEq(a,b){
  if(typeof a!=="string" || typeof b!=="string" || a.length!==b.length) return false;
  let out = 0;
  for(let i=0;i<a.length;i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out===0;
}
function bufToB64(buf){
  let bin = "";
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  for(const b of u8) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64ToBuf(b64){
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
  return u8;
}

export async function seedIfNeeded(env){
  const kv = env.BW_LMS;
  if(!kv) throw new Error("Missing KV binding BW_LMS");
  const idxRaw = await kv.get("users:index");
  if(idxRaw) return;
  // seed users only (modules are NOT seeded)
  const now = Date.now();
  const users = [];
  async function mkUser({name, username, password, roles}){
    const id = randomId("u_");
    const pw = await hashPasswordPBKDF2(password);
    const user = {id, name, username: normalizeUsername(username), roles, pw, mustReset:true, createdAt:now};
    users.push(user);
    await kv.put(`users:${id}`, JSON.stringify(user));
    return user;
  }
  await mkUser({name:"IT Support", username:"it", password:"it123", roles:["it"]});
  await mkUser({name:"Admin User", username:"admin", password:"admin123", roles:["admin"]});
  await mkUser({name:"Swim Instructor", username:"instructor", password:"teach123", roles:["instructor"]});
  await mkUser({name:"Customer Service", username:"cs", password:"cs123", roles:["customer_service"]});
  await kv.put("users:index", JSON.stringify(users.map(u=>({id:u.id, username:u.username}))));
  await kv.put("modules:index", JSON.stringify([]));
}

export async function loadUserByUsername(env, username){
  const kv = env.BW_LMS;
  const idx = JSON.parse((await kv.get("users:index")) || "[]");
  const norm = normalizeUsername(username);
  const hit = idx.find(x=>x.username===norm);
  if(!hit) return null;
  const raw = await kv.get(`users:${hit.id}`);
  return raw ? JSON.parse(raw) : null;
}
export async function loadUserById(env, id){
  const raw = await env.BW_LMS.get(`users:${id}`);
  return raw ? JSON.parse(raw) : null;
}
export async function saveUser(env, user){
  await env.BW_LMS.put(`users:${user.id}`, JSON.stringify(user));
  // keep index updated if username changed
  const idx = JSON.parse((await env.BW_LMS.get("users:index")) || "[]");
  const i = idx.findIndex(x=>x.id===user.id);
  const entry = {id:user.id, username:user.username};
  if(i>=0) idx[i]=entry; else idx.push(entry);
  await env.BW_LMS.put("users:index", JSON.stringify(idx));
}
export async function listUsers(env){
  const idx = JSON.parse((await env.BW_LMS.get("users:index")) || "[]");
  const out = [];
  for(const it of idx){
    const u = await loadUserById(env, it.id);
    if(u) out.push({id:u.id, name:u.name, username:u.username, roles:u.roles || []});
  }
  return out;
}

// Sessions
export async function createSession(env, userId){
  const token = randomId("s_");
  const sess = {token, userId, createdAt: Date.now(), rotatedAt: Date.now()};
  await env.BW_LMS.put(`sessions:${token}`, JSON.stringify(sess), {expirationTtl: 60*60*24*7}); // 7 days
  return sess;
}
export async function getSession(env, token){
  if(!token) return null;
  const raw = await env.BW_LMS.get(`sessions:${token}`);
  return raw ? JSON.parse(raw) : null;
}
export async function deleteSession(env, token){
  if(!token) return;
  await env.BW_LMS.delete(`sessions:${token}`);
}
export async function rotateSession(env, token){
  const sess = await getSession(env, token);
  if(!sess) return null;
  // rotate if older than 30 minutes
  const now = Date.now();
  if(now - (sess.rotatedAt||0) < 30*60*1000) return {sess, newToken:null};
  await deleteSession(env, token);
  const ns = await createSession(env, sess.userId);
  return {sess:ns, newToken:ns.token};
}

export async function requireUser(env, req){
  await seedIfNeeded(env);
  const token = getCookie(req, "bw_session");
  const sess = await getSession(env, token);
  if(!sess) return {user:null, rotated:null};
  const u = await loadUserById(env, sess.userId);
  if(!u) return {user:null, rotated:null};
  const rot = await rotateSession(env, token);
  return {user:u, rotated: rot && rot.newToken ? rot.newToken : null};
}

export function requireRole(user, role){
  return user && Array.isArray(user.roles) && user.roles.includes(role);
}

// Modules
export async function listAllModules(env){
  const idx = JSON.parse((await env.BW_LMS.get("modules:index")) || "[]");
  const out = [];
  for(const mId of idx){
    const raw = await env.BW_LMS.get(`modules:${mId}`);
    if(raw) out.push(JSON.parse(raw));
  }
  return out;
}
export async function loadModule(env, id){
  const raw = await env.BW_LMS.get(`modules:${id}`);
  return raw ? JSON.parse(raw) : null;
}
export async function saveModule(env, mod){
  if(!mod.id) mod.id = randomId("m_");
  await env.BW_LMS.put(`modules:${mod.id}`, JSON.stringify(mod));
  const idx = JSON.parse((await env.BW_LMS.get("modules:index")) || "[]");
  if(!idx.includes(mod.id)) idx.push(mod.id);
  await env.BW_LMS.put("modules:index", JSON.stringify(idx));
  return mod.id;
}
export async function deleteModule(env, id){
  await env.BW_LMS.delete(`modules:${id}`);
  const idx = JSON.parse((await env.BW_LMS.get("modules:index")) || "[]");
  const nidx = idx.filter(x=>x!==id);
  await env.BW_LMS.put("modules:index", JSON.stringify(nidx));
}

// Progress
export async function getProgress(env, userId){
  const raw = await env.BW_LMS.get(`progress:${userId}`);
  return raw ? JSON.parse(raw) : {};
}
export async function saveProgress(env, userId, prog){
  await env.BW_LMS.put(`progress:${userId}`, JSON.stringify(prog));
}
export function computePercent(modules, prog){
  if(!modules.length) return 0;
  let complete=0;
  for(const m of modules){
    const p = prog[m.id];
    if(p && p.completed) complete++;
  }
  return Math.round((complete/modules.length)*100);
}

export function canAccessModule(user, module){
  if(!user || !module) return false;
  const roles = user.roles || [];
  const allowed = module.roles || [];
  return allowed.some(r=>roles.includes(r));
}
