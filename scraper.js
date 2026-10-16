'use strict';

// Google Maps 評論爬蟲（GitHub Actions / Windows）
// 本機先確認 Google 登入；未登入時進入登入流程，成功後才爬評論。
// GitHub Actions 則使用 workflow 的 GOOGLE_EMAIL / GOOGLE_PASSWORD Secrets。
// 然後開啟 Maps 公開評論深連結、切換「最新」、捲動收集評論。
// 登入要求額外驗證或 Google 限制時明確失敗，不會寫出部分結果。

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const STORES = require('./stores');

puppeteer.use(StealthPlugin());

// ======================================================
// 共用設定
// ======================================================

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pause = (min, max) =>
  sleep(Math.floor(Math.random() * (max - min + 1)) + min);

const clean = value =>
  String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

function isCloud() {
  return Boolean(
    process.env.GITHUB_ACTIONS ||
    process.env.CI ||
    process.env.NODE_ENV === 'production'
  );
}

function getMaxRounds() {
  const value = Number(process.env.SCRAPE_MAX_ROUNDS || 5);
  if (!Number.isFinite(value) || value <= 0) return 5;
  if (value >= 999) return 15000;
  if (value >= 100) return 10000;
  return Math.floor(value);
}

function executablePath(cloud) {
  return (
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    process.env.CHROME_PATH ||
    process.env.GOOGLE_CHROME_BIN ||
    (cloud ? undefined : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  );
}

function googleMapsURL(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      /(^|\.)google\.[a-z.]+$/i.test(u.hostname) &&
      u.pathname.startsWith('/maps/')
    );
  } catch {
    return false;
  }
}

function setLanguage(url) {
  try {
    const u = new URL(url);
    u.searchParams.set('hl', 'zh-TW');
    u.searchParams.set('gl', 'TW');
    return u.toString();
  } catch {
    return url;
  }
}

// ======================================================
// GitHub Actions 網路出口與抓取頻率設定
// 未設定 SCRAPE_PROXY_URL 時使用原來的 GitHub 出口 IP。
// 代理必須由使用者自行提供；不會暗中使用公開代理池。
// ======================================================

function readProxyConfig() {
  const raw = (process.env.SCRAPE_PROXY_URL || '').trim();
  if (!raw) {
    if (process.env.SCRAPE_REQUIRE_PROXY === '1') {
      throw new Error('要求使用代理，但缺少 SCRAPE_PROXY_URL；已停止，避免使用原始出口 IP');
    }
    return null;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('SCRAPE_PROXY_URL 不是有效 URL（不顯示代理憑證）');
  }

  const protocol = parsed.protocol.toLowerCase();
  if (!['http:', 'https:', 'socks5:'].includes(protocol)) {
    throw new Error('代理協定僅支援 http、https 或 socks5');
  }
  if (!parsed.hostname || !parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('代理格式必須為 scheme://host:port，或 scheme://user:pass@host:port');
  }
  const username = parsed.username ? decodeURIComponent(parsed.username) : '';
  const password = parsed.password ? decodeURIComponent(parsed.password) : '';
  if (protocol === 'socks5:' && (username || password)) {
    throw new Error('此版本 Chrome SOCKS5 不支援帳密代理，請使用 HTTP(S) 代理');
  }

  const host = parsed.hostname.includes(':') && !parsed.hostname.startsWith('[')
    ? `[${parsed.hostname}]` : parsed.hostname;
  return {
    server: `${protocol}//${host}:${parsed.port}`,
    hostname: parsed.hostname,
    credentials: (username || password) ? { username, password } : null
  };
}

async function applyProxyAuth(page, proxy) {
  if (proxy?.credentials) {
    await page.authenticate(proxy.credentials);
  }
}

// 從瀏覽器本身確認代理能對外連線（不是只看 Chrome 啟動參數）。
// 查詢服務沒有回應時，不會假裝代理已生效。
async function verifyProxyEgress(browser, proxy) {
  if (!proxy) return;
  const page = await browser.newPage();
  try {
    await applyProxyAuth(page, proxy);
    const response = await page.goto('https://api.ipify.org?format=json', {
      waitUntil: 'domcontentloaded', timeout: 25000
    });
    if (!response || !response.ok()) {
      throw new Error('IP 檢查服務沒有正常回應');
    }
    const value = await page.evaluate(() => document.body?.innerText || '');
    const ip = JSON.parse(value).ip;
    if (typeof ip !== 'string' || !/^[0-9a-f:.]+$/i.test(ip)) {
      throw new Error('IP 檢查回應不正確');
    }
    console.log('🌍 Chrome 實際對外 IP:', ip);
  } catch {
    throw new Error('代理連線驗證失敗，停止爬蟲，避免默默改用原始 IP');
  } finally {
    await page.close().catch(() => {});
  }
}

function readDelay(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 120000) {
    throw new Error(`${name} 必須介於 0 到 120000 毫秒`);
  }
  return Math.floor(n);
}

function isGoogleAccessBlock(error) {
  return /人機驗證|流量驗證|異常流量|流量有異常|IP\/流量|此網路 IP|unusual traffic|captcha|\/sorry\/|HTTP 429|Too Many Requests/i.test(
    String(error?.message || error)
  );
}

