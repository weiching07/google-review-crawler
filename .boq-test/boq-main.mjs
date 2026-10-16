/**
 * GitHub Actions 正式 BOQ 評論後端。
 * 與先前 300 筆測試使用相同 google-maps-review-scraper@3.1.0。
 * 由根目錄 scraper.js 動態匯入並傳入原本 stores.js 清單。
 * 不需要 Google 登入；不修改 public JSON 或通知程式。
 */
import { scraper } from 'google-maps-review-scraper';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const requireFromRoot = createRequire(new URL('../scraper.js', import.meta.url));
const resultsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results');
const KNOWN_IDS = {
  'TXRH|松高': '0x3442abba4f6df625:0xa61c4b36aa0bf63e',
};
const PLACE_FIELDS = [
  'mapsReviewUrl', 'mapsUrl', 'googleMapsUrl', 'placeUrl', 'fallbackUrl', 'url',
];

const text = (v) => v == null ? '' : String(v).trim();
const shortName = (v) => text(v).toLowerCase().replace(/[\s\u3000\-＿_（）()【】\[\]·・]/g, '');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function setting(name, fallback, max) {
  const raw = text(process.env[name]);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0 || n > max) {
    throw new Error(`${name} 應為 0～${max} 的整數`);
  }
  return n;
}

function exactFeatureId(source) {
  let s = text(source);
  if (!s) return '';
  try { s = decodeURIComponent(s); } catch { /* 保留原文字 */ }
  return s.match(/0x[\da-f]+:0x[\da-f]+/i)?.[0] || '';
}

function directReviewURL(featureId) {
  return `https://www.google.com/maps/place//data=!4m4!3m3!1s${featureId}!9m1!1b1?hl=zh-TW&gl=TW`;
}

function storeKey(store) { return `${text(store.brand)}|${text(store.store)}`; }

function mapsSearchURL(store) {
  const keyword = text(store.keyword) || `${text(store.brand)} ${text(store.store)} 台灣`;
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(keyword) + '&hl=zh-TW&gl=TW';
}

async function readOverrides() {
  const name = new URL('./store-urls.json', import.meta.url);
  try {
    const data = JSON.parse(await fs.readFile(name, 'utf8'));
    if (!data || Array.isArray(data) || typeof data !== 'object') {
      throw new Error('store-urls.json 必須是 JSON 物件');
    }
    return data;
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw new Error(`店家網址設定無效：${e.message}`);
  }
}

