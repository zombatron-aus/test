import { json, requireUser, requireRole, loadUserById, saveProgress } from "../_helpers.js";

export async function onRequestPost({request, env}){
  const {user} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  if(!requireRole(user,'admin') && !requireRole(user,'it')) return json({error:"Forbidden"}, 403);

  let body={}; try{ body=await request.json(); }catch(e){}
  const target = await loadUserById(env, body.id);
  if(!target) return json({error:"Not found"}, 404);

  // Admin cannot reset IT? allow only IT
  if(target.roles.includes('it') && !requireRole(user,'it')) return json({error:"Only IT can reset IT progress."}, 403);

  await saveProgress(env, target.id, {});
  return json({ok:true}, 200);
}
