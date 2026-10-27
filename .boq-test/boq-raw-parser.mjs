/**
 * Google Maps BOQ raw-review decoder (shared across ALL brands / stores).
 *
 * google-maps-review-scraper@3.1.0's boqParser.ts chooses `fullText`
 * at a fixed offset, even when it contains a locale label (zh-Hant/Chinese)
 * and the actual review body is in the adjacent field. Fetching `clean:false`
 * gives the very same paginated Google reviews, before that lossy parser.
 * This module repairs text extraction without additional HTTP requests.
 *
 * Uses the library's other known positions for review ID, author, rating,
 * and timestamp; does NOT mistake reviewer/QA/photo labels for review text.
 */
const LANGUAGE_TAG = /^(?:[a-z]{2,3}(?:[-_][a-z0-9]{2,8}){0,3}|chinese|english|japanese|korean|traditional\s+chinese|simplified\s+chinese|chinese\s*\((?:traditional|simplified)\)|中文|繁體中文|简体中文|英文|日文|韓文)$/i;
const METADATA_LABEL = /^(?:Google|Local Guide|View original|Translated by Google|Translated from .+|Reviews?|照片|評論|張相片|篇評論|本地嚮導|在地嚮導)$/i;

export function isLocaleOnly(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  return Boolean(s && LANGUAGE_TAG.test(s));
}

function goodText(value) {
  if (typeof value !== 'string') return '';
  const s = value.trim();
  if (!s || isLocaleOnly(s) || METADATA_LABEL.test(s)) return '';
  if (/^(?:https?:\/\/|\/\/|www\.)/i.test(s)) return '';
  if (/^[a-z\d_=-]{30,}$/i.test(s) && !/\s/.test(s)) return ''; // encoded ids
  if (/^\d{4}-\d\d-\d\d(?:T|$)/.test(s)) return ''; // date field
  return s;
}

function getPath(v, indices) {
  for (const i of indices) {
    if (!Array.isArray(v)) return undefined;
    v = v[i];
  }
  return v;
}

// Review-text object: ["the review body", null, [0, character_count]]
// Google can nest this under multiple arrays. Limit recursion to the review
// body neighborhood to avoid mistaking photo captions/structured ratings.
function textObjects(node, depth = 0, out = []) {
  if (depth > 5 || !Array.isArray(node)) return out;
  if (typeof node[0] === 'string' &&
      (node[1] === null || node[1] === undefined) &&
      Array.isArray(node[2]) && node[2].length >= 2 &&
      typeof node[2][1] === 'number') {
    const candidate = goodText(node[0]);
    if (candidate) out.push(candidate);
  }
  for (const item of node) if (Array.isArray(item)) textObjects(item, depth + 1, out);
  return out;
}

function googleIndex(raw) {
  for (let i = raw.length - 1; i >= 0; i--) {
    if (Array.isArray(raw[i]) && raw[i][0] === 'Google') return i;
  }
  return raw.length;
}

/** Return best available REAL review body; never return a language marker. */
export function extractRawCommentText(raw) {
  if (!Array.isArray(raw)) return '';
  const end = googleIndex(raw);
  let qa = -1;
  // Match the QA-array anchor used by upstream boqParser.ts, but choose
  // the *actual* review text, not a nearby locale string.
  for (let i = 6; i < end; i++) {
    if (typeof getPath(raw[i], [0, 0, 0]) === 'string') qa = i;
  }
  if (qa >= 0) {
    const a = goodText(raw[qa - 2]);
    const b = goodText(raw[qa - 3]);
    // Two versions of the same review: keep the complete, untruncated one.
    if (a && b && (a.includes(b) || b.includes(a))) {
      return a.length >= b.length ? a : b;
    }
  }
  const candidates = [];
  function add(v, priority) {
    const s = goodText(v);
    if (s) candidates.push({ s, priority });
  }
  if (qa >= 0) {
    // -3 is the field frequently parsed as zh-Hant/Chinese by v3.1.0;
    // -2 is often the actual customer review text.
    add(raw[qa - 2], 130);
    add(raw[qa - 3], 120);
    add(raw[qa - 1], 90);
    // When Google uses a structured text object, it sits near the QA anchor.
    for (let i = Math.max(6, qa - 5); i <= Math.min(end - 1, qa + 1); i++) {
      for (const s of textObjects(raw[i])) add(s, 125);
    }
  }
  // Known structured Google review-text objects outside the QA neighborhood.
  for (let i = 6; i < end; i++) {
    if (i === qa) continue;
    for (const s of textObjects(raw[i])) add(s, 100);
  }
  // Conservative fallback for top-level plain-string text when there is no QA
  // anchor; ignore language, urls and system labels. Search only review body.
  if (!candidates.length && qa < 0) {
    for (let i = 6; i < end; i++) {
      if (typeof raw[i] === 'string') add(raw[i], 10);
    }
  }
  if (!candidates.length) return '';
  // Give precedence to the intended location, then prefer untruncated body.
  // A shorter but higher-confidence review can win only within 40 chars.
  candidates.sort((a, b) => (b.priority + Math.min(b.s.length, 400) / 40) -
                            (a.priority + Math.min(a.s.length, 400) / 40));
  return candidates[0].s;
}

function numericStamp(value) {
  if (typeof value === 'number') {
    if (value > 1e14) return Math.floor(value / 1000); // microseconds
    if (value > 1e11) return value; // milliseconds
    if (value > 1e9) return value * 1000; // seconds
  }
  return value ?? null;
}

/**
 * Convert one `scraper({clean:false})` raw row into the same shape used by
 * the existing normalizeReview(). Review IDs and per-store JSON keys stay put.
 */
export function parseBOQRawReview(raw) {
  if (!Array.isArray(raw) || raw.length < 6) return null;
  const rating = Number(raw[1]);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
  const author = Array.isArray(raw[3]) ? raw[3] : [];
  const name = typeof author[0] === 'string' ? author[0] : 'Google 使用者';
  const profileUrl = typeof author[1] === 'string' ? author[1] : '';
  const authorUrl = typeof author[2] === 'string' ? author[2] : '';
  const authorId = authorUrl.match(/\/contrib\/(\d+)/)?.[1] || 'Unknown';
  const time = Array.isArray(raw[2]) ? raw[2] : [];
  return {
    review_id: typeof raw[5] === 'string' ? raw[5] : '',
    time: { published: numericStamp(time[2]), last_edited: null },
    author: { name, profile_url: profileUrl, url: authorUrl, id: authorId },
    review: { rating, text: extractRawCommentText(raw) },
    response: null,
    source: 'Google Local Search Panel',
  };
}

export function parseBOQRawRows(rows) {
  if (!Array.isArray(rows)) throw new Error('BOQ raw response is not an array');
  const parsed = [];
  let rawLocaleTags = 0;
  let missingTexts = 0;
  for (const r of rows) {
    if (!Array.isArray(r)) continue;
    const next = parseBOQRawReview(r);
    if (!next) continue;
    // Statistics only: do not confuse true star-only ratings with parser errors.
    if (r.some?.(v => isLocaleOnly(v))) rawLocaleTags++;
    if (!next.review.text) missingTexts++;
    parsed.push(next);
  }
  return { rows: parsed, rawCount: rows.length, rawLocaleTags, missingTexts };
}
