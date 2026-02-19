import { json, getAllModules } from "./_helpers.js";

export async function onRequestGet({ request, env }) {
  const mods = await getAllModules(env);
  return json(mods, 200, {}, request);
}
