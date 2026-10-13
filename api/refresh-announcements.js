// Vercel Cron target: GET /api/refresh-announcements
//
// Pulls the latest announcements from astikoktelkastorias.gr and stores the
// normalized feed in Upstash Redis, where /api/announcements serves it from.
// If the site is down, the previous feed stays in place.
//
// Auth: Vercel Cron sends "Authorization: Bearer $CRON_SECRET" automatically.
// For a manual run from the browser, ?key=$CRON_SECRET works too.

import { timingSafeEqual } from "node:crypto";
import { fetchAnnouncements } from "../lib/announcements.js";
import { redis, FEED_KEY } from "../lib/store.js";

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.authorization;
  if (header && safeEqual(header, `Bearer ${secret}`)) return true;
  const key = req.query.key;
  return typeof key === "string" && safeEqual(key, secret);
}

export default async function handler(req, res) {
  // Never cache this endpoint, so the key in the URL isn't stored at the edge
  res.setHeader("Cache-Control", "no-store");

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!redis) {
    return res.status(500).json({ error: "Upstash Redis is not connected (KV_REST_API_URL / KV_REST_API_TOKEN missing)" });
  }

  try {
    const feed = await fetchAnnouncements();
    const previous = await redis.get(FEED_KEY);
    const previousIds = new Set((previous?.announcements ?? []).map((a) => a.id));
    const added = feed.announcements.filter((a) => !previousIds.has(a.id)).map((a) => a.title);

    await redis.set(FEED_KEY, feed);

    return res.status(200).json({ ok: true, count: feed.count, added, fetchedAt: feed.fetchedAt });
  } catch (err) {
    console.error("refresh-announcements failed:", err);
    return res.status(502).json({ ok: false, error: String(err?.message || err) });
  }
}