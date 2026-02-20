import { DEFAULT_USERS, MODULES } from "./_data.js";

export function corsHeaders(request){
  const origin = request?.headers?.get("origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "vary": "Origin",
  };
}

export function noContent(status = 204, request = null){
  return new Response(null, { status, headers: { ...(request ? corsHeaders(request) : {}) } });
}


export function json(data, status = 200, extraHeaders = {}, request = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

export function getToken(request) {
  const h = request.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function b64ToBuf(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}
function bufToB64(buf) {
  const arr = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export async function hashPasswordPBKDF2(password, saltB64 = null, iterations = 100000) {
  iterations = Math.min(iterations || 100000, 100000);
  const salt = saltB64 ? b64ToBuf(saltB64) : crypto.getRandomValues(new Uint8Array(16)).buffer;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256
  );
  return {
    algo: "pbkdf2-sha256",
    iter: iterations,
    salt: saltB64 || bufToB64(salt),
    dk: bufToB64(bits),
  };
}


export function validatePasswordPolicy(password){
  const rules = {
    minLength: 10,
    upper: /[A-Z]/,
    lower: /[a-z]/,
    number: /[0-9]/,
    symbol: /[^A-Za-z0-9]/,
  };
  if (!password || password.length < rules.minLength)
    return "Password must be at least 10 characters long.";
  if (!rules.upper.test(password))
    return "Password must contain at least one uppercase letter.";
  if (!rules.lower.test(password))
    return "Password must contain at least one lowercase letter.";
  if (!rules.number.test(password))
    return "Password must contain at least one number.";
  if (!rules.symbol.test(password))
    return "Password must contain at least one symbol.";
  return null;
}

export async function verifyPassword(password, pwdRecord) {

  if (!pwdRecord || pwdRecord.algo !== "pbkdf2-sha256") return false;
  const rec = await hashPasswordPBKDF2(password, pwdRecord.salt, pwdRecord.iter);
  // Constant-time-ish compare on base64
  const a = rec.dk;
  const b = pwdRecord.dk;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function seedIfNeeded(env) {
  const index = await env.BW_LMS.get("users:index");
  if (index) return;

  const ids = DEFAULT_USERS.map(u => u.id);
  await env.BW_LMS.put("users:index", JSON.stringify(ids));

  for (const u of DEFAULT_USERS) {
    // Ensure shape (pwd record already precomputed in _data.js)
    const user = {
      id: u.id,
      name: u.name,
      username: u.username,
      pwd: u.pwd,
      roles: u.roles || [],
      progress: u.progress || {},
      ack: u.ack || {},
      viewed: u.viewed || {},
    };
    await env.BW_LMS.put(`user:${u.id}`, JSON.stringify(user));
  }
}

export async function loadUserById(env, id) {
  const raw = await env.BW_LMS.get(`user:${id}`);
  return raw ? JSON.parse(raw) : null;
}

export async function saveUser(env, user) {
  await env.BW_LMS.put(`user:${user.id}`, JSON.stringify(user));
}

export async function findUserByCredentials(env, username, password) {
  await seedIfNeeded(env);
  const idx = JSON.parse(await env.BW_LMS.get("users:index"));
  for (const id of idx) {
    const u = await loadUserById(env, id);
    if (u && u.username === username) {
      const ok = await verifyPassword(password, u.pwd);
      if (ok) return u;
    }
  }
  return null;
}

export async function authUser(env, request) {
  await seedIfNeeded(env);
  const token = getToken(request);
  if (!token) return null;
  const sid = await env.BW_LMS.get(`session:${token}`);
  if (!sid) return null;
  const u = await loadUserById(env, sid);
  return u || null;
}

export async function canAccessModule(env, user, moduleId) {
  const mods = await getAllModules(env);
  const m = mods.find(x => x.id === moduleId);
  if (!m) return { ok:false, reason:"Module not found" };
  const roles = user.roles || [];
  const roleOk = m.roles.some(r => roles.includes(r));
  if (!roleOk) return { ok:false, reason:"Not assigned to this module" };
  if (moduleId !== "introduction" && !user.progress?.introduction) {
    return { ok:false, reason:"Complete Introduction to unlock" };
  }
  return { ok:true };
}

export function computeUserProgress(user) {
  const roles = user.roles || [];
  const accessible = MODULES.filter(m => m.roles.some(r => roles.includes(r)));
  const completed = accessible.filter(m => user.progress?.[m.id]).length;
  const percent = accessible.length ? Math.round((completed / accessible.length) * 100) : 0;
  return { total: accessible.length, completed, percent, accessible };
}


export async function rotateSession(env, oldToken, userId){
  if (oldToken) await env.BW_LMS.delete(`session:${oldToken}`);
  const newToken = crypto.randomUUID();
  await env.BW_LMS.put(`session:${newToken}`, userId, { expirationTtl: 60*60*24 });
  return newToken;
}


export function requireRole(user, roles){
  const have = user?.roles || [];
  const ok = roles.some(r => have.includes(r));
  if (!ok) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
}


export async function getCustomModules(env){
  const raw = await env.BW_LMS.get('modules:custom');
  if (!raw) return [];
  try{
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch(_){
    return [];
  }
}

export async function getOverrides(env){
  const raw = await env.BW_LMS.get('modules:overrides');
  if (!raw) return {};
  try{
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  }catch(_){
    return {};
  }
}

export async function saveOverrideModule(env, module){
  const overrides = await getOverrides(env);
  overrides[module.id] = module;
  await env.BW_LMS.put('modules:overrides', JSON.stringify(overrides));
  return { ok:true };
}

export async function deleteOverrideModule(env, id){
  const overrides = await getOverrides(env);
  if (overrides && overrides[id]){
    delete overrides[id];
    await env.BW_LMS.put('modules:overrides', JSON.stringify(overrides));
  }
  return { ok:true };
}



function isMeaningfulPage(p){
  if (!p || typeof p !== 'object') return false;
  const t = (p.type || '').toString();
  // common fields across our builders
  const s = (p.title || '') + (p.heading || '') + (p.text || '') + (p.html || '') + (p.url || '') + (p.src || '');
  if (s.trim().length > 0) return true;
  // allow structured blocks
  if (Array.isArray(p.blocks) && p.blocks.length) return true;
  // allow image/video types with url/src
  if ((t === 'image' || t === 'video') && ((p.url||p.src||'').trim().length>0)) return true;
  return false;
}

function mergeModule(base, override){
  if (!override || typeof override !== 'object') return base;
  const out = { ...base };

  for (const [k,v] of Object.entries(override)){
    if (v === undefined || v === null) continue;

    // arrays: only replace if non-empty
    if (Array.isArray(v)){
      if (v.length > 0){
        if (k === 'pages'){
          const meaningful = v.filter(isMeaningfulPage);
          if (meaningful.length > 0) out[k] = meaningful;
        } else {
          out[k] = v;
        }
      }
      continue;
    }

    // strings: only replace if non-empty (trim)
    if (typeof v === 'string'){
      if (v.trim().length > 0) out[k] = v;
      continue;
    }

    // objects: shallow replace (for style/settings etc)
    out[k] = v;
  }

  return out;
}

export async function getAllModules(env){
  const overrides = await getOverrides(env);
  const custom = await getCustomModules(env);
  const safeCustom = custom.map(m => ({...m, custom:true, type: m.type || 'content'}));

  const coreIds = new Set(MODULES.map(m => m.id));
  const mergedCore = MODULES.map(m => {
    const o = overrides[m.id];
    if (!o) return {...m, builtIn:true, overridden:false};
    // override replaces built-in, but built-in identity/type is locked
    const merged = mergeModule({ ...m, builtIn:true, overridden:true }, { ...o });
    merged.id = m.id;
    merged.type = m.type;
    // safety: if override wipes content/pages, restore from base
    if ((!merged.content || (typeof merged.content === 'string' && merged.content.trim().length === 0)) &&
        (!Array.isArray(merged.pages) || merged.pages.length === 0) &&
        ((m.content && m.content.trim().length) || (Array.isArray(m.pages) && m.pages.length))){
      merged.content = m.content;
      merged.pages = m.pages;
    }
    return merged;
  });

  // avoid id collisions with core modules
  const filteredCustom = safeCustom.filter(m => m && m.id && !coreIds.has(m.id));
  return [...mergedCore, ...filteredCustom];
}

export async function saveCustomModule(env, module){
  const all = await getCustomModules(env);
  const next = all.filter(m => m.id !== module.id);
  next.push({
    id: module.id,
    title: module.title,
    desc: module.desc || "",
    roles: module.roles || [],
    type: module.type || 'content',
    content: module.content || "",
    pages: Array.isArray(module.pages) ? module.pages : [],
    quiz: module.quiz || null,
    style: module.style || null
  });
  await env.BW_LMS.put('modules:custom', JSON.stringify(next));
  return { ok:true };
}
