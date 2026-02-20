import { json, requireUser, getProgress, saveProgress, loadModule, canAccessModule } from "../_helpers.js";

export async function onRequestPost({request, env}){
  const {user} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  let body = {};
  try{ body = await request.json(); }catch(e){}
  const moduleId = body.moduleId;
  const answers = body.answers || [];
  if(!moduleId) return json({error:"Missing moduleId"}, 400);

  const mod = await loadModule(env, moduleId);
  if(!mod) return json({error:"Not found"}, 404);
  if(!canAccessModule(user, mod)) return json({error:"Forbidden"}, 403);

  const prog = await getProgress(env, user.id);
  const p = prog[moduleId] || {};
  const key = p.quizKey;
  if(!Array.isArray(key) || key.length!==answers.length) return json({error:"Quiz session expired. Refresh quiz."}, 400);

  let ok = true;
  for(let i=0;i<key.length;i++){
    if(answers[i] !== key[i]){ ok=false; break; }
  }
  if(ok){
    p.quizPassed = true;
    p.completed = true;
    p.completedAt = Date.now();
  }else{
    p.quizPassed = false;
  }
  // clear key regardless
  delete p.quizKey; delete p.quizKeyAt;
  prog[moduleId] = p;
  await saveProgress(env, user.id, prog);
  return json({passed: ok}, 200);
}
