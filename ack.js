import { json } from "./_helpers.js";

export async function onRequestGet({ data, request }) {
  const u = data.user;
  return json({ progress: u.progress || {}, ack: u.ack || {}, viewed: u.viewed || {} }, 200, {}, request);
}