// ======================================================
// 商家網址與評論深連結
// ======================================================

function getStoreURL(store) {
  const fallback = String(store.fallbackUrl || '').trim();
  if (googleMapsURL(fallback)) return setLanguage(fallback);

  const keyword = store.keyword || `${store.brand} ${store.store}`;
  return (
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(keyword) +
    '&hl=zh-TW&gl=TW'
  );
}

function getReviewDeepLink(url) {
  let decoded = String(url || '');
  try { decoded = decodeURIComponent(decoded); } catch { /* 保留原字串 */ }

  const featureId = decoded.match(/0x[0-9a-f]+:0x[0-9a-f]+/i)?.[0];
  if (!featureId) return '';

  return setLanguage(
    `https://www.google.com/maps/place//data=!4m4!3m3!1s${featureId}!9m1!1b1`
  );
}

// ======================================================
// 已從實際運作紀錄驗證的商家 Maps feature ID
// 只使用確定的資料，不猜測其他分店 ID。
// ======================================================
const KNOWN_FEATURE_IDS = {
  'TXRH|松高': '0x3442abba4f6df625:0xa61c4b36aa0bf63e'
};

// ======================================================
// Google 登入守門：本機/雲端一律先確定已登入，才能爬取
//
// 本機：優先使用 chrome-google-profile 裡有效的登入狀態。
//       沒有狀態時，若有 GOOGLE_EMAIL/PASSWORD 環境變數，
//       就嘗試正常帳密登入；否則開啟 Google 登入頁，
//       等使用者在 Chrome 完成登入後立即自動繼續。
//       不會跳過登入直接開始爬評論。
// 雲端：使用 workflow 傳入的 Secrets，驗證失敗就停止。
// 不記錄密碼、不將 Cookies 上傳至 GitHub、不跳過 Google 安全驗證。
// ======================================================

const ACCOUNT_URL = 'https://myaccount.google.com/?hl=zh-TW';
const LOGIN_URL =
  'https://accounts.google.com/ServiceLogin?hl=zh-TW&continue=' +
  encodeURIComponent(ACCOUNT_URL);

async function accountStatus(page) {
  return page.evaluate(() => {
    const text = String(document.body?.innerText || '')
      .replace(/\s+/g, ' ').slice(0, 1200);
    const hostname = location.hostname;
    const challenge = hostname === 'accounts.google.com' &&
      /驗證是您本人|確認是您本人|兩步驟驗證|兩步驗證|安全金鑰|驗證碼|請查看您的手機|選擇驗證方式|Verify it.s you|2-Step Verification|Use your phone|security key|enter the code|this browser or app may not be secure/i.test(text);
    const blocked = /\/sorry(?:\/|$)/i.test(location.pathname) ||
      /流量有異常|異常流量|unusual traffic|captcha/i.test(text);
    return { hostname, challenge, blocked };
  });
}

async function verifyGoogleSession(page) {
  // 使用需要 Google 帳號登入的頁面，而不是只檢查 Cookies 是否存在。
  await page.goto(ACCOUNT_URL, {
    waitUntil: 'domcontentloaded', timeout: 60000
  });
  const status = await accountStatus(page);
  if (status.blocked) {
    throw new Error('Google 顯示流量驗證頁，登入無法繼續');
  }
  return status.hostname === 'myaccount.google.com';
}

async function clickAccountNext(page, selector) {
  const button = await page.$(selector);
  if (button) await button.click();
  else await page.keyboard.press('Enter');
}

async function tryAutomaticGoogleLogin(page) {
  const email = (process.env.GOOGLE_EMAIL || '').trim();
  const password = process.env.GOOGLE_PASSWORD || '';
  if (!email || !password) return false;
  if (!email.includes('@')) {
    throw new Error('GOOGLE_EMAIL 格式不正確');
  }

  console.log('🔐 正在嘗試以環境變數執行 Google 帳密登入（不顯示帳密）');
  await page.goto(LOGIN_URL, {
    waitUntil: 'domcontentloaded', timeout: 60000
  });

  let emailInput = await page.waitForSelector(
    '#identifierId,input[type="email"]',
    { visible: true, timeout: 15000 }
  ).catch(() => null);

  if (!emailInput) {
    console.log('⚠️ Google 沒有顯示一般帳號輸入框');
    return false;
  }

  await emailInput.type(email, { delay: 35 });
  await clickAccountNext(page, '#identifierNext button,#identifierNext');

  const passwordInput = await page.waitForSelector(
    'input[type="password"]',
    { visible: true, timeout: 20000 }
  ).catch(() => null);

  if (!passwordInput) {
    console.log('⚠️ Google 沒有顯示一般密碼輸入框，可能要求額外驗證');
    return false;
  }

  await passwordInput.type(password, { delay: 35 });
  await clickAccountNext(page, '#passwordNext button,#passwordNext');

  try {
    await page.waitForFunction(
      () => location.hostname === 'myaccount.google.com' ||
        /\/challenge(?:\/|$)/i.test(location.pathname),
      { timeout: 30000, polling: 400 }
    );
  } catch {
    // 若 Google 要求額外驗證，讓呼叫端決定是否可人工完成。
  }

  const status = await accountStatus(page);
  if (status.blocked) {
    throw new Error('Google 登入遭到人機／流量驗證');
  }
  if (status.hostname === 'myaccount.google.com') {
    return verifyGoogleSession(page);
  }
  return false;
}

