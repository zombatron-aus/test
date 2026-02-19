import { json, seedIfNeeded, loadUserById, saveUser } from "../_helpers.js";

function requireAdmin(user) {
    return user?.roles?.includes("admin") || user?.roles?.includes("it");
}

export async function onRequestPost({ request, env, data }) {
  const admin = data.user;
  if (!requireAdmin(admin)) return json({ error: "Forbidden" }, 403);
  await seedIfNeeded(env);

  const body = await request.json().catch(()=> ({}));
  const id = body.id;
  if (!id) return json({ error:"Missing user id" }, 400);

  const u = await loadUserById(env, id);
  if (!u) return json({ error:"User not found" }, 404);
  if (!admin?.roles?.includes('it') && (u.roles || []).includes('it')) return json({ error: 'Forbidden' }, 403);

  u.progress = {};
  u.ack = {};
  u.viewed = {};
  await saveUser(env, u);

  return json({ ok:true });
}
