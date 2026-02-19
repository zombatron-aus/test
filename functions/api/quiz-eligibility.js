import { json, canAccessModule } from "./_helpers.js";
import { MODULES } from "./_data.js";

export async function onRequestGet({ request, data }) {
  const u = data.user;
  const moduleId = new URL(request.url).searchParams.get("id") || "";

  const access = canAccessModule(u, moduleId);
  if (!access.ok) return json({ ok:false, reason: access.reason }, 403);

  const m = MODULES.find(x => x.id === moduleId);
  if (!m || !m.quiz) return json({ ok:false, reason:"No quiz for this module" }, 400);

  if (!u.viewed?.[moduleId]) return json({ ok:false, reason:"Open the module before attempting the quiz" }, 403);
  if (!u.ack?.[moduleId]) return json({ ok:false, reason:"Acknowledge the module before starting the quiz" }, 403);

  return json({ ok:true });
}
