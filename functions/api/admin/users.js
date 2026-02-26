import { json, requireUser, requireRole, listUsers, loadUserById, saveUser, hashPasswordPBKDF2, normalizeUsername } from "../_helpers.js";

export async function onRequestGet({request, env}){
  const {user} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  if(!(requireRole(user,'admin') || requireRole(user,'it'))) return json({error:"Forbidden"}, 403);

  const users = await listUsers(env);
  return json({users}, 200);
}

export async function onRequestPut({request, env}){
  const {user} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  if(!(requireRole(user,'admin') || requireRole(user,'it'))) return json({error:"Forbidden"}, 403);

  let body={}; try{ body=await request.json(); }catch(e){}
  const target = await loadUserById(env, body.id);
  if(!target) return json({error:"Not found"}, 404);

  const isIT = requireRole(user,'it');
  if(target.roles.includes('it') && !isIT) return json({error:"IT accounts can only be edited by IT."}, 403);

  const newUsername = normalizeUsername(body.username);
  if(!newUsername) return json({error:"Username required"}, 400);
  target.name = (body.name||"").trim() || target.name;
  target.username = newUsername;

  // roles: admin cannot assign IT
  const roles = Array.isArray(body.roles) ? body.roles : target.roles;
  if(!isIT){
    const filtered = roles.filter(r=>r!=='it');
    if(target.roles.includes('it')) filtered.push('it');
    target.roles = Array.from(new Set(filtered));
  }else{
    target.roles = Array.from(new Set(roles));
  }

  // password reset
  if(body.password && String(body.password).trim().length>0){
    target.pw = await hashPasswordPBKDF2(body.password);
    if(body.forceReset) target.mustReset = true;
  }

  await saveUser(env, target);
  return json({ok:true}, 200);
}
