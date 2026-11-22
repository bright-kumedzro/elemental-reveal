// Upstash Redis over its REST API, so the functions need no dependencies.
// The Vercel Marketplace integration provides the URL and token as environment variables.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const configured = Boolean(URL_ && TOKEN);

/** Run several commands in one round trip; returns each command's result. */
export async function pipeline(commands) {
  const res = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return (await res.json()).map((r) => r.result);
}

/** Redis HGETALL comes back as a flat [k, v, k, v…] list. */
export const toObject = (flat) => {
  const o = {};
  for (let i = 0; flat && i < flat.length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
};
