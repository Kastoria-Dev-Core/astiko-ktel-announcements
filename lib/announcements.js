// Fetches the announcements ("Ανακοινώσεις") of astikoktelkastorias.gr and
// normalizes them into the shape the Android app reads.
//
// The site is WordPress, so instead of scraping HTML we read the public REST
// API (/wp-json/wp/v2/posts). robots.txt allows everything. Most service
// announcements are a single poster image with no body text, so every item
// keeps its image URL and the dates we could find in the title/text.

const SITE = process.env.SOURCE_SITE || "https://astikoktelkastorias.gr";
const LIMIT = Number(process.env.ANNOUNCEMENTS_LIMIT || 30);
const USER_AGENT = "astiko-ktel-announcements/1.0 (+android app feed)";

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function htmlToText(html) {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// Uppercase without accents, so "Ισολογισμός" and "ΙΣΟΛΟΓΙΣΜΟΣ" compare equal.
function fold(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

// Shareholder meetings and balance sheets are posted in the same feed but
// are not about service. The app can hide them.
function classify(title) {
  return /ΙΣΟΛΟΓΙΣΜ|ΣΥΝΕΛΕΥΣ/.test(fold(title)) ? "corporate" : "service";
}

const pad = (n) => String(n).padStart(2, "0");

// Finds dates like 09/06/2025, 24-12-2025, 1/1/26, 3.3.2025 and, when the
// year is missing ("27/7 & 28/7"), assumes the occurrence nearest to the
// publish date. "." is only accepted with a year, so times like 13.55 are
// not read as dates.
function extractDates(text, published) {
  const pubYear = published.getUTCFullYear();
  const found = new Set();
  const re = /(?<![\d:])(\d{1,2})\s*([\/\-.])\s*(\d{1,2})(?:\2(\d{4}|\d{2}))?(?![\d:])/g;
  for (const m of text.matchAll(re)) {
    const [, d, sep, mo, y] = m;
    if (sep === "." && !y) continue;
    const day = Number(d);
    const month = Number(mo);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    let year;
    if (y) {
      year = y.length === 2 ? 2000 + Number(y) : Number(y);
    } else {
      // Closest of last/this/next year to the publish date.
      year = [pubYear - 1, pubYear, pubYear + 1].reduce((best, cand) =>
        Math.abs(Date.UTC(cand, month - 1, day) - published) <
        Math.abs(Date.UTC(best, month - 1, day) - published) ? cand : best
      );
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1) continue; // e.g. 31/2
    found.add(`${year}-${pad(month)}-${pad(day)}`);
  }
  return [...found].sort();
}

function normalize(post) {
  const html = post.content?.rendered ?? "";
  const title = htmlToText(post.title?.rendered ?? "").replace(/\n/g, " ");
  const text = htmlToText(html);
  const published = new Date(post.date_gmt ? post.date_gmt + "Z" : post.date);

  const image = html.match(/<img[^>]+src="([^"]+)"/i)?.[1] ?? null;
  const attachments = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => decodeEntities(m[1]));
  const dates = extractDates(`${title}\n${text}`, published);

  return {
    id: post.id,
    title,
    text,
    kind: classify(title),
    published: published.toISOString(),
    modified: new Date(post.modified_gmt ? post.modified_gmt + "Z" : post.modified).toISOString(),
    url: post.link,
    image: image && decodeEntities(image).replace(/^http:\/\//, "https://"),
    attachments: [...new Set(attachments)],
    dates,
    // Last date mentioned in the announcement. The app can stop showing the
    // banner after it. null when no date was found (e.g. image-only posts
    // with an undated title) — the app should fall back to the publish date.
    validUntil: dates.at(-1) ?? null,
  };
}

export async function fetchAnnouncements() {
  const url = new URL("/wp-json/wp/v2/posts", SITE);
  url.searchParams.set("per_page", String(Math.min(LIMIT, 100)));
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");
  url.searchParams.set("_fields", "id,date,date_gmt,modified,modified_gmt,link,title,content");

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`WordPress API ${res.status} ${res.statusText}`);
  const posts = await res.json();
  if (!Array.isArray(posts)) throw new Error("WordPress API returned an unexpected payload");

  // The nine timetable posts (Μεσοποταμία, Καλοχώρι, …) are also WordPress
  // posts but they're tables, not announcements. Skip anything with a table.
  const announcements = posts
    .filter((p) => !/<table/i.test(p.content?.rendered ?? ""))
    .map(normalize);

  return {
    source: SITE,
    fetchedAt: new Date().toISOString(),
    count: announcements.length,
    announcements,
  };
}
