import { json, requireUser, getAccessibleModules, loadProgress } from "./_helpers.js";
export async function onRequestGet({ request, env }){
  const user=await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"},401);
  const id=new URL(request.url).searchParams.get("id");
  const modules=await getAccessibleModules(env, user);
  const m=modules.find(x=>x.id===id);
  if(!m) return json({error:"Not found"},404);
  if(m.locked) return json({error:"Locked"},403);
  const progress=await loadProgress(env, user.id);
  return json({ module:m, progress });
}
