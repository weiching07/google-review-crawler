'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const input = process.argv[2] || 'gosom-output/results.json';
const output = process.argv[3] || 'gosom-output/TXRH-songgao-300.json';

function readEntries(file) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    throw new Error(`Scraper did not write an output file: ${file}`);
  }

  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Gosom may emit JSONL: one business per line.
    parsed = raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSONL on line ${index + 1}: ${error.message}`);
      }
    });
  }

  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') return [parsed];
  throw new Error('Unknown scraper output format');
}

function get(obj, ...keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return '';
}

function microsToDate(value) {
  if (!value) return '';
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  const parsed = new Date(Math.floor(number / 1000));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function normalize(review, avg) {
  const author = String(get(review, 'Name', 'name', 'author')).trim();
  const content = String(get(review, 'text_original', 'Description', 'description', 'text_translated')).trim();
  const relativeDate = String(get(review, 'When', 'when')).trim();
  const isoDate = String(get(review, 'published_at', 'PublishedAt')).trim() ||
    microsToDate(get(review, 'posted_at_unix_micros', 'updated_at_unix_micros'));
  const rawId = String(get(review, 'review_id', 'ReviewID', 'reviewId', 'id')).trim();
  const ratingNumber = Number(get(review, 'Rating', 'rating', 'rating_float'));
  const rating = Number.isFinite(ratingNumber) && ratingNumber >= 1 && ratingNumber <= 5
    ? ratingNumber : null;
  const replyContent = String(get(review, 'reply_text_original', 'reply_text', 'ReplyText')).trim();
  const replyDate = microsToDate(get(review, 'reply_posted_at_unix_micros', 'reply_updated_at_unix_micros'));
  const fallbackId = crypto.createHash('sha256')
    .update(['TXRH', '松高', author, isoDate || relativeDate, String(rating), content].join('|'))
    .digest('hex').slice(0, 32);

  return {
    reviewId: rawId || `gosom-${fallbackId}`,
    author,
    content,
    rating,
    date: relativeDate || isoDate,
    publishedAt: isoDate,
    hasReply: Boolean(replyContent),
    replyContent,
    replyDate,
    brand: 'TXRH',
    store: '松高',
    branch: '',
    storeRating: avg,
    averageRating: avg
  };
}

function convert(entries) {
  const candidate = entries.filter(entry => {
    const label = String(get(entry, 'title', 'Title'));
    return /松高/.test(label) && /(德州|Texas|Roadhouse)/i.test(label);
  });

  if (!candidate.length) {
    console.log('Scraped listing titles:', entries.map(x => x?.title || x?.Title || '(no title)'));
    throw new Error('Could not verify the listing is TXRH Songgao; old JSON was not touched');
  }

  const listing = candidate[0];
  const extended = get(listing, 'user_reviews_extended', 'UserReviewsExtended');
  const inline = get(listing, 'user_reviews', 'UserReviews');
  const reviews = Array.isArray(extended) && extended.length
    ? extended : (Array.isArray(inline) ? inline : []);
  if (reviews.length === 0) throw new Error('Listing found but no reviews were retrieved');

  const average = get(listing, 'review_rating', 'ReviewRating');
  const byId = new Map();
  for (const review of reviews) {
    if (!review || typeof review !== 'object') continue;
    const normalized = normalize(review, average);
    if (!normalized.author && !normalized.content) continue;
    byId.set(normalized.reviewId, normalized);
  }

  const rows = [...byId.values()].sort((a, b) => {
    const ta = Date.parse(a.publishedAt || '') || 0;
    const tb = Date.parse(b.publishedAt || '') || 0;
    return tb - ta;
  }).slice(0, 300);
  if (!rows.length) throw new Error('Review data was present but nothing valid could be normalized');
  return { title: listing.title || listing.Title, rows, totalOnGoogle: listing.review_count };
}

function main() {
  const result = convert(readEntries(input));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result.rows, null, 2) + '\n', 'utf8');
  console.log(`✅ Verified listing: ${result.title}`);
  console.log(`✅ Reviews normalized: ${result.rows.length} / up to 300`);
  console.log(`📊 Reviews with text: ${result.rows.filter(r => r.content).length}`);
  console.log(`💬 Reviews with owner replies: ${result.rows.filter(r => r.hasReply).length}`);
  console.log(`🗓️ Reviews with absolute dates: ${result.rows.filter(r => r.publishedAt).length}`);
  console.log(`📁 Output: ${output}`);
  if (!result.rows.some(r => r.content)) {
    throw new Error('No review text was returned. Check Google access limits before integration.');
  }
}

if (require.main === module) main();
module.exports = { readEntries, convert, normalize };
