import { json, requireUser, requireRole, saveModule, deleteModule, listAllModules } from "../_helpers.js";

export async function onRequestGet({request, env}){
  const {user} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  if(!requireRole(user,'it')) return json({error:"Forbidden"}, 403);

  const modules = await listAllModules(env);
  // Return full defs for IT (includes quiz answers)
  return json({modules: modules.map(m=>({
    id:m.id, title:m.title, description:m.description||"", roles:m.roles||[], flags:m.flags||{}, styling:m.styling||{}
  }))}, 200);
}

export async function onRequestPost({request, env}){
  const {user} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  if(!requireRole(user,'it')) return json({error:"Forbidden"}, 403);

  let body={}; try{ body=await request.json(); }catch(e){}
  // validation light
  if(!body.title) return json({error:"Title required"}, 400);
  if(!Array.isArray(body.roles) || body.roles.length===0) return json({error:"Select roles"}, 400);
  if(!Array.isArray(body.pages) || body.pages.length===0) return json({error:"Add pages"}, 400);

  const mod = {
    id: body.id || null,
    title: String(body.title),
    description: String(body.description||""),
    roles: body.roles,
    flags: body.flags || {},
    styling: body.styling || {},
    pages: body.pages.map(p=>({html: String(p.html||""), plain: String(p.plain||"")})),
    quiz: body.quiz ? {
      shuffle: true,
      passRate: 1.0,
      questions: Array.isArray(body.quiz.questions) ? body.quiz.questions.map(q=>({
        q: String(q.q||""),
        answers: Array.isArray(q.answers)? q.answers.map(a=>String(a)) : [],
        correctIndex: Number(q.correctIndex||0)
      })) : []
    } : null,
    updatedAt: Date.now()
  };

  const id = await saveModule(env, mod);
  return json({ok:true, id}, 200);
}

export async function onRequestDelete({request, env}){
  const {user} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  if(!requireRole(user,'it')) return json({error:"Forbidden"}, 403);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if(!id) return json({error:"Missing id"}, 400);
  await deleteModule(env, id);
  return json({ok:true}, 200);
}
