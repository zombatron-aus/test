import { json, getAllModules, saveCustomModule, requireRole } from "../_helpers.js";

export async function onRequestGet({ request, env, data }) {
  requireRole(data.user, ["it"]);
  const mods = await getAllModules(env);
  // mark custom
  return json(mods.map(m => ({...m, custom: !!m.custom})), 200, {}, request);
}

export async function onRequestPost({ request, env, data }) {
  requireRole(data.user, ["it"]);
  const body = await request.json().catch(() => ({}));
  const title = (body.title || "").trim();
  const id = (body.id || "").trim();
  const content = (body.content || "").trim();
  const roles = Array.isArray(body.roles) ? body.roles : [];
  if (!title || !id || !content) return json({ error: "title, id and content are required" }, 400, {}, request);
  if (!roles.length) return json({ error: "Select at least one role" }, 400, {}, request);

  const saved = await saveCustomModule(env, { id, title, content, roles });
  return json(saved, 200, {}, request);
}
