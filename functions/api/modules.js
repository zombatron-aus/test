import { json } from "./_helpers.js";
import { MODULES } from "./_data.js";

export async function onRequestGet({ request }) {
  return json(MODULES, 200, {}, request);
}
