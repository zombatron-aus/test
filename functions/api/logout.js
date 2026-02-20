import { json, getCookie, deleteSession, setCookieHeaders } from "./_helpers.js";

export async function onRequestPost({request, env}){
  const token = getCookie(request, "bw_session");
  if(token) await deleteSession(env, token);
  const cookie = setCookieHeaders("bw_session", "", {maxAge: 0});
  return json({ok:true}, 200, {"Set-Cookie": cookie});
}
