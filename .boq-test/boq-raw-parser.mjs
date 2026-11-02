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

/**
 * A short excerpt and a multi-paragraph original can coexist in the BOQ row.
 * Keep the customer's original language, but upgrade a preview to a verified
 * longer text when the beginning clearly matches. Never concatenate unrelated
 * fields, and never treat a different-language translation as continuation.
 */
function comparable(value) {
  return String(value || '')
    .replace(/(?:\.\.\.|…|⋯)\s*$/u, '')
    .replace(/\s+/gu, '')
    .replace(/[，。！？、,.!?;；:："“”‘’'()（）]/gu, '');
}

function sameBeginning(shortValue, longerValue) {
  const a = comparable(shortValue);
  const b = comparable(longerValue);
  if (a.length < 15 || b.length <= a.length) return false;
  // The first 24 characters must match; the rest may be shortened/reformatted.
  const prefixSize = Math.min(24, a.length);
  return a.slice(0, prefixSize) === b.slice(0, prefixSize) &&
    (b.startsWith(a) || b.slice(0, Math.min(40, a.length)) === a.slice(0, Math.min(40, a.length)));
}

function collectRawTextCandidates(raw, qa, end) {
  const candidates = [];
  const seen = new Set();
  function add(value, source) {
    const str = goodText(value);
    if (!str || seen.has(str)) return;
    seen.add(str);
    candidates.push({ text: str, source });
  }
  if (qa >= 0) {
    for (let i = Math.max(6, qa - 6); i < Math.min(end, qa + 2); i++) {
      const part = raw[i];
      if (typeof part === 'string') add(part, `adjacent:${i}`);
      if (Array.isArray(part)) for (const value of textObjects(part, 0)) add(value, `structured:${i}`);
    }
  }
  for (let i = 6; i < end; i++) {
    if (!Array.isArray(raw[i])) continue;
    for (const value of textObjects(raw[i], 0)) add(value, `structured:${i}`);
  }
  return candidates;
}

// Google sometimes nests the *full* customer text in an unrecognized array
// shape. Search conservatively for a longer string with the same beginning.
// This must NEVER pick an arbitrary long string or translated wording.
function findMatchingLongerText(raw, excerpt, end) {
  if (!excerpt || !Array.isArray(raw)) return '';
  let best = '';
  let visited = 0;
  function scan(node, depth) {
    if (++visited > 1600 || depth > 10) return;
    if (typeof node === 'string') {
      const candidate = goodText(node);
      if (candidate.length > best.length && sameBeginning(excerpt, candidate)) best = candidate;
      return;
    }
    if (Array.isArray(node)) for (const part of node) scan(part, depth + 1);
  }
  for (let i = 6; i < end && visited <= 1600; i++) scan(raw[i], 0);
  return best;
}

/** Return best available ORIGINAL review body, preferring verified full text. */
export function extractRawCommentText(raw) {
  if (!Array.isArray(raw)) return '';
  const end = googleIndex(raw);
  let qa = -1;
  for (let i = 6; i < end; i++) {
    if (typeof getPath(raw[i], [0, 0, 0]) === 'string') qa = i;
  }

  const original = qa >= 0 ? goodText(raw[qa - 3]) : '';
  const secondary = qa >= 0 ? goodText(raw[qa - 2]) : '';
  const candidates = collectRawTextCandidates(raw, qa, end);

  if (original) {
    // Original slot outranks a translation, except when another field has a
    // clearly matching longer *original* (e.g. full four-paragraph review).
    const matching = candidates
      .filter(c => sameBeginning(original, c.text))
      .sort((a, b) => b.text.length - a.text.length);
    const nested = findMatchingLongerText(raw, original, end);
    if (nested && (!matching.length || nested.length > matching[0].text.length)) return nested;
    if (matching.length) return matching[0].text;
    // If original and secondary hold excerpt/full versions of SAME wording,
    // choose the complete one; translations won't have the same prefix.
    if (sameBeginning(original, secondary)) return secondary;
    return original;
  }

  if (secondary) {
    // There is no confidently identified original slot. Prefer the same-text
    // longer version, if present, otherwise preserve earlier fallback behavior.
    const matching = candidates
      .filter(c => sameBeginning(secondary, c.text))
      .sort((a, b) => b.text.length - a.text.length);
    const nested = findMatchingLongerText(raw, secondary, end);
    if (nested && (!matching.length || nested.length > matching[0].text.length)) return nested;
    if (matching.length) return matching[0].text;
    return secondary;
  }

  // Source data varies. Prefer structured review text, not arbitrary metadata.
  const structured = candidates.filter(c => c.source.startsWith('structured:'));
  if (structured.length) {
    return structured.sort((a, b) => b.text.length - a.text.length)[0].text;
  }
  if (qa < 0) {
    for (let i = 6; i < end; i++) {
      const c = goodText(raw[i]);
      if (c) return c;
    }
  }
  return '';
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
