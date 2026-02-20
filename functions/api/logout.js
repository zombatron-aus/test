import { json, parseCookies, cookie } from "./_helpers.js";
export async function onRequestPost({ request, env }){
  const c=parseCookies(request);
  const sid=c["bw_sess"];
  if(sid) await env.BW_LMS.delete("sess:"+sid);
  return json({ok:true},200,{ "set-cookie": cookie("bw_sess","deleted",{maxAge:0}) });
}
