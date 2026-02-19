import { json, canAccessModule, saveUser } from "./_helpers.js";

export async function onRequestPost({ request, data, env }) {
  const u = data.user;
  const body = await request.json().catch(() => ({}));
  const moduleId = body.moduleId || "";

  const access = canAccessModule(u, moduleId);
  if (!access.ok) return json(access, 403);

  if (!u.viewed?.[moduleId]) return json({ error:"Must open module first" }, 403);
  if (!u.ack?.[moduleId]) return json({ error:"Must acknowledge first" }, 403);

  u.progress = u.progress || {};
  u.progress[moduleId] = true;
  await saveUser(env, u);

  return json({ ok:true });
}
