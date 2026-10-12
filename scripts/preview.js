// Local check without Vercel or Redis: `npm run preview`
// Prints the feed the cron would store.

import { fetchAnnouncements } from "../lib/announcements.js";

const feed = await fetchAnnouncements();
for (const a of feed.announcements) {
  console.log(`${a.published.slice(0, 10)}  [${a.kind}]  ${a.title}`);
  console.log(`            dates: ${a.dates.join(", ") || "-"}   validUntil: ${a.validUntil ?? "-"}`);
}
console.log(`\n${feed.count} announcements`);
