import { json, findUserByCredentials, seedIfNeeded } from "./_helpers.js";
import { corsHeaders, noContent } from "./_helpers.js";

export async function onRequest({ request, env }) {
  // CORS preflight
  if (request.method === "OPTIONS") return noContent(204, request);

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        "allow": "POST, OPTIONS",
        ...corsHeaders(request),
      },
    });
  }

  await seedIfNeeded(env);
  const body = await request.json().catch(() => ({}));
  const username = (body.username || "").trim();
  const password = body.password || "";

  if (!username || !password) return json({ error: "Missing credentials" }, 400, {}, request);

  const user = await findUserByCredentials(env, username, password);
  if (!user) return json({ error: "Invalid username or password" }, 401, {}, request);

  const token = crypto.randomUUID();
  await env.BW_LMS.put(`session:${token}`, user.id, { expirationTtl: 60 * 60 * 24 });

  return json({ token, forceReset: !!user.forceReset }, 200, {}, request);
}
