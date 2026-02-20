import { json, seedIfNeeded, findUserByUsername, verifyPassword, createSession, cookie } from "./_helpers.js";
export async function onRequestPost({ request, env }){
  await seedIfNeeded(env);
  const body = await request.json().catch(()=> ({}));
  const username=(body.username||"").trim();
  const password=body.password||"";
  const user=await findUserByUsername(env, username);
  if(!user) return json({error:"Invalid username or password"},401);
  const ok=await verifyPassword(password, user.pwd);
  if(!ok) return json({error:"Invalid username or password"},401);
  const sid=await createSession(env, user.id);
  return json({ok:true},200,{ "set-cookie": cookie("bw_sess", sid, {maxAge:60*60*24*7}) });
}
