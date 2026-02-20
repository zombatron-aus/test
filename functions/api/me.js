import { json, requireUser } from "./_helpers.js";
export async function onRequestGet({ request, env }){
  const user=await requireUser(env, request);
  if(!user) return json({error:"Unauthorized"},401);
  return json({ id:user.id, name:user.name, username:user.username, roles:user.roles });
}
