import { json, findUserByCredentials, seedIfNeeded } from "./_helpers.js";

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: {
    ...({
      "access-control-allow-origin": request.headers.get("origin") || "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
      "vary": "Origin",
    })
  }});
}


export async function onRequestPost({ request, env }) {
  await seedIfNeeded(env);
  const body = await request.json().catch(() => ({}));
  const username = (body.username || "").trim();
  const password = body.password || "";

  if (!username || !password) return json({ error: "Missing credentials" }, 400, {}, request);

  const user = await findUserByCredentials(env, username, password);
  if (!user) return json({ error: "Invalid username or password" }, 401, {}, request);

  // rotate session on login
  const token = crypto.randomUUID();
  await env.BW_LMS.put(`session:${token}`, user.id, { expirationTtl: 60 * 60 * 24 });

  return json({ token, forceReset: !!user.forceReset }, 200, {}, request);
}