async function waitForInteractiveGoogleLogin(page) {
  console.log('🔐 目前還沒有有效的 Google 登入工作階段。');
  console.log('➡️ 請在「剛開啟的 Chrome」完成 Google 登入與必要驗證。');
  console.log('✅ 登入一成功就會自動開始爬評論，不用回 PowerShell 按 Enter。');
  console.log('ℹ️ GitHub Secrets 不會傳到本機；本機成功登入後由 Chrome 設定檔保存工作階段。');

  // 已停在挑戰頁就不要重新導向，避免破壞使用者正在進行的驗證。
  const status = await accountStatus(page);
  if (status.hostname !== 'accounts.google.com') {
    await page.goto(LOGIN_URL, {
      waitUntil: 'domcontentloaded', timeout: 60000
    });
  }

  try {
    // 這不是固定延遲，而是等待「Google 已完成登入」的實際條件。
    // 若立刻登入成功，立刻繼續；逾時或關閉 Chrome 則不爬取。
    await page.waitForFunction(
      () => location.hostname === 'myaccount.google.com',
      { timeout: 10 * 60 * 1000, polling: 500 }
    );
  } catch {
    throw new Error(
      '本機尚未完成 Google 登入（可能關閉了視窗或 Google 拒絕登入），已停止爬評論'
    );
  }
  return verifyGoogleSession(page);
}

async function ensureGoogleSignedIn(browser, cloud, proxy) {
  const loginPage = await browser.newPage();
  try {
    await applyProxyAuth(loginPage, proxy);
    console.log('🔎 開始確認 Google 登入狀態（未登入不會爬評論）');

    if (await verifyGoogleSession(loginPage)) {
      console.log('✅ 已有有效 Google 工作階段，直接沿用');
      return;
    }

    const hasCredentials = Boolean(
      process.env.GOOGLE_EMAIL && process.env.GOOGLE_PASSWORD
    );

    if (cloud && !hasCredentials) {
      throw new Error(
        'GitHub Actions 未收到 GOOGLE_EMAIL / GOOGLE_PASSWORD，請檢查 workflow 的 env'
      );
    }

    if (hasCredentials) {
      const loggedIn = await tryAutomaticGoogleLogin(loginPage);
      if (loggedIn) {
        console.log('✅ 已完成 Google 帳密登入並確認工作階段');
        return;
      }
      if (cloud) {
        throw new Error(
          'Google 未完成自動登入（可能要求二階段驗證或拒絕自動化瀏覽器），停止爬評論'
        );
      }
    }

    // 本機沒提供帳密，或 Google 要求人工驗證時，
    // 停在真實登入畫面，直到確認成功才准執行爬蟲。
    if (!(await waitForInteractiveGoogleLogin(loginPage))) {
      throw new Error('Google 登入狀態驗證未通過，停止爬評論');
    }
    console.log('✅ 已確認本機 Google 登入成功，準備開始爬評論');
  } finally {
    await loginPage.close().catch(() => {});
  }
}

// ======================================================
// 頁面診斷：正常頁面、登入、驗證
// ======================================================

async function diagnose(page, stage) {
  const state = await page.evaluate(() => {
    const body = String(document.body?.innerText || '')
      .replace(/\s+/g, ' ').trim();

    const dialogs = [...document.querySelectorAll(
      '[role="dialog"],[aria-modal="true"]'
    )].map(el => String(el.innerText || '').replace(/\s+/g, ' ').slice(0, 250));

    const labels = [...document.querySelectorAll(
      'button,[role="button"],[role="tab"],[role="menuitem"],[role="option"]'
    )]
      .filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map(el => (
        el.getAttribute('aria-label') || el.innerText || ''
      ).replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    return {
      url: location.href,
      title: document.title,
      blocked: /\/sorry(?:\/|$)/i.test(location.pathname) ||
        /異常情況|流量有異常|異常流量|unusual traffic|captcha|verify you are human|機器人驗證/i.test(body),
      signin: /accounts\.google\.com/i.test(location.hostname) ||
        dialogs.some(t => /登入|sign in|log in|帳戶/i.test(t)) ||
        /請先登入|登入後才能|sign in to continue|sign in to see/i.test(body),
      cards: document.querySelectorAll('[data-review-id]').length,
      reviewButtonLabels: labels.filter(x => /評論|排序|最新|reviews?|sort|newest/i.test(x)).slice(0, 15),
      preview: body.slice(0, 420)
    };
  });

  console.log(`🧪 ${stage}:`, JSON.stringify(state));
  return state;
}

function checkAccess(state) {
  if (state.blocked) throw new Error('Google 顯示 IP/流量驗證頁');
  if (state.signin) throw new Error('Google 要求登入才能操作評論');
}

// ======================================================
// 登入彈窗與完整評論頁判斷
// 重點：搜尋/總覽頁也會有幾十個 [data-review-id]。
// 「有評論 DOM」絕不等同「已打開完整評論清單」。
// ======================================================

async function detectLoginGate(page) {
  const state = await page.evaluate(() => {
    const url = location.href;
    const dialogs = [...document.querySelectorAll(
      '[role="dialog"],[aria-modal="true"]'
    )].filter(el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden';
    }).map(el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400));
    const body = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const blocked = /\/sorry(?:\/|$)/i.test(location.pathname) ||
      /流量有異常|異常流量|異常情況|unusual traffic|captcha|verify you are human/i.test(body);
    const loginDialog = dialogs.find(t =>
      /(?:請先登入|登入 Google|使用 Google 帳戶登入|登入以|Sign in to|Log in to|讀取及搜尋所有評論|read and search through every review)/i.test(t)
    ) || '';
    const login = /accounts\.google\.com/i.test(location.hostname) ||
      Boolean(loginDialog) ||
      /請先登入才能|登入後才能|sign in to continue/i.test(body);
    return { url, blocked, login, loginDialog, dialogs: dialogs.slice(0, 3), cards: document.querySelectorAll('[data-review-id]').length };
  });
  if (state.blocked) throw new Error('Google 要求人機驗證或已限制此網路 IP：' + state.url);
  if (state.login) throw new Error('Google 要求登入才能操作完整評論／最新排序（這不是按鈕選擇器錯誤）');
  return state;
}

