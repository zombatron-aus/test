import { json, requireUser, setCookieHeaders, listAllModules, getProgress, canAccessModule, computePercent } from "./_helpers.js";

export async function onRequestGet({request, env}){
  const {user, rotated} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);

  const all = await listAllModules(env);
  const visible = all.filter(m=>canAccessModule(user, m));

  const prog = await getProgress(env, user.id);

  // Required-first gating: if any introRequired module visible and not completed -> lock all others
  const required = visible.filter(m=>m.flags && m.flags.introRequired);
  const incompleteReq = required.filter(m=>!(prog[m.id] && prog[m.id].completed));
  const locked = incompleteReq.length > 0;

  const modules = visible
    .sort((a,b)=> (b.flags?.introRequired?1:0)-(a.flags?.introRequired?1:0) || a.title.localeCompare(b.title))
    .map(m=>{
      const p = prog[m.id] || {};
      return {
        id:m.id,
        title:m.title,
        description:m.description||"",
        completed: !!p.completed,
        locked: locked && !(m.flags && m.flags.introRequired) && !(p.completed)
      };
    });

  const percent = computePercent(visible, prog);
  const headers = {};
  if(rotated) headers["Set-Cookie"] = setCookieHeaders("bw_session", rotated, {maxAge: 60*60*24*7});
  return json({
    modules,
    percent,
    lockedReason: locked ? "Complete required-first modules before continuing." : null
  }, 200, headers);
}
