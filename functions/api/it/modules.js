import { json, getAllModules, saveCustomModule, saveOverrideModule, deleteOverrideModule, requireRole } from "../_helpers.js";

function slugify(s){
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeModuleBody(body){
  const title = (body.title || "").trim();
  const desc = (body.desc || "").trim();
  const roles = Array.isArray(body.roles) ? body.roles : [];
  const type = (body.type || "").trim() || (Array.isArray(body.pages) && body.pages.length ? "pages" : "content");
  const content = (body.content || "").toString();
  const pages = Array.isArray(body.pages) ? body.pages : [];
  const quiz = body.quiz || null;
  const style = body.style || null;
  return { title, desc, roles, type, content, pages, quiz, style };
}

export async function onRequestGet({ request, env, data }) {
  requireRole(data.user, ["it"]);
  const mods = await getAllModules(env);
  return json(mods.map(m => ({
    id: m.id,
    title: m.title,
    desc: m.desc || "",
    roles: m.roles || [],
    type: m.type || "content",
    custom: !!m.custom,
    builtIn: !!m.builtIn,
    overridden: !!m.overridden,
    // include full editable payload for editor
    content: m.content || "",
    pages: Array.isArray(m.pages) ? m.pages : [],
    quiz: m.quiz || null,
    style: m.style || null
  })), 200, {}, request);
}

export async function onRequestPost({ request, env, data }) {
  requireRole(data.user, ["it"]);
  const body = await request.json().catch(() => ({}));
  const m = normalizeModuleBody(body);

  if (!m.title) return json({ error: "Title is required" }, 400, {}, request);
  if (!m.roles.length) return json({ error: "Select at least one role" }, 400, {}, request);

  let id = (body.id || "").trim();
  if (!id) id = slugify(m.title);
  if (!id) return json({ error: "Could not generate an id" }, 400, {}, request);

  // create as custom module (cannot create new built-in ids)
  const saved = await saveCustomModule(env, { id, ...m });
  return json({ ok:true, id }, 200, {}, request);
}

export async function onRequestPut({ request, env, data }) {
  requireRole(data.user, ["it"]);
  const body = await request.json().catch(() => ({}));
  const id = (body.id || "").trim();
  if (!id) return json({ error: "Missing id" }, 400, {}, request);

  const mods = await getAllModules(env);
  const existing = mods.find(x => x.id === id);
  if (!existing) return json({ error: "Module not found" }, 404, {}, request);

  const next = normalizeModuleBody(body);
  if (!next.title) return json({ error: "Title is required" }, 400, {}, request);
  if (!next.roles.length) return json({ error: "Select at least one role" }, 400, {}, request);

  if (existing.builtIn){
    // Replace built-in by writing an override
    await saveOverrideModule(env, { id, ...next });
    return json({ ok:true, id, overridden:true }, 200, {}, request);
  }else{
    // Update custom module
    await saveCustomModule(env, { id, ...next });
    return json({ ok:true, id, custom:true }, 200, {}, request);
  }
}

export async function onRequestDelete({ request, env, data }) {
  requireRole(data.user, ["it"]);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return json({ error: "Missing id" }, 400, {}, request);

  const mods = await getAllModules(env);
  const existing = mods.find(x => x.id === id);
  if (!existing) return json({ ok:true }, 200, {}, request);

  if (existing.builtIn){
    // deleting a built-in means "revert override"
    await deleteOverrideModule(env, id);
    return json({ ok:true, id, reverted:true }, 200, {}, request);
  }

  // delete custom module from array
  const raw = await env.BW_LMS.get('modules:custom');
  let arr = [];
  try{ arr = raw ? JSON.parse(raw) : []; }catch(_){}
  if (!Array.isArray(arr)) arr = [];
  const next = arr.filter(m => m && m.id !== id);
  await env.BW_LMS.put('modules:custom', JSON.stringify(next));
  return json({ ok:true, id, deleted:true }, 200, {}, request);
}