async function inspectReviewView(page) {
  return page.evaluate(() => {
    const labels = [...document.querySelectorAll(
      'button,[role="button"],[role="tab"]'
    )].map(el => ({
      label: ((el.getAttribute('aria-label') || '') + ' ' + (el.innerText || '')).replace(/\s+/g, ' ').trim(),
      visible: (() => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      })()
    })).filter(x => x.visible);
    const cards = document.querySelectorAll('[data-review-id]').length;
    const sort = labels.some(x => /排序評論|排序方式|Sort reviews|Sort by/i.test(x.label) || /(?:^|\s)排序(?:\s|$)/.test(x.label));
    const back = labels.some(x => /^(?:返回|Back)$/.test(x.label));
    // Google Maps 的 /maps/search/ 總覽頁可能預載 34 筆評論。
    // 只有評論專用網址，或「返回」+排序控制項，才當完整評論頁。
    const url = location.href;
    const decoded = decodeURIComponent(url);
    const explicitReviewUrl = /!9m1!1b1/.test(decoded);
    return {
      url, cards, sort, back, explicitReviewUrl,
      ready: cards > 0 && sort && (explicitReviewUrl || back),
      labels: labels.filter(x => /評論|排序|最新|sort|reviews?|Back|返回/i.test(x.label)).slice(0, 15)
    };
  });
}

async function waitForCards(page, timeout = 15000) {
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('[data-review-id]').length > 0,
      { timeout, polling: 350 }
    );
    return true;
  } catch { return false; }
}

// ======================================================
// 可靠地定位與點擊 Google Maps 控制項
// 1. aria-label 比 innerText 更可靠（例如「排序評論」）
// 2. 不因 target.top > innerHeight 就當作「不存在」
// 3. 由 Puppeteer 元素句柄點擊，會自動捲到可點位置
// 4. 只有找不到真實元素時，才回報 clicked:false
// ======================================================

async function clickControl(page, type) {
  const info = await page.evaluate(type => {
    const pattern = type === 'sort'
      ? /^(?:排序評論|排序方式|排序|Sort reviews|Sort by|Sort)$/i
      : type === 'newest'
        ? /^(?:最新|最新評論|Newest|Most recent)$/i
        : /^(?:評論|Reviews|對「.+」的評論)$/i;
    const selectors = 'button,[role="button"],[role="tab"],[role="option"],[role="menuitem"],[role="menuitemradio"],li[data-index],span';
    const nodes = [...document.querySelectorAll(selectors)];
    let best = null;
    const normalize = str => String(str || '')
      .replace(/^[\uE000-\uF8FF\u2000-\u2BFF\s]+/gu, '')
      .replace(/\s+/g, ' ').trim();
    for (const node of nodes) {
      const target = node.closest(
        'button,[role="button"],[role="tab"],[role="option"],[role="menuitem"],[role="menuitemradio"],li[data-index]'
      ) || node;
      const style = getComputedStyle(target);
      const rect = target.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || !rect.width || !rect.height) continue;
      const candidates = [node.getAttribute('aria-label'), node.innerText, target.getAttribute('aria-label'), target.innerText]
        .map(normalize).filter(Boolean);
      const matched = candidates.find(x => pattern.test(x));
      if (!matched) continue;
      const score = (node.getAttribute('aria-label') && pattern.test(normalize(node.getAttribute('aria-label'))) ? 0 : 10) +
        (target.matches('button,[role="button"],[role="tab"],[role="option"],[role="menuitem"],[role="menuitemradio"]') ? 0 : 5) +
        (rect.top >= 0 && rect.top < innerHeight ? 0 : 3);
      if (!best || score < best.score) best = { target, label: matched, score };
    }
    if (!best) {
      return {
        found: false,
        candidates: nodes.map(n => n.getAttribute('aria-label') || '').filter(x =>
          /排序|最新|sort|newest/i.test(x)
        ).slice(0, 8)
      };
    }
    for (const el of document.querySelectorAll('[data-scraper-click-target]')) {
      el.removeAttribute('data-scraper-click-target');
    }
    best.target.setAttribute('data-scraper-click-target', type);
    best.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return { found: true, label: best.label, tag: best.target.tagName };
  }, type);
  if (!info.found) return { clicked: false, ...info };
  try {
    const selector = `[data-scraper-click-target="${type}"]`;
    const handle = await page.$(selector);
    if (!handle) return { clicked: false, reason: 'target-disappeared', ...info };
    await handle.click({ delay: 80 });
    return { clicked: true, label: info.label, tag: info.tag };
  } catch (error) {
    return { clicked: false, reason: error.message, ...info };
  }
}

