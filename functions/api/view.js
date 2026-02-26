import { json, requireUser, setCookieHeaders, loadModule, canAccessModule, getProgress } from "./_helpers.js";

export async function onRequestGet({request, env}){
  const {user, rotated} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if(!id) return json({error:"Missing id"}, 400);

  const mod = await loadModule(env, id);
  if(!mod) return json({error:"Not found"}, 404);
  if(!canAccessModule(user, mod)) return json({error:"Forbidden"}, 403);

  const prog = await getProgress(env, user.id);

  // required-first gating
  const allVisible = (await (await import("./_helpers.js")).listAllModules(env)).filter(m=>canAccessModule(user,m));
  const required = allVisible.filter(m=>m.flags && m.flags.introRequired);
  const incompleteReq = required.filter(m=>!(prog[m.id] && prog[m.id].completed));
  if(incompleteReq.length>0 && !(mod.flags && mod.flags.introRequired) && !(prog[id] && prog[id].completed)){
    return json({error:"Locked", reason:"Complete required-first modules first."}, 423);
  }

  const p = prog[id] || {};
  const pageIndex = Number(p.pageIndex || 0);
  const headers = {};
  if(rotated) headers["Set-Cookie"] = setCookieHeaders("bw_session", rotated, {maxAge: 60*60*24*7});

  // If module has no pages, still return module (client shows notice)
  return json({module: sanitizeModuleForClient(mod), pageIndex}, 200, headers);
}

function sanitizeModuleForClient(m){
  return {
    id:m.id, title:m.title, description:m.description||"",
    roles:m.roles||[],
    flags:m.flags||{},
    styling:m.styling||{},
    pages:(m.pages||[]).map(p=>({html:p.html||""})),
    quiz: m.quiz ? { questions: (m.quiz.questions||[]).map(()=>({})) } : null // hide correct answers here
  };
}
