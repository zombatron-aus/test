import { json, canAccessModule, saveUser } from "./_helpers.js";

export async function onRequestPost({ request, data, env }) {
  const u = data.user;
  const body = await request.json().catch(() => ({}));
  const moduleId = body.moduleId || "";
  const access = canAccessModule(u, moduleId);
  if (!access.ok) return json(access, 403);

  u.viewed = u.viewed || {};
  u.viewed[moduleId] = Date.now();
  await saveUser(env, u);

  return json({ ok: true });
}
