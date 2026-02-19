import { json, saveUser } from "./_helpers.js";

export async function onRequestPost({ data, env }) {
  const u = data.user;
  u.progress = u.progress || {};
  u.progress["introduction"] = true;
  await saveUser(env, u);
  return json({ ok: true });
}
