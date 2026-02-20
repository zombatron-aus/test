import { json, requireUser, requireRole, normalizeUsername, loadUserByUsername, hashPasswordPBKDF2, saveUser, randomId } from "../_helpers.js";

export async function onRequestPost({request, env}){
  const {user} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  if(!requireRole(user,'admin') && !requireRole(user,'it')) return json({error:"Forbidden"}, 403);

  let body={}; try{ body=await request.json(); }catch(e){}
  const name = (body.name||"").trim();
  const username = normalizeUsername(body.username);
  const password = body.password || "";
  const roles = Array.isArray(body.roles)? body.roles : [];
  if(!name || !username || !password) return json({error:"Missing required fields"}, 400);

  // Only IT can create IT role
  if(roles.includes('it') && !requireRole(user,'it')) return json({error:"Only IT can assign IT role."}, 403);

  const exists = await loadUserByUsername(env, username);
  if(exists) return json({error:"Username taken"}, 409);

  const id = randomId("u_");
  const pw = await hashPasswordPBKDF2(password);
  const u = {id, name, username, roles, pw, mustReset:true, createdAt: Date.now()};
  await saveUser(env, u);

  return json({ok:true, id}, 200);
}
