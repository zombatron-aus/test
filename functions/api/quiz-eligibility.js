import { json, requireUser, loadModule, canAccessModule, getProgress } from "./_helpers.js";

export async function onRequestGet({request, env}){
  const {user} = await requireUser(env, request);
  if(!user) return json({ok:false, reason:"Unauthorized"}, 401);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if(!id) return json({ok:false, reason:"Missing id"}, 400);
  const mod = await loadModule(env, id);
  if(!mod) return json({ok:false, reason:"Not found"}, 404);
  if(!canAccessModule(user, mod)) return json({ok:false, reason:"Forbidden"}, 403);

  const prog = await getProgress(env, user.id);
  const p = prog[id] || {};
  const pages = mod.pages || [];
  if(pages.length===0) return json({ok:false, reason:"No pages in module."}, 200);
  const requiredIndex = pages.length-1;
  if((p.pageIndex||0) < requiredIndex){
    return json({ok:false, reason:"Finish all pages before taking the quiz."}, 200);
  }
  if(!mod.quiz || !mod.quiz.questions || mod.quiz.questions.length===0){
    return json({ok:false, reason:"No quiz for this module."}, 200);
  }
  return json({ok:true}, 200);
}
