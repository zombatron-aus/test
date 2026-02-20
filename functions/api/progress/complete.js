import { json, requireUser, getProgress, saveProgress, loadModule, canAccessModule } from "../_helpers.js";

export async function onRequestPost({request, env}){
  const {user} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  let body = {};
  try{ body = await request.json(); }catch(e){}
  const moduleId = body.moduleId;
  const mod = await loadModule(env, moduleId);
  if(!mod) return json({error:"Not found"}, 404);
  if(!canAccessModule(user, mod)) return json({error:"Forbidden"}, 403);

  const prog = await getProgress(env, user.id);
  const p = prog[moduleId] || {};
  p.completed = true;
  p.completedAt = Date.now();
  prog[moduleId]=p;
  await saveProgress(env, user.id, prog);
  return json({ok:true}, 200);
}
