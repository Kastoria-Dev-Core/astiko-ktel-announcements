// Public endpoint the app reads: GET /api/announcements
//
// Serves the feed the cron stored in Redis. Optional query params:
//   ?kind=service   hide balance sheets / shareholder meetings
//   ?active=1       only announcements whose validUntil is today or later
//                   (undated ones are kept for 7 days after publishing)

import { fetchAnnouncements } from "../lib/announcements.js";
import { redis, FEED_KEY } from "../lib/store.js";

const UNDATED_DAYS = 7;

// "Today" in Greece, since validUntil dates are local dates.
function todayInAthens() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(new Date());
}

export default async function handler(req, res) {
  let feed = redis ? await redis.get(FEED_KEY) : null;

  // First deploy, before the cron has ever run: fetch live once and store it.
  if (!feed) {
    try {
      feed = await fetchAnnouncements();
      if (redis) await redis.set(FEED_KEY, feed);
    } catch (err) {
      console.error("live fetch failed:", err);
      return res.status(503).json({ error: "Announcements are not available yet" });
    }
  }

  let items = feed.announcements;
  if (req.query.kind) items = items.filter((a) => a.kind === req.query.kind);
  if (req.query.active === "1") {
    const today = todayInAthens();
    const undatedCutoff = Date.now() - UNDATED_DAYS * 24 * 60 * 60 * 1000;
    items = items.filter((a) =>
      a.validUntil ? a.validUntil >= today : Date.parse(a.published) >= undatedCutoff
    );
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  // Edge-cache for an hour; the feed only changes once a day anyway.
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).json({ ...feed, count: items.length, announcements: items });
}