// 只有 stores.js 尚未指定 Google Maps feature ID 的店家才啟動公開 Maps
// 搜尋頁來「辨識商家」；評論本身仍由 BOQ 取得，不經 Google 登入。
async function discoverFeatureId(store, browserState) {
  if (!browserState.browser) {
    const puppeteer = requireFromRoot('puppeteer-extra');
    const cloud = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
    const browser = await puppeteer.launch({
      headless: true,
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : (!cloud && process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--lang=zh-TW'],
    });
    browserState.browser = browser;
  }

  const page = await browserState.browser.newPage();
  try {
    page.setDefaultNavigationTimeout(60000);
    const url = PLACE_FIELDS.map((field) => text(store[field]))
      .find((candidate) => /^https:\/\/[^/]*google\.[^/]+\/maps\//i.test(candidate)) || mapsSearchURL(store);
    console.log(`🧭 解析 ${storeKey(store)} 的 Google Maps 商家 ID（只搜尋，不登入）`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => {
      try { return /0x[\da-f]+:0x[\da-f]+/i.test(decodeURIComponent(location.href)); }
      catch { return false; }
    }, { timeout: 15000, polling: 400 }).catch(() => {});
    await wait(1100);

    const state = await page.evaluate(() => {
      const normalized = document.querySelector('h1.DUwDvf, h1')?.textContent?.trim() || '';
      const u = [location.href,
        document.querySelector('link[rel="canonical"]')?.href,
        document.querySelector('meta[property="og:url"]')?.content,
      ].filter(Boolean);
      // Google Maps 的店名不一定包含商場名。讀取商家資訊區的地址供交叉驗證。
      const addressNodes = [
        ...document.querySelectorAll('[data-item-id="address"], button[aria-label^="地址"], button[aria-label^="Address"]'),
      ];
      const address = addressNodes.map(el => [el.getAttribute('aria-label'), el.textContent].filter(Boolean).join(' ')).join(' ');
      return { heading: normalized, address, urls: u, href: location.href };
    });
    const id = state.urls.map(exactFeatureId).find(Boolean) || '';
    if (!id) {
      throw new Error(`尚未取得店家 Maps ID（目前網頁：${state.href.slice(0, 180)}）；請在 .boq-test/store-urls.json 補正確商家深連結`);
    }
    // 搜尋結果可能是一列多間店，沒有商家標題時絕不能隨便認第一間。
    if (!state.heading) {
      throw new Error('無法確認商家名稱，為避免抓錯店，請在 store-urls.json 設定該分店的 Maps 連結');
    }
    const expected = shortName(store.store);
    const heading = shortName(state.heading);
    if (expected && !heading.includes(expected)) {
      // LillA 位於 DREAM PLAZA，但 Maps 商家名稱只有「LillA」。
      // 只針對這家例外，不取消其他 29 家的分店名稱防呆。
      const isLillaDreamPlaza = storeKey(store) === 'LILLA|DREAM PLAZA';
      const brandMatches = heading === 'lilla';
      const normalizedAddress = shortName(state.address).replace(/臺/g, '台');
      const addressKnown = Boolean(normalizedAddress);
      const addressMatches = /松高路11號/.test(normalizedAddress) || /dreamplaza/.test(normalizedAddress);
      if (!isLillaDreamPlaza || !brandMatches || (addressKnown && !addressMatches)) {
        throw new Error(`搜尋結果商家不吻合：期待「${store.store}」，實際「${state.heading}」，地址「${state.address || '未取得'}」；請設定正確 Maps 連結`);
      }
      if (!addressKnown) {
        console.warn('⚠️ LillA 的 Google 名稱沒有 DREAM PLAZA，商家地址也未能讀取；依既有搜尋詞與精確品牌名稱辨識，建議改用指定 Maps 商家 ID');
      } else {
        console.log(`✅ LillA 品牌與 DREAM PLAZA 地址驗證成功：${state.address}`);
      }
    }
    console.log(`✅ 已核對店家：${state.heading} / ${id}`);
    return id;
  } finally {
    await page.close().catch(() => {});
  }
}

async function resolveURL(store, overrides, browserState) {
  const key = storeKey(store);
  // 指定 override 優先，再讀既有 stores.js 的商家網址，最後使用已驗證 ID。
  const candidates = [overrides[key], ...PLACE_FIELDS.map((name) => store[name]), KNOWN_IDS[key]];
  for (const candidate of candidates) {
    const id = exactFeatureId(candidate);
    if (id) return directReviewURL(id);
  }
  return directReviewURL(await discoverFeatureId(store, browserState));
}

function iso(value) {
  if (value == null || value === '') return '';
  const raw = text(value);
  const numeric = /^\d{10,13}$/.test(raw) ? Number(raw) : NaN;
  const date = Number.isFinite(numeric)
    ? new Date(raw.length <= 10 ? numeric * 1000 : numeric)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function getReviewId(row, store) {
  const sourceId = text(row?.review_id);
  if (sourceId) return sourceId;
  // 僅在上游沒有 ID 時作穩定退路；避免重覆插入。
  return 'boq_' + createHash('sha256').update(JSON.stringify([
    storeKey(store), row?.author?.id || row?.author?.name,
    row?.time?.published, row?.review?.rating, row?.review?.text,
  ])).digest('hex').slice(0, 32);
}

function normalizeReview(row, store) {
  if (!row || typeof row !== 'object') return null;
  const rating = Number(row.review?.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
  const publishedAt = iso(row.time?.published);
  const lastEditedAt = iso(row.time?.last_edited);
  const replyContent = text(row.response?.text);
  const replyDate = iso(row.response?.time?.published);
  const average = Number(store.storeRating ?? store.averageRating ?? store.rating);
  const storeRating = Number.isFinite(average) && average >= 1 && average <= 5 ? average : null;
  return {
    reviewId: getReviewId(row, store),
    author: text(row.author?.name),
    content: text(row.review?.text),
    rating,
    date: publishedAt ? publishedAt.slice(0, 10) : '',
    publishedAt,
    isEdited: Boolean(lastEditedAt && publishedAt && lastEditedAt !== publishedAt),
    editedText: lastEditedAt && publishedAt && lastEditedAt !== publishedAt ? '已編輯' : '',
    hasReply: Boolean(replyContent || replyDate),
    replyContent,
    replyDate,
    brand: text(store.brand),
    store: text(store.store),
    branch: text(store.branch),
    storeRating,
    averageRating: storeRating,
  };
}

async function writeStatus(status) {
  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(path.join(resultsDir, 'status.json'), JSON.stringify(status, null, 2) + '\n');
}

// BOQ 回傳格式不含店家總平均星數，因此沿用既有群組 JSON 的已知星數，
// 避免因為換後端，把目前網站上的平均星數洗成 null。
async function readPreviousRatings() {
  const ratings = new Map();
  const file = path.resolve(process.cwd(), 'public', 'comments.json');
  try {
    const rows = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(rows)) return ratings;
    for (const row of rows) {
      const rating = Number(row?.storeRating ?? row?.averageRating);
      if (rating >= 1 && rating <= 5 && Number.isFinite(rating)) {
        ratings.set(`${text(row.brand)}|${text(row.store)}`, rating);
      }
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('⚠️ 舊平均星數資料無法讀取，將保留空值：', e.message);
  }
  return ratings;
}

export async function scrapeBOQ(stores, deps = {}) {
  const backend = deps.scraper || scraper;
  if (!Array.isArray(stores)) throw new Error('stores.js 必須匯出店家陣列');
  const targetBrand = text(process.env.SCRAPE_TARGET_BRAND || 'all');
  const targetStore = text(process.env.SCRAPE_TARGET_STORE || 'all');
  const selected = stores.filter(s =>
    (targetBrand === 'all' || text(s.brand) === targetBrand) &&
    (targetStore === 'all' || text(s.store) === targetStore));
  if (!selected.length) throw new Error(`沒有符合條件的店家：${targetBrand}/${targetStore}`);
  const pages = Math.max(1, setting('BOQ_PAGES', 30, 1000));
  const maxReviews = Math.max(1, setting('BOQ_MAX_REVIEWS', 300, 10000));
  const minReviews = setting('BOQ_MIN_REVIEWS', 10, maxReviews);
  const delay = setting('BOQ_STORE_DELAY_MS', 3000, 120000);
  const overrides = await readOverrides();
  const oldRatings = await readPreviousRatings();
  const browserState = { browser: null };
  const report = {
    startedAt: new Date().toISOString(), engine: 'boq',
    version: 'google-maps-review-scraper@3.1.0',
    selected: selected.map(storeKey), pages, maxReviews, minReviews,
    success: false, stores: [],
  };
  const all = [];
  await writeStatus(report);
  try {
    for (const [index, store] of selected.entries()) {
      const name = storeKey(store);
      console.log(`\n➡️ BOQ ${index + 1}/${selected.length}：${name}`);
      const entry = { name, status: 'running', fetched: 0, unique: 0, normalized: 0 };
      report.stores.push(entry);
      await writeStatus(report);
      try {
        const url = await resolveURL(store, overrides, browserState);
        const options = { url, sort_type: 'newest', pages, clean: true };
        const proxyUrl = text(process.env.SCRAPE_PROXY_URL);
        if (proxyUrl) options.proxy = { proxyUrl, ignoreTls: false };
        const rows = await backend(options);
        if (!Array.isArray(rows)) throw new Error('Google 評論接口沒有回傳陣列');
        entry.fetched = rows.length;
        const seen = new Set();
        const reviews = [];
        for (const row of rows) {
          const originalRating = Number(store.storeRating ?? store.averageRating ?? store.rating);
          const stableRating = Number.isFinite(originalRating) && originalRating >= 1 && originalRating <= 5
            ? originalRating : oldRatings.get(name);
          const normal = normalizeReview(row, { ...store, storeRating: stableRating });
          if (!normal) continue;
          if (seen.has(normal.reviewId)) continue;
          seen.add(normal.reviewId);
          reviews.push(normal);
          if (reviews.length >= maxReviews) break;
        }
        entry.unique = seen.size;
        entry.normalized = reviews.length;
        // 不能讓預覽的 3～5 筆或零筆當成一次完整同步。
        if (reviews.length < minReviews) {
          throw new Error(`只抓到 ${reviews.length} 筆（門檻 ${minReviews}），拒絕以不完整資料更新正式 JSON`);
        }
        entry.status = 'ok';
        entry.withText = reviews.filter((r) => r.content).length;
        entry.withReply = reviews.filter((r) => r.hasReply).length;
        entry.withDate = reviews.filter((r) => r.publishedAt).length;
        if (entry.withDate === 0) {
          throw new Error('所有評論日期都缺失，拒絕覆蓋正式 JSON；請先檢查上游欄位');
        }
        console.log(`✅ ${name}：${reviews.length} 筆，文字 ${entry.withText}，日期 ${entry.withDate}，回覆 ${entry.withReply}`);
        all.push(...reviews);
        await writeStatus(report);
        if (delay && index < selected.length - 1) await wait(delay);
      } catch (error) {
        entry.status = 'failed';
        entry.error = text(error?.message || error);
        console.error(`❌ ${name}：${entry.error}`);
        throw error;
      }
    }
    report.success = true;
    report.total = all.length;
    console.log(`\n🎉 BOQ 成功完成 ${selected.length} 間店、${all.length} 筆；返回原本 sync-static.js`);
    return all;
  } catch (error) {
    report.error = text(error?.message || error);
    throw error; // 不回傳任何部分成果，避免正式資料被覆蓋或錯誤通知。
  } finally {
    if (browserState.browser) await browserState.browser.close().catch(() => {});
    report.finishedAt = new Date().toISOString();
    await writeStatus(report);
  }
}
