/**
 * BOQ 免登入評論測試 — 不動原本 scraper.js / sync-static.js / public
 * Node.js >= 22.12; run: node .boq-test/run.mjs
 * Install package inside .boq-test:
 * npm install --prefix .boq-test --no-save google-maps-review-scraper@3.1.0
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scraper } from 'google-maps-review-scraper';

const root = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(root, 'results');
const url = process.env.SCRAPE_MAPS_URL || 'https://www.google.com/maps/place//data=!4m4!3m3!1s0x3442abba4f6df625:0xa61c4b36aa0bf63e!9m1!1b1?hl=zh-TW&gl=TW';
const pages = Math.max(1, Math.min(30, Number.parseInt(process.env.SCRAPE_PAGES || '30', 10) || 30));
const limit = Math.max(1, Math.min(300, Number.parseInt(process.env.SCRAPE_MAX_REVIEWS || '300', 10) || 300));
const report = {
  startedAt: new Date().toISOString(),
  backend: 'google-maps-review-scraper@3.1.0 / GetLocalBoqProxy',
  store: 'TXRH / 松高', sort: 'newest', pages, target: limit,
  status: 'running', fetched: 0, unique: 0, details: [],
};

function asText(value) { return value == null ? '' : String(value); }
function asIso(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  const date = Number.isFinite(n) && /^\d+$/.test(String(value))
    ? new Date(n < 1e11 ? n * 1000 : n)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? asText(value) : date.toISOString();
}
function idOf(row) {
  return asText(row?.review_id) || 'generated_' + crypto.createHash('sha256')
    .update(JSON.stringify([row?.author?.name, row?.time?.published, row?.review?.text, row?.review?.rating]))
    .digest('hex').slice(0, 32);
}
function convert(row) {
  const publishedAt = asIso(row?.time?.published);
  const replyDate = asIso(row?.response?.time?.published);
  const replyContent = asText(row?.response?.text);
  return {
    reviewId: idOf(row),
    author: asText(row?.author?.name),
    content: asText(row?.review?.text),
    rating: Number(row?.review?.rating) || 0,
    date: publishedAt.startsWith('20') ? publishedAt.slice(0, 10) : publishedAt,
    publishedAt,
    hasReply: Boolean(replyContent || replyDate),
    replyContent, replyDate,
    brand: 'TXRH', store: '松高', branch: '',
    storeRating: null, averageRating: null,
  };
}

await fs.mkdir(outputDir, { recursive: true });
let result = [];
try {
  const options = { url, sort_type: 'newest', pages, clean: true };
  if (process.env.SCRAPE_PROXY_URL) {
    options.proxy = { proxyUrl: process.env.SCRAPE_PROXY_URL, ignoreTls: false };
  }
  console.log(`BOQ test: ${report.store} | newest | ${pages} pages | max ${limit} reviews`);
  console.log('Google login: not used; Google API key: not used');
  const raw = await scraper(options);
  if (!Array.isArray(raw)) throw new Error('上游回傳的不是評論陣列');
  report.fetched = raw.length;
  const seen = new Set();
  result = raw.filter((row) => {
    const key = idOf(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
  report.unique = result.length;
  report.status = result.length > 10 ? 'extended-reviews-found' : 'preview-only-or-empty';
  report.details.push(result.length > 10
    ? `成功取得超過 10 筆評論，已載入初始預覽以外的資料（${result.length} 筆）`
    : `僅 ${result.length} 筆，尚未突破預覽筆數；不可視為 300 筆成功`);
  await fs.writeFile(path.join(outputDir, 'boq-raw.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(outputDir, 'comments-test.json'), JSON.stringify(result.map(convert), null, 2) + '\n');
  console.log(`RESULT: ${report.unique} unique reviews; status=${report.status}`);
} catch (error) {
  report.status = 'failed';
  report.details.push(asText(error?.message || error));
  console.error('BOQ test failed:', error?.message || error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await fs.writeFile(path.join(outputDir, 'status.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Output folder: .boq-test/results (NO change to public files)');
}
