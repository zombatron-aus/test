import { json, canAccessModule } from "./_helpers.js";

export async function onRequestGet({ request, data }) {
  const id = new URL(request.url).searchParams.get("id") || "";
  const out = canAccessModule(data.user, id);
  return json(out, out.ok ? 200 : 403);
}
