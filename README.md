# Astika Ktel Kastorias Announcement Feed Cronjob

Cronjob that mirrors the announcements of [astikoktelkastorias.gr](https://astikoktelkastorias.gr/ανακοινώσεις/) into a JSON feed.

It reads the site's public WordPress REST API (`/wp-json/wp/v2/posts`), not the HTML. The site's `robots.txt` allows everything.

## Endpoints

| Path | What |
| --- | --- |
| `GET /api/announcements` | The feed. Edge-cached for 1 hour, CORS open. |
| `GET /api/announcements?kind=service` | Without balance sheets / shareholder meetings. |
| `GET /api/announcements?kind=service&active=1` | Only what's still relevant today (see `validUntil`) |
| `GET /api/refresh-announcements` | Cron target. Needs `Authorization: Bearer $CRON_SECRET`. |

## Feed shape

```json
{
  "source": "https://astikoktelkastorias.gr",
  "fetchedAt": "2026-10-12T05:00:00.000Z",
  "count": 1,
  "announcements": [
    {
      "id": 1376,
      "title": "ΑΝΑΚΟΙΝΩΣΗ 27/7 & 28/7",
      "text": "",
      "kind": "service",
      "published": "2026-07-27T06:12:00.000Z",
      "modified": "2026-07-27T06:12:00.000Z",
      "url": "https://astikoktelkastorias.gr/...",
      "image": "https://astikoktelkastorias.gr/wp-content/uploads/...jpg",
      "attachments": [],
      "dates": ["2026-07-27", "2026-07-28"],
      "validUntil": "2026-07-28"
    }
  ]
}
```

- Most announcements are **a poster image with no text**, so `text` is often empty. The app should show `title` and open `image` or `url` on tap.
- `dates` is a best-effort read of dates in the title/text (`09/06/2025`, `24-12-2025`, `27/7`). `validUntil` is the last one, or `null` when none was found. With `active=1`, undated announcements stay visible for 7 days after publishing.
- The nine timetable posts (Μεσοποταμία, Καλοχώρι, …) are also WordPress posts. They're skipped because they contain tables.
- 
## Local check

```
npm install
npm run preview
```

Prints what the cron would store, but locally for testing purposes.
