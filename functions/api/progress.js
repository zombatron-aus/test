import { json, requireUser, loadProgress, saveProgress } from "./_helpers.js";
export async function onRequestPost({ request, env }){
  const user=await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"},401);
  const body=await request.json().catch(()=> ({}));
  if(!body.moduleId) return json({error:"moduleId required"},400);
  const prog=await loadProgress(env, user.id);
  prog[body.moduleId]={...(prog[body.moduleId]||{}), done:!!body.done, quizPassed:!!body.quizPassed, at:Date.now()};
  await saveProgress(env, user.id, prog);
  return json({ok:true});
}
