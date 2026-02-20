import { json, requireUser, passwordPolicyOk, hashPasswordPBKDF2, saveUser, setCookieHeaders } from "./_helpers.js";

export async function onRequestPost({request, env}){
  const {user, rotated} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);

  let body = {};
  try{ body = await request.json(); }catch(e){}
  const password = body.password || "";
  const pol = passwordPolicyOk(password);
  if(!pol.ok) return json({error: pol.reason}, 400);

  user.pw = await hashPasswordPBKDF2(password);
  user.mustReset = false;
  await saveUser(env, user);

  const headers = {};
  if(rotated) headers["Set-Cookie"] = setCookieHeaders("bw_session", rotated, {maxAge: 60*60*24*7});
  return json({ok:true}, 200, headers);
}
