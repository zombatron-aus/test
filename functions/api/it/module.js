import { json, requireUser, requireRole, loadModule } from "../_helpers.js";

export async function onRequestGet({request, env}){
  const {user} = await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"}, 401);
  if(!requireRole(user,'it')) return json({error:"Forbidden"}, 403);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const mod = await loadModule(env, id);
  if(!mod) return json({error:"Not found"}, 404);
  return json(mod, 200);
}
