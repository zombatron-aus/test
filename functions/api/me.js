import { json, requireUser, setCookieHeaders } from "./_helpers.js";

export async function onRequestGet({request, env}){
  const {user, rotated} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  const headers = {};
  if(rotated) headers["Set-Cookie"] = setCookieHeaders("bw_session", rotated, {maxAge: 60*60*24*7});
  return json({id:user.id, name:user.name, username:user.username, roles:user.roles||[], mustReset: !!user.mustReset}, 200, headers);
}