// ======================================================
// 地點網址解析：Map 可能先停留 /maps/search/，再轉 /maps/place/
// 先等待 SPA 改網址；沒有 featureId 不假裝已有完整評論。
// ======================================================

async function resolveFeatureId(page) {
  let id = getReviewDeepLink(page.url());
  if (id) return id;
  try {
    await page.waitForFunction(
      () => /0x[0-9a-f]+:0x[0-9a-f]+/i.test(decodeURIComponent(location.href)),
      { timeout: 10000, polling: 400 }
    );
  } catch { /* 也可以透過評論分頁進入 */ }
  id = getReviewDeepLink(page.url());
  if (id) return id;
  const feature = await page.evaluate(() => {
    const urls = [
      document.querySelector('link[rel="canonical"]')?.href,
      document.querySelector('meta[property="og:url"]')?.content,
      ...[...document.querySelectorAll('a[href*="0x"]')].slice(0, 20).map(a => a.href)
    ].filter(Boolean);
    return urls.map(u => { try { return decodeURIComponent(u).match(/0x[0-9a-f]+:0x[0-9a-f]+/i)?.[0]; } catch { return null; } }).find(Boolean) || '';
  });
  return feature ? getReviewDeepLink(`https://www.google.com/maps/place/?data=!1s${feature}`) : '';
}

