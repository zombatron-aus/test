import { json } from "./_helpers.js";

export async function onRequestGet({ data, request }) {
  const u = data.user;
  return json({ id: u.id, name: u.name, username: u.username, roles: u.roles || [] }, 200, {}, request);
}
