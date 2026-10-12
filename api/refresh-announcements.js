// Vercel Cron target: GET /api/refresh-announcements
//
// Pulls the latest announcements from astikoktelkastorias.gr and stores the
// normalized feed in Upstash Redis, where /api/announcements serves it from.
// If the site is down, the previous feed stays in place.

import { fetchAnnouncements } from "../lib/announcements.js";
import { redis, FEED_KEY } from "../lib/store.js";

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
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
