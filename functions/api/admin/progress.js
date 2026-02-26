import { json, requireUser, requireRole, loadUserById, getProgress, listAllModules } from "../_helpers.js";

export async function onRequestGet({request, env}){
  const {user} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  if(!requireRole(user,'admin') && !requireRole(user,'it')) return json({error:"Forbidden"}, 403);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const target = await loadUserById(env, id);
  if(!target) return json({error:"Not found"}, 404);

  // Admin cannot view IT? allowed to view but not edit; keep simple allow.
  const prog = await getProgress(env, target.id);
  const modules = await listAllModules(env);
  const out = modules.map(m=>{
    const p = prog[m.id] || {};
    const status = p.completed ? "Complete" : "Pending";
    return {id:m.id, title:m.title, status};
  }).sort((a,b)=>a.title.localeCompare(b.title));
  return json({modules: out}, 200);
}