async function enterReviews(page, store) {
  const initial = getStoreURL(store);
  const knownId = KNOWN_FEATURE_IDS[`${store.brand}|${store.store}`];
  const direct = knownId
    ? getReviewDeepLink(`https://www.google.com/maps/place//data=!1s${knownId}`)
    : getReviewDeepLink(initial);
  console.log('🗺️ Maps 入口:', initial);
  await page.goto(direct || initial, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pause(2200, 3500);
  await detectLoginGate(page);

  if (!direct) {
    const resolved = await resolveFeatureId(page);
    if (resolved) {
      console.log('🔗 評論深連結:', resolved);
      await page.goto(resolved, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await pause(1700, 2800);
      await detectLoginGate(page);
    }
  } else console.log('🔗 評論深連結:', direct);

  let view = await inspectReviewView(page);
  console.log('🧭 評論檢視判斷:', JSON.stringify(view));
  if (view.ready) return true;

  // 尚在總覽頁才嘗試進入評論；失敗立刻檢查是不是登入彈窗。
  const clicked = await clickControl(page, 'reviews');
  console.log('🎯 進入評論:', clicked);
  if (!clicked.clicked) throw new Error('找不到真正可點的 Maps 評論分頁；' + JSON.stringify(clicked));
  await pause(1200, 2300);
  await detectLoginGate(page);
  await waitForCards(page, 12000);
  view = await inspectReviewView(page);
  console.log('🧭 進入後判斷:', JSON.stringify(view));
  if (!view.ready) throw new Error('仍停留商家總覽／預覽評論，沒有進入完整評論檢視畫面');
  return true;
}

// ======================================================
// 必須選「最新」並檢查有無登入彈窗。
// Google 若要求登入，不能靠修改文字比對或隱藏彈窗解決。
// ======================================================

async function sortByNewest(page) {
  await detectLoginGate(page);
  let newest = await clickControl(page, 'newest');
  if (!newest.clicked) {
    const sort = await clickControl(page, 'sort');
    console.log('🔃 點擊排序:', sort);
    if (!sort.clicked) throw new Error('已找到評論頁，但排序控制項無法操作：' + JSON.stringify(sort));
    // 開啟排序後等待「最新」選項或 Google 登入提示；不是只等固定 0.5 秒。
    await page.waitForFunction(() => {
      const text = (document.body?.innerText || '').replace(/\s+/g, ' ');
      const nodes = [...document.querySelectorAll(
        'button,[role="button"],[role="option"],[role="menuitem"],li,span'
      )];
      const hasNewest = nodes.some(n => /^(最新|最新評論|Newest|Most recent)$/i.test(
        (n.getAttribute('aria-label') || n.innerText || '').trim()
      ));
      const dialog = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')]
        .some(n => /登入|sign in|log in/i.test(n.innerText || ''));
      return hasNewest || dialog || /登入才能|請先登入|sign in to continue/i.test(text);
    }, { timeout: 6500, polling: 250 }).catch(() => {});
    await detectLoginGate(page);
    newest = await clickControl(page, 'newest');
  }
  console.log('🆕 最新排序:', newest);
  if (!newest.clicked) throw new Error('排序選單未提供可用「最新」選項：' + JSON.stringify(newest));
  await pause(1400, 2300);
  await detectLoginGate(page);
  if (!await waitForCards(page, 10000)) throw new Error('點擊最新之後沒有載入評論');
  console.log('✅ 「最新」已送出點擊，後續仍須以評論日期確認排序結果');
}

// ======================================================
// 店家平均星等
// ======================================================

async function getStoreRating(page) {
  return page.evaluate(() => {
    const nodes = document.querySelectorAll(
      '.F7nice,[aria-label*="顆星"],[aria-label*="stars"]'
    );
    for (const node of nodes) {
      const text = (
        `${node.innerText || ''} ${node.getAttribute('aria-label') || ''}`
      ).replace(/\s+/g, ' ').trim();
      const match = text.match(/(?:^|\s)([1-5]\.\d)(?=\s|$)/);
      if (match) return match[1];
    }
    // 評論深連結頁面有時沒有 F7nice，但會顯示「4.4 7,216 篇評論」。
    const body = (document.body?.innerText || '').replace(/\s+/g, ' ');
    const match = body.match(/(?:^|\s)([1-5]\.\d)\s+\d[\d,，]*\s*(?:篇|則)?\s*評論/);
    return match ? match[1] : '';
  });
}

// ======================================================
// 展開評論全文
// ======================================================

async function expandReviewText(page) {
  return page.evaluate(() => {
    let count = 0;
    const cards = [...document.querySelectorAll('[data-review-id]')];
    for (const card of cards) {
      const nodes = card.querySelectorAll('button,[role="button"],span');
      for (const node of nodes) {
        const label = (
          node.innerText || node.getAttribute('aria-label') || ''
        ).trim();
        if (!/^(更多|顯示更多|全文|More|Read more)$/i.test(label)) continue;

        const target = node.closest('button,[role="button"]') || node;
        const rect = target.getBoundingClientRect();
        if (rect.width && rect.height && rect.top < innerHeight && rect.bottom > 0) {
          target.click();
          count++;
        }
        if (count >= 40) return count;
      }
    }
    return count;
  });
}

// ======================================================
// 擷取評論
// 欄位相容：reviewId、author、content、rating、date、
// hasReply、replyContent、replyDate
// ======================================================

async function collectReviews(page, reviewMap) {
  const snapshot = await page.evaluate(() => {
    const norm = v => String(v ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const dateRe = /(?:剛剛|\d+\s*(?:分鐘|小時|天|週|星期|個月|年)前|just now|\d+\s*(?:minutes?|hours?|days?|weeks?|months?|years?) ago)/i;
    const replyRe = /店家回覆|店家回應|業主回覆|業主回應|商家回覆|商家回應|Response from the owner|Owner response/i;
    const ignoreRe = /^(讚|分享|更多|顯示更多|翻譯|查看原文|有幫助|Like|Share|More|Read more|Local Guide|在地嚮導)$/i;

    const cards = [...document.querySelectorAll('[data-review-id]')];
    const results = [];
    const seen = new Set();

    for (const card of cards) {
      const reviewId = norm(card.getAttribute('data-review-id'));
      if (!reviewId || seen.has(reviewId)) continue;
      seen.add(reviewId);

      function first(selectors) {
        for (const selector of selectors) {
          const node = card.querySelector(selector);
          if (node) {
            const text = norm(node.innerText || node.textContent || '');
            if (text) return text;
          }
        }
        return '';
      }

      const lines = String(card.innerText || '')
        .split('\n').map(norm).filter(Boolean);

      const author = first([
        '.d4r55', '.TSUbDb', '.Y5pjHe', '[data-reviewer-name]'
      ]) || lines.find(line =>
        line.length >= 2 && line.length < 65 &&
        !dateRe.test(line) && !ignoreRe.test(line)
      ) || '';

      const date = first([
        '.rsqaWe', '.xRkPPb', '.dehysf', '[class*="review-date"]'
      ]) || lines.find(line => dateRe.test(line) && line.length < 90) || '';

      let rating = null;
      for (const node of card.querySelectorAll('[aria-label],[title],[data-rating]')) {
        const raw = [
          node.getAttribute('aria-label'),
          node.getAttribute('title'),
          node.getAttribute('data-rating')
        ].filter(Boolean).join(' ');
        const match = raw.match(
          /(?:評分|星等|Rated)\s*[:：]?\s*([1-5])(?:\s*\/\s*5)?|(?:^|[^\d])([1-5])\s*(?:顆星|星|stars?)|^([1-5])$/i
        );
        if (match) {
          rating = Number(match[1] || match[2] || match[3]);
          break;
        }
      }

      const replyEl = card.querySelector(
        '.CDe7pd,[class*="owner-response"],[class*="owner-reply"]'
      );
      const replyLinesFromDom = replyEl
        ? String(replyEl.innerText || '').split('\n').map(norm).filter(Boolean)
        : [];
      const replyIndex = lines.findIndex(line => replyRe.test(line));
      const replyLines = replyLinesFromDom.length
        ? replyLinesFromDom
        : replyIndex >= 0 ? lines.slice(replyIndex) : [];

      let replyDate = '';
      const replyContent = replyLines.filter(line => {
        if (replyRe.test(line) && line.length < 55) return false;
        if (!replyDate && dateRe.test(line) && line.length < 65) {
          replyDate = line;
          return false;
        }
        return !ignoreRe.test(line) && !/^餐點[:：]|^服務[:：]|^氣氛[:：]/.test(line);
      }).join(' ').trim();

      let content = first([
        '.wiI7pd', '.MyEned', '.Jtu6Td', '[jsname="fbQN7e"]',
        '[class*="review-text"]'
      ]);

      if (!content) {
        const reviewLines = replyIndex >= 0 ? lines.slice(0, replyIndex) : lines;
        content = reviewLines.filter(line =>
          line !== author && line !== date && !ignoreRe.test(line) &&
          !/^[1-5]\s*(?:顆星|星|stars?)$/i.test(line) &&
          !/^餐點[:：]|^服務[:：]|^氣氛[:：]/.test(line)
        ).join(' ').trim();
      }

      if (replyRe.test(content)) content = content.split(replyRe)[0].trim();
      if (!author && !content) continue;

      results.push({
        reviewId, author, content, rating, date,
        hasReply: Boolean(replyContent), replyContent, replyDate
      });
    }

    return { cardsFound: cards.length, reviews: results };
  });

  for (const review of snapshot.reviews) {
    const previous = reviewMap.get(review.reviewId);
    if (!previous) {
      reviewMap.set(review.reviewId, review);
    } else {
      reviewMap.set(review.reviewId, {
        ...previous,
        ...review,
        author: review.author || previous.author || '',
        content: review.content || previous.content || '',
        rating: review.rating ?? previous.rating ?? null,
        date: review.date || previous.date || '',
        hasReply: Boolean(review.replyContent || previous.replyContent),
        replyContent: review.replyContent || previous.replyContent || '',
        replyDate: review.replyDate || previous.replyDate || ''
      });
    }
  }

  console.log(
    `📋 DOM=${snapshot.cardsFound}，本次解析=${snapshot.reviews.length}，累積=${reviewMap.size}`
  );
  return snapshot.reviews.length;
}

// ======================================================
// 評論面板捲動
// ======================================================

async function scrollReviews(page) {
  const panel = await page.evaluate(() => {
    const first = document.querySelector('[data-review-id]');
    let element = first?.parentElement;

    while (element && element !== document.body) {
      const css = getComputedStyle(element);
      if (
        element.scrollHeight > element.clientHeight + 80 &&
        /auto|scroll|overlay/.test(css.overflowY)
      ) break;
      element = element.parentElement;
    }

    if (!element || element === document.body) {
      // 地圖評論清單通常以 role=feed 或 m6QErb 容器捲動。
      const candidates = [...document.querySelectorAll('[role="feed"],.m6QErb,div,section')]
        .filter(el => {
          const rect = el.getBoundingClientRect();
          const css = getComputedStyle(el);
          return (
            rect.width >= 220 && rect.height >= 180 &&
            rect.top < innerHeight && rect.bottom > 0 &&
            el.scrollHeight > el.clientHeight + 80 &&
            /auto|scroll|overlay/.test(css.overflowY)
          );
        })
        .sort((a, b) => {
          const aHas = a.querySelector('[data-review-id]') ? 0 : 1;
          const bHas = b.querySelector('[data-review-id]') ? 0 : 1;
          return aHas - bHas;
        });
      element = candidates[0];
    }

    if (!element) return null;
    element.setAttribute('data-scraper-scroll-panel', '1');
    const rect = element.getBoundingClientRect();
    return {
      x: Math.min(innerWidth - 12, Math.max(12, rect.left + rect.width / 2)),
      y: Math.min(innerHeight - 12, Math.max(12, rect.top + rect.height / 2)),
      before: element.scrollTop
    };
  });

  if (!panel) throw new Error('找不到評論捲動容器');
  await page.mouse.move(panel.x, panel.y);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel({ deltaY: 950 });
    await pause(300, 500);
  }
  await pause(900, 1500);

  const after = await page.evaluate(() => {
    const el = document.querySelector('[data-scraper-scroll-panel="1"]');
    if (!el) return null;
    return {
      after: el.scrollTop,
      remaining: Math.max(0, el.scrollHeight - el.clientHeight - el.scrollTop)
    };
  });
  if (!after) throw new Error('滑動時評論面板消失');
  return { ...panel, ...after };
}

// ======================================================
// 單一店家
// ======================================================

async function scrapeStore(page, store, maxRounds) {
  const name = `${store.brand} ${store.store}`;
  console.log(`➡️ 開始抓取：${name}`);

  await enterReviews(page, store);
  const average = await getStoreRating(page);
  console.log('⭐ 店家平均星等:', average || '未找到');

  // 必須先完成最新排序，才開始寫入評論結果。
  await sortByNewest(page);

  const map = new Map();
  const stableLimit = maxRounds > 5 ? 5 : 3;
  let stable = 0;
  let lastPosition = -1;

  for (let round = 1; round <= maxRounds; round++) {
    const before = map.size;
    await expandReviewText(page);
    await detectLoginGate(page);
    await collectReviews(page, map);
    const scroll = await scrollReviews(page);
    await detectLoginGate(page);
    await collectReviews(page, map);

    const gained = map.size - before;
    console.log(
      `🌀 第 ${round}/${maxRounds} 輪：新增 ${gained}，累積 ${map.size}，剩餘距離 ${scroll.remaining}`
    );

    const noProgress = gained === 0 && scroll.after === lastPosition;
    stable = noProgress ? stable + 1 : 0;
    lastPosition = scroll.after;

    if (stable >= stableLimit) {
      if (scroll.remaining >= 100) {
        throw new Error('評論面板仍有可捲動距離，但持續沒有新評論，可能受到存取或載入限制');
      }
      console.log('🛑 評論清單已捲至目前可載入的底部');
      break;
    }

    if (round % 12 === 0) {
      checkAccess(await diagnose(page, `第 ${round} 輪`));
    }

    // 只做節流，不宣稱能解除 Google 既有的 IP 封鎖。
    if (round < maxRounds) {
      await sleep(readDelay('SCRAPE_ROUND_DELAY_MS', 3500));
    }
  }

  await expandReviewText(page);
  await collectReviews(page, map);
  if (!map.size) throw new Error('評論頁面已開啟，但沒有解析到評論');

  const reviews = [...map.values()].map(review => ({
    ...review,
    brand: store.brand,
    store: store.store,
    branch: store.branch,
    storeRating: average,
    averageRating: average
  }));
  console.log(`✅ ${name}：${reviews.length} 筆`);
  return reviews;
}

// ======================================================
// 主程式（GitHub Actions / Windows）
// ======================================================

async function scrapeGoogleReviews() {
  // 2026/10：預設走已在 GitHub Actions 取得 300 筆的 BOQ 免登入後端。
  // 保留下面全部 Puppeteer 程式，僅在 SCRAPE_ENGINE=legacy 時使用。
  const engine = String(process.env.SCRAPE_ENGINE || 'boq').trim().toLowerCase();
  if (engine === 'boq') {
    const { scrapeBOQ } = await import('./.boq-test/boq-main.mjs');
    return scrapeBOQ(STORES);
  }
  if (engine !== 'legacy') {
    throw new Error(`不支援的 SCRAPE_ENGINE：${engine}（只能是 boq 或 legacy）`);
  }
  let browser;
  try {
    const cloud = isCloud();
    const proxy = readProxyConfig();
    console.log('☁️ GitHub Actions/雲端模式:', cloud);
    console.log(proxy
      ? `🌐 已設定代理出口：${proxy.hostname}（未驗證是否可正常存取 Google）`
      : '🌐 未設定代理：使用 GitHub Actions／本機原本的出口 IP');

    browser = await puppeteer.launch({
      headless: cloud ? 'new' : false,
      executablePath: executablePath(cloud),
      protocolTimeout: 600000,
      ...(cloud ? {} : {
        userDataDir: process.env.GOOGLE_PROFILE_DIR ||
          path.join(__dirname, 'chrome-google-profile')
      }),
      defaultViewport: cloud ? { width: 1366, height: 900 } : null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1366,900',
        '--lang=zh-TW',
        '--no-first-run',
        '--no-default-browser-check',
        ...(proxy ? [`--proxy-server=${proxy.server}`] : [])
      ]
    });

    await verifyProxyEgress(browser, proxy);

    // 本機／雲端一律先確認 Google 已登入，再開始 Maps 評論爬取。
    // 本機沒有環境變數時，不會跳過驗證。
    if (process.env.SCRAPE_LOGIN_MODE === 'skip') {
      console.log('⚠️ 未登入公開評論測試模式：Google 可能不提供「最新」或完整評論');
    } else {
      await ensureGoogleSignedIn(browser, cloud, proxy);
    }

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();
    await applyProxyAuth(page, proxy);
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
    });
    page.setDefaultNavigationTimeout(60000);

    const targetBrand = process.env.SCRAPE_TARGET_BRAND || 'all';
    const targetStore = process.env.SCRAPE_TARGET_STORE || 'all';
    const stores = STORES.filter(store =>
      (targetBrand === 'all' || store.brand === targetBrand) &&
      (targetStore === 'all' || store.store === targetStore)
    );
    const maxRounds = getMaxRounds();
    console.log(`🎯 目標店家=${stores.length}，每店最多滑動=${maxRounds} 輪`);
    if (!stores.length) throw new Error('沒有符合條件的店家，請檢查 stores.js');

    const result = [];
    const failures = [];

    for (const store of stores) {
      try {
        const reviews = await scrapeStore(page, store, maxRounds);
        result.push(...reviews);
      } catch (error) {
        const message = `${store.brand} ${store.store}: ${error.message}`;
        console.error('❌', message);
        failures.push(message);
        if (isGoogleAccessBlock(error)) {
          console.error('🛑 偵測到 Google 限流／IP 驗證，立即停止本次執行，不再請求後續店家');
          break;
        }
      }
      await sleep(readDelay('SCRAPE_STORE_DELAY_MS', 12000));
    }

    // 有任一店家失敗就拋錯，避免不完整輸出覆蓋舊資料。
    if (failures.length) {
      throw new Error(
        `有 ${failures.length}/${stores.length} 間店未完成，取消這次輸出：\n${failures.join('\n')}`
      );
    }

    console.log(`✅ 全部 ${stores.length} 間店，共 ${result.length} 筆評論`);
    return result;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

module.exports = scrapeGoogleReviews;
