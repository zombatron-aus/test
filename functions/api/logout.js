import { json, getToken } from "./_helpers.js";

export async function onRequestPost({ request, env }) {
  const token = getToken(request);
  if (token) await env.BW_LMS.delete(`session:${token}`);
  return json({ ok: true });
}
