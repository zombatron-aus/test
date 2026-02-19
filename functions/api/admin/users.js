import { json, seedIfNeeded, loadUserById, saveUser, computeUserProgress, hashPasswordPBKDF2 } from "../_helpers.js";

function requireAdmin(user) {
    return user?.roles?.includes("admin") || user?.roles?.includes("it");
}

export async function onRequestGet({ request, env, data }) {
  const admin = data.user;
  if (!requireAdmin(admin)) return json({ error: "Forbidden" }, 403);
  await seedIfNeeded(env);

  const id = new URL(request.url).searchParams.get("id");
  const index = JSON.parse(await env.BW_LMS.get("users:index"));

  if (id) {
    const u = await loadUserById(env, id);
    if (!u) return json({ error:"User not found" }, 404);

    const { total, completed, percent, accessible } = computeUserProgress(u);
    const modules = accessible.map(m => ({ id:m.id, title:m.title, done: !!u.progress?.[m.id] }));

    return json({
      user: {
        id: u.id,
        name: u.name,
        username: u.username,
        roles: u.roles || [],
        total, completed, progressPercent: percent,
        modules
      }
    });
  }

  const out = [];
  for (const uid of index) {
    const u = await loadUserById(env, uid);
    if (!u) continue;
    const { percent } = computeUserProgress(u);
    out.push({ id: u.id, name: u.name, username: u.username, roles: u.roles || [], progressPercent: percent });
  }
  out.sort((a,b)=> (b.roles.includes('admin') - a.roles.includes('admin')) || a.name.localeCompare(b.name));
  return json({ users: out });
}

export async function onRequestPost({ request, env, data }) {
  const admin = data.user;
  if (!requireAdmin(admin)) return json({ error: "Forbidden" }, 403);
  await seedIfNeeded(env);

  const body = await request.json().catch(()=> ({}));
  const name = (body.name || "").trim();
  const username = (body.username || "").trim();
  const password = body.password || "";
  const roles = Array.isArray(body.roles) ? body.roles : [];

  if (!name || !username || !password) return json({ error:"Missing required fields" }, 400);
  if (!roles.length) return json({ error:"Select at least one role" }, 400);

  const index = JSON.parse(await env.BW_LMS.get("users:index"));
  for (const uid of index) {
    const u = await loadUserById(env, uid);
    if (u && u.username === username) return json({ error:"Username taken" }, 409);
  }

  const id = crypto.randomUUID();
  const pwd = await hashPasswordPBKDF2(password);

  const user = { id, name, username, pwd, roles, progress:{}, ack:{}, viewed:{}, forceReset: true };
  index.push(id);
  await env.BW_LMS.put("users:index", JSON.stringify(index));
  await saveUser(env, user);

  return json({ ok:true, id });
}

export async function onRequestPut({ request, env, data }) {
  const admin = data.user;
  if (!requireAdmin(admin)) return json({ error: "Forbidden" }, 403);
  await seedIfNeeded(env);

  const body = await request.json().catch(()=> ({}));
  const id = body.id;
  if (!id) return json({ error:"Missing user id" }, 400);

  const u = await loadUserById(env, id);
  if (!u) return json({ error:"User not found" }, 404);

  const name = (body.name || "").trim();
  const username = (body.username || "").trim();
  const password = (body.password || "");
  const roles = Array.isArray(body.roles) ? body.roles : [];

  if (!name || !username) return json({ error:"Missing required fields" }, 400);
  if (!roles.length) return json({ error:"Select at least one role" }, 400);

  const index = JSON.parse(await env.BW_LMS.get("users:index"));
  for (const uid of index) {
    if (uid == id) continue;
    const other = await loadUserById(env, uid);
    if (other && other.username === username) return json({ error:"Username taken" }, 409);
  }

  u.name = name;
  u.username = username;
  u.roles = roles;

  // If password provided (non-empty), rotate hash; otherwise keep existing hash
  if (password && password.trim().length > 0) {
    u.pwd = await hashPasswordPBKDF2(password);
  }

  await saveUser(env, u);
  return json({ ok:true });
}
