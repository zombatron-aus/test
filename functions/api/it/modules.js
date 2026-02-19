import { json, getAllModules, saveCustomModule, requireRole } from "../_helpers.js";

const slugify = (s) => (s || "")
  .toString()
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 64);

export async function onRequestGet({ request, env, data }) {
  requireRole(data.user, ["it"]);
  const mods = await getAllModules(env);
  // Return only custom modules created via IT tools (and mark them)
  const custom = mods.filter(m => !!m.custom);
  return json(custom.map(m => ({
    id: m.id,
    title: m.title,
    desc: m.desc || "",
    roles: m.roles || [],
    pages: m.pages || [],
    style: m.style || null,
    quiz: m.quiz || null,
    custom: true
  })), 200, {}, request);
}

export async function onRequestPost({ request, env, data }) {
  requireRole(data.user, ["it"]);
  const body = await request.json().catch(() => ({}));

  const title = (body.title || "").trim();
  const desc  = (body.desc || "").trim();
  const roles = Array.isArray(body.roles) ? body.roles : [];
  const pages = Array.isArray(body.pages) ? body.pages : [];
  const style = body.style || null;
  const quiz  = body.quiz || null;

  if (!title) return json({ error: "Title is required" }, 400, {}, request);
  if (!roles.length) return json({ error: "Select at least one role" }, 400, {}, request);
  if (!pages.length) return json({ error: "Add at least one page" }, 400, {}, request);

  // Generate a stable id unless explicitly provided
  const id = (body.id || "").trim() || slugify(title) || `module-${Date.now()}`;

  // legacy content fallback (rendered if pages not supported by the client)
  const first = pages[0] || {};
  let content = "";
  if (first.type === "richtext") content = (first.html || "").replace(/<[^>]*>/g, "").slice(0, 2000);
  else if (first.type === "media") content = (first.caption || first.url || "").slice(0, 2000);

  await saveCustomModule(env, { id, title, desc, roles, pages, style, quiz, content });

  return json({ ok: true, id }, 200, {}, request);
}