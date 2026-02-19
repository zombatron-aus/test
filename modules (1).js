import { json, validatePasswordPolicy, hashPasswordPBKDF2, saveUser } from "./_helpers.js";

export async function onRequestPost({ request, data, env }) {
  const u = data.user;
  const body = await request.json().catch(()=>({}));
  const password = body.password || "";

  const err = validatePasswordPolicy(password);
  if (err) return json({ error: err }, 400);

  u.pwd = await hashPasswordPBKDF2(password);
  u.forceReset = false;
  await saveUser(env, u);

  return json({ ok:true });
}
