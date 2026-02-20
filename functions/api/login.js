import { json, seedIfNeeded, loadUserByUsername, verifyPasswordPBKDF2, createSession, setCookieHeaders } from "./_helpers.js";

export async function onRequestPost({request, env}){
  await seedIfNeeded(env);
  let body = {};
  try{ body = await request.json(); }catch(e){}
  const username = (body.username||"").trim();
  const password = body.password || "";
  const user = await loadUserByUsername(env, username);
  if(!user) return json({error:"Invalid user or password"}, 401);
  const ok = await verifyPasswordPBKDF2(password, user.pw);
  if(!ok) return json({error:"Invalid user or password"}, 401);

  const sess = await createSession(env, user.id);
  const cookie = setCookieHeaders("bw_session", sess.token, {maxAge: 60*60*24*7});
  return json({ok:true, mustReset: !!user.mustReset}, 200, {"Set-Cookie": cookie});
}
