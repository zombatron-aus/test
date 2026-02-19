import { json, noContent } from "./_helpers.js";
import { authUser } from "./_helpers.js";

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // CORS preflight
  if (request.method === "OPTIONS") {
    return noContent(204, request);
  }

  // Public route
  if (url.pathname === "/api/login") return next();

  const user = await authUser(env, request);
  if (!user) return json({ error: "Unauthorized" }, 401, {}, request);

  context.data.user = user;
  return next();
}
