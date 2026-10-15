
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const STORES = require('./stores');

puppeteer.use(StealthPlugin());

const randomDelay = (min, max) =>
  new Promise(resolve =>
    setTimeout(
      resolve,
      Math.floor(Math.random() * (max - min + 1)) + min
    )
  );

function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timeout after ${ms}ms`)),
        ms
      )
    )
  ]);
}

function forceGoogleChineseUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);

    if (url.hostname.includes('google.')) {
      url.searchParams.set('hl', 'zh-TW');
      url.searchParams.set('gl', 'TW');
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

function isCloudEnv() {
  return (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.GITHUB_ACTIONS) ||
    Boolean(process.env.CI)
  );
}

function getChromeExecutablePath(isCloud) {
  if (process.env.PUPPETEER_EXECUTABLE_PATH)
    return process.env.PUPPETEER_EXECUTABLE_PATH;

  if (process.env.CHROME_PATH)
    return process.env.CHROME_PATH;

  if (process.env.GOOGLE_CHROME_BIN)
    return process.env.GOOGLE_CHROME_BIN;

  if (!isCloud) {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }

  return undefined;
}

function getMaxRounds() {
  const value = Number(process.env.SCRAPE_MAX_ROUNDS || 5);

  if (!Number.isFinite(value) || value <= 0) return 5;
  if (value <= 5) return Math.floor(value);
  if (value >= 999) return 15000;
  if (value >= 100) return 10000;

  return Math.min(Math.floor(value), 15000);
}

function getReviewKey(review) {
  return (
    review.reviewId ||
    review.id ||
    `${review.author || ''}-${review.date || ''}-${review.rating || ''}-${String(review.content || '').slice(0, 120)}`
  );
}

// ========================================
// 店家平均星等
// ========================================

async function extractStoreRating(page) {
  return await page.evaluate(() => {
    function clean(value) {
      return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function isVisible(el) {
      if (!el) return false;

      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);

      return (
        r.width > 0 &&
        r.height > 0 &&
        s.display !== 'none' &&
        s.visibility !== 'hidden'
      );
    }

    function isValidAverageRating(value) {
      const n = Number(value);

      return (
        Number.isFinite(n) &&
        n >= 1 &&
        n <= 5 &&
        String(value).includes('.')
      );
    }

    const ratingBlocks = Array.from(
      document.querySelectorAll('.F7nice')
    );

    for (const block of ratingBlocks) {
      if (!isVisible(block)) continue;

      const items = Array.from(
        block.querySelectorAll('span, div')
      );

      for (const el of items) {
        if (!isVisible(el)) continue;

        const text = clean(
          el.innerText || el.textContent || ''
        );

        const match = text.match(/^([1-5]\.\d)$/);

        if (match && isValidAverageRating(match[1])) {
          return match[1];
        }
      }

      const blockText = clean(
        block.innerText || block.textContent || ''
      );

      const blockMatch = blockText.match(
        /\b([1-5]\.\d)\b/
      );

      if (
        blockMatch &&
        isValidAverageRating(blockMatch[1])
      ) {
        return blockMatch[1];
      }
    }

    const visibleElements = Array.from(
      document.querySelectorAll('span, div')
    ).filter(isVisible);

    for (const el of visibleElements) {
      const text = clean(
        el.innerText || el.textContent || ''
      );

      const match = text.match(/^([1-5]\.\d)$/);

      if (match && isValidAverageRating(match[1])) {
        return match[1];
      }
    }

    for (const el of visibleElements) {
      const aria = clean(
        el.getAttribute('aria-label') || ''
      );

      const title = clean(
        el.getAttribute('title') || ''
      );

      const source = `${aria} ${title}`;

      const match = source.match(
        /([1-5]\.\d)\s*(?:星|顆星|stars?)/i
      );

      if (match && isValidAverageRating(match[1])) {
        return match[1];
      }
    }

    return '';
  });
}

// ========================================
// 最新評論排序：保留原本功能
// ========================================

async function clickNewestSort(page) {
  console.log('🔃 嘗試切換最新排序...');

  const sort = await page.evaluate(() => {
    const visible = el => {
      const r = el.getBoundingClientRect();

      return (
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.top < innerHeight
      );
    };

    const buttons = [
      ...document.querySelectorAll(
        'button, [role="button"], [aria-haspopup="menu"]'
      )
    ].filter(visible);

    const target =
      buttons.find(el =>
        /^(排序|排序方式|Sort|Sort by)(?:\s|$)/i.test(
          (
            el.getAttribute('aria-label') ||
            el.innerText ||
            ''
          ).trim()
        )
      ) ||
      buttons.find(el =>
        /排序|Sort by/i.test(
          (el.getAttribute('aria-label') || '').trim()
        )
      );

    if (!target) return false;

    target.click();
    return true;
  });

  if (!sort) {
    console.warn(
      '⚠️ 找不到排序按鈕，無法確認最新排序'
    );

    return false;
  }

  await randomDelay(500, 900);

  const newest = await page.evaluate(() => {
    const visible = el => {
      const r = el.getBoundingClientRect();

      return (
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.top < innerHeight
      );
    };

    const selectors =
      '[role="menuitemradio"], [role="menuitem"], [role="option"], button, [role="button"]';

    const items = [
      ...document.querySelectorAll(selectors)
    ].filter(visible);

    const match = items.find(el =>
      /^(最新|Newest|Most recent|最新評論)$/i.test(
        (
          el.innerText ||
          el.textContent ||
          ''
        ).trim()
      )
    );

    if (!match) return false;

    match.click();
    return true;
  });

  if (!newest) {
    console.warn(
      '⚠️ 找不到最新排序選項，不使用方向鍵猜測'
    );

    return false;
  }

  await randomDelay(1500, 2300);

  console.log('✅ 已選擇最新排序');

  return true;
}

// ========================================
// 取得可見評論卡片與捲動資訊
// ========================================

async function getReviewScrollBox(page) {
  return page.evaluate(() => {
    const cards = [
      ...document.querySelectorAll(
        '[data-review-id]'
      )
    ].filter(el =>
      !el.parentElement?.closest('[data-review-id]')
    );

    if (!cards.length) return null;

    const visible = cards
      .map(el => ({
        el,
        r: el.getBoundingClientRect()
      }))
      .filter(x =>
        x.r.width > 80 &&
        x.r.height > 20 &&
        x.r.bottom > 0 &&
        x.r.top < innerHeight &&
        x.r.left < innerWidth &&
        x.r.right > 0
      );

    if (!visible.length) return null;

    const target = visible.sort(
      (a, b) => b.r.top - a.r.top
    )[0];

    const r = target.r;

    const x = Math.max(
      5,
      Math.min(
        innerWidth - 5,
        r.left + Math.min(
          120,
          r.width * 0.35
        )
      )
    );

    const y = Math.max(
      5,
      Math.min(
        innerHeight - 5,
        Math.max(0, r.top) +
        Math.min(
          35,
          (
            Math.min(innerHeight, r.bottom) -
            Math.max(0, r.top)
          ) / 2
        )
      )
    );

    const ancestors = [];

    for (
      let el = target.el.parentElement;
      el && el !== document.body;
      el = el.parentElement
    ) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);

      if (
        el.scrollHeight > el.clientHeight + 30 &&
        rect.height > 100 &&
        rect.bottom > 0 &&
        rect.top < innerHeight &&
        /auto|scroll|overlay/.test(style.overflowY)
      ) {
        ancestors.push({
          top: el.scrollTop,

          remaining: Math.max(
            0,
            el.scrollHeight -
            el.clientHeight -
            el.scrollTop
          )
        });
      }
    }

    const ids = [
      ...new Set(
        cards
          .map(c =>
            c.getAttribute('data-review-id')
          )
          .filter(Boolean)
      )
    ];

    return {
      x,
      y,

      top:
        ancestors[0]?.top ?? -1,

      remaining:
        ancestors[0]?.remaining ?? -1,

      domReviews: cards.length,
      uniqueIds: ids.length,

      lastId:
        ids.at(-1) || '',

      visibleId:
        target.el.getAttribute('data-review-id') || '',

      visibleTop:
        Math.round(r.top),

      ancestors
    };
  });
}

// ========================================
// 修正：真正開啟 Google Maps 評論分頁
// ========================================

async function openReviewsTab(page) {
  console.log(
    '🎯 正在開啟 Google Maps 評論分頁...'
  );

  const result = await page.evaluate(() => {
    const normalize = value =>
      String(value || '')
        .replace(/\s+/g, ' ')
        .trim();

    const visible = el => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);

      return (
        r.width > 0 &&
        r.height > 0 &&
        r.top < innerHeight &&
        r.bottom > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      );
    };

    // 修正 Google Maps 的新版評論分頁名稱
    const isReviewTab = text => {
      const t = normalize(text);

      return (
        /^對[「"].+[」"]的評論$/.test(t) ||
        /^「.+」的評論$/.test(t) ||
        /^評論(?:\s*[\d,.萬千]+)?$/.test(t) ||
        /^reviews?(?:\s*[\d,.Kk]+)?$/i.test(t) ||
        /^查看(?:全部|所有)?評論/.test(t) ||
        /^see all reviews/i.test(t)
      );
    };

    const elements = [
      ...document.querySelectorAll(
        '[role="tab"], button, [role="button"], a[aria-label]'
      )
    ];

    const candidates = elements
      .filter(visible)
      .map(el => {
        const aria = normalize(
          el.getAttribute('aria-label')
        );

        const label = normalize(
          el.innerText || el.textContent
        );

        const role =
          el.getAttribute('role') || '';

        let score =
          (isReviewTab(aria) ? 100 : 0) +
          (isReviewTab(label) ? 80 : 0);

        if (score && role === 'tab') {
          score += 50;
        }

        // 禁止誤點撰寫評論
        if (
          /撰寫評論|寫評論|write a review/i.test(
            `${aria} ${label}`
          )
        ) {
          score = -100;
        }

        return {
          el,
          aria,
          label,
          score
        };
      })
      .filter(x => x.score > 0)
      .sort((a, b) =>
        b.score - a.score
      );

    if (!candidates.length) {
      return {
        clicked: false,
        reason: '找不到評論分頁'
      };
    }

    const target = candidates[0];

    const alreadySelected =
      target.el.getAttribute('aria-selected') === 'true';

    if (!alreadySelected) {
      target.el.click();
    }

    return {
      clicked: true,
      alreadySelected,
      label: target.aria || target.label
    };
  });

  console.log(
    '🎯 評論分頁點擊結果:',
    result
  );

  if (!result.clicked) {
    console.error(
      '❌ 找不到真正的評論分頁，停止本店抓取'
    );

    return false;
  }

  try {
    // 確認選取的是評論分頁
    // 不再因總覽有 3 筆評論就誤判成功
    await page.waitForFunction(() => {
      const tabs = [
        ...document.querySelectorAll(
          '[role="tab"]'
        )
      ];

      return tabs.some(el => {
        const label = (
          (el.getAttribute('aria-label') || '') +
          ' ' +
          (el.innerText || '')
        )
          .replace(/\s+/g, ' ')
          .trim();

        return (
          el.getAttribute('aria-selected') === 'true' &&
          (
            /對[「"].+[」"]的評論/.test(label) ||
            /「.+」的評論/.test(label) ||
            /評論|reviews?/i.test(label)
          )
        );
      });
    }, {
      timeout: 15000,
      polling: 300
    });

    await page.waitForSelector(
      'div[data-review-id]',
      {
        timeout: 15000
      }
    );

    await randomDelay(1500, 2500);

    console.log(
      '✅ 已確認進入 Google Maps 評論分頁'
    );

    return true;
  } catch (err) {
    console.warn(
      '❌ 無法確認評論分頁已選取:',
      err.message
    );

    return false;
  }
}

// ========================================
// 擷取評論與店家回覆
// ========================================

async function collectCurrentReviews(page, reviewMap) {
  const current = await page.evaluate(() => {
    const results = [];

    const reviewEls = Array.from(
      document.querySelectorAll(
        'div[data-review-id]'
      )
    );

    const REPLY_KEYWORD =
      /店家回覆|店家回應|業主回覆|業主回應|商家回覆|商家回應|Response from the owner|Owner response/i;

    function normalizeText(value) {
      return String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function cleanReplyText(value) {
      return String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join('\n')
        .replace(/^店家回覆[:：]?\s*/i, '')
        .replace(/^店家回應[:：]?\s*/i, '')
        .replace(/^業主回覆[:：]?\s*/i, '')
        .replace(/^業主回應[:：]?\s*/i, '')
        .replace(/^商家回覆[:：]?\s*/i, '')
        .replace(/^商家回應[:：]?\s*/i, '')
        .replace(/^Response from the owner[:：]?\s*/i, '')
        .replace(/^Owner response[:：]?\s*/i, '')
        .trim();
    }

    function isReplyDateLine(line) {
      return /^(剛剛|\d+\s*(分鐘|小時|天|週|個月|年)前|just now|\d+\s*(minutes?|mins?|hours?|days?|weeks?|months?|years?) ago)$/i.test(
        normalizeText(line)
      );
    }

    function isJunkReplyLine(line) {
      const text = normalizeText(line);

      return (
        !text ||
        /^讚$|^分享$|^更多$|^回覆$|^查看原文$|^read more$/i.test(text) ||
        /^like$|^share$|^reply$/i.test(text) ||
        /^\d+\s*星$/.test(text)
      );
    }

    function extractOwnerReply(el) {
      const empty = {
        hasReply: false,
        replyContent: '',
        replyDate: ''
      };

      if (!el) return empty;

      const sourceText = String(
        el.innerText || el.textContent || ''
      )
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, '\n')
        .trim();

      if (!REPLY_KEYWORD.test(sourceText)) {
        return empty;
      }

      const lines = sourceText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

      const startIndex = lines.findIndex(
        line => REPLY_KEYWORD.test(line)
      );

      if (startIndex === -1) {
        return empty;
      }

      let replyDate = '';
      const replyLines = [];

      const firstLine = lines[startIndex]
        .replace(REPLY_KEYWORD, '')
        .replace(/^[:：]\s*/, '')
        .trim();

      if (
        firstLine &&
        !isJunkReplyLine(firstLine) &&
        !isReplyDateLine(firstLine)
      ) {
        replyLines.push(firstLine);
      }

      for (
        let i = startIndex + 1;
        i < lines.length;
        i++
      ) {
        const line = lines[i];

        if (!line) continue;

        if (
          !replyDate &&
          isReplyDateLine(line)
        ) {
          replyDate = normalizeText(line);
          continue;
        }

        if (isJunkReplyLine(line)) continue;

        if (
          /^由\s*Google\s*提供翻譯/i.test(line)
        ) break;

        if (/^查看原文/i.test(line)) break;

        if (
          /^餐點[:：]|^服務[:：]|^氣氛[:：]/.test(line)
        ) break;

        if (/^\d+\s*星$/.test(line)) break;

        if (
          /在地嚮導/.test(line) &&
          /則評論|張相片/.test(line)
        ) break;

        if (
          /^排序$|^最相關$|^最新$|^評論$/i.test(line)
        ) break;

        replyLines.push(line);
      }

      const replyContent = cleanReplyText(
        replyLines.join('\n')
      );

      if (!replyContent) {
        return empty;
      }

      return {
        hasReply: true,
        replyContent,
        replyDate
      };
    }

    reviewEls.forEach((el, i) => {
      const id =
        el.getAttribute('data-review-id') ||
        `r-${i}`;

      const textEl =
        el.querySelector('.wiI7pd') ||
        el.querySelector('[jsname="fbQN7e"]');

      const ratingEl =
        el.querySelector(
          '[role="img"][aria-label*="星"]'
        ) ||
        el.querySelector(
          '[role="img"][aria-label*="star"]'
        ) ||
        el.querySelector('[role="img"]');

      const authorEl =
        el.querySelector('.d4r55') ||
        el.querySelector('.TSUbDb');

      const dateEl =
        el.querySelector('.rsqaWe') ||
        el.querySelector('.xRkPPb') ||
        Array.from(
          el.querySelectorAll('span')
        ).find(s => {
          const t = (s.innerText || '').trim();

          return /剛剛|分鐘前|小時前|天前|週前|個月前|年前|分鐘|小時|天|週|個月|年|minute|hour|day|week|month|year/i.test(t);
        });

      const content = textEl
        ? textEl.innerText.trim()
        : '';

      const author = authorEl
        ? authorEl.innerText.trim()
        : '';

      const date = dateEl
        ? dateEl.innerText.trim()
        : '';

      let rating = 5;

      if (ratingEl) {
        const m = ratingEl
          .getAttribute('aria-label')
          ?.match(/\d/);

        if (m) {
          rating = parseInt(m[0], 10);
        }
      }

      if (
        (author || ratingEl) &&
        !content.includes('function(){') &&
        !content.includes('window.tactilecsi') &&
        !content.includes('window.google') &&
        !content.includes('RegExp(') &&
        !content.includes('sjsuid_') &&
        !content.includes(':root{')
      ) {
        const replyData = extractOwnerReply(el);

        results.push({
          reviewId: id,
          author,
          content,
          rating,
          date,
          hasReply: replyData.hasReply,
          replyContent: replyData.replyContent,
          replyDate: replyData.replyDate
        });
      }
    });

    return results;
  });

  current.forEach(r => {
    const key = getReviewKey(r);

    if (!key) return;

    if (!reviewMap.has(key)) {
      reviewMap.set(key, r);
    } else {
      const old = reviewMap.get(key);

      reviewMap.set(key, {
        ...old,
        ...r,

        hasReply: Boolean(
          r.replyContent || old.replyContent
        ),

        replyContent:
          r.replyContent ||
          old.replyContent ||
          '',

        replyDate:
          r.replyDate ||
          old.replyDate ||
          ''
      });
    }
  });

  return current.length;
}

// ========================================
// 展開評論「更多」
// ========================================

async function expandCurrentMore(page) {
  const count = await page.evaluate(() => {
    const reviewEls = Array.from(
      document.querySelectorAll(
        'div[data-review-id]'
      )
    );

    let count = 0;

    reviewEls.forEach(review => {
      const buttons = Array.from(
        review.querySelectorAll('button')
      );

      buttons.forEach(btn => {
        const t = (
          (btn.innerText || '') +
          (btn.textContent || '') +
          (btn.getAttribute('aria-label') || '') +
          (btn.getAttribute('title') || '')
        ).toLowerCase();

        if (
          t.includes('更多') ||
          t.includes('read more') ||
          t.includes('more')
        ) {
          btn.click();
          count++;
        }
      });
    });

    return count;
  });

  return count;
}

// ========================================
// 評論卡片滑動
// ========================================

async function jsScrollReviewList(page, options = {}) {
  const reviewMap = options.reviewMap;

  const before =
    await getReviewScrollBox(page);

  if (!before) {
    console.warn(
      '❌ 找不到可見評論卡片，停止滾動'
    );

    return {
      success: false,
      before: -1,
      after: -1,
      remaining: -1,
      method: 'no-review-card'
    };
  }

  let previous = before;
  let moved = false;
  let newIds = false;

  // 每輪滾動時即時收集評論
  for (let step = 0; step < 8; step++) {
    const state =
      await getReviewScrollBox(page);

    if (!state) break;

    await page.mouse.move(
      state.x,
      state.y
    );

    await page.mouse.wheel({
      deltaY: 720
    });

    await randomDelay(550, 850);

    if (reviewMap) {
      await expandCurrentMore(page);
      await collectCurrentReviews(
        page,
        reviewMap
      );
    }

    const next =
      await getReviewScrollBox(page);

    if (!next) break;

    if (
      next.visibleId !== state.visibleId ||
      next.visibleTop !== state.visibleTop ||
      next.top !== state.top
    ) {
      moved = true;
    }

    if (
      next.lastId !== before.lastId ||
      next.uniqueIds > before.uniqueIds
    ) {
      newIds = true;
      previous = next;
      break;
    }

    if (
      next.remaining === 0 ||
      (!moved && step >= 2)
    ) {
      await randomDelay(2000, 2800);

      if (reviewMap) {
        await collectCurrentReviews(
          page,
          reviewMap
        );
      }

      const loaded =
        await getReviewScrollBox(page);

      if (
        loaded &&
        (
          loaded.lastId !== before.lastId ||
          loaded.uniqueIds > before.uniqueIds
        )
      ) {
        newIds = true;
        previous = loaded;
        break;
      }
    }

    previous = next;
  }

  console.log(
    `⬇️ 卡片滾動 ${before.visibleId}:${before.visibleTop} -> ${previous.visibleId}:${previous.visibleTop}，新ID=${newIds}`
  );

  if (!moved && !newIds) {
    console.warn(
      '⚠️ 評論卡片沒有移動，可能滾輪未作用於評論列表'
    );
  }

  return {
    success: moved || newIds,
    before: before.top,
    after: previous.top,
    remaining: previous.remaining,
    method: 'mouse-wheel-on-review-card',
    newIds
  };
}

async function fastScrollReviews(
  page,
  totalReviews = 0,
  maxRounds = 30,
  reviewMap = null
) {
  return jsScrollReviewList(
    page,
    { reviewMap }
  );
}

// ========================================
// 載入並收集評論
// ========================================

async function fastLoadAndCollectReviews(
  page,
  maxRounds = 30
) {
  console.log(
    '➡️ 開始快速載入並抓評論...'
  );

  const reviewMap = new Map();
  let stableCount = 0;

  for (
    let round = 0;
    round < maxRounds;
    round++
  ) {
    const oldCount = reviewMap.size;

    await expandCurrentMore(page);

    await collectCurrentReviews(
      page,
      reviewMap
    );

    const result =
      await fastScrollReviews(
        page,
        reviewMap.size,
        maxRounds,
        reviewMap
      );

    await collectCurrentReviews(
      page,
      reviewMap
    );

    const gained =
      reviewMap.size - oldCount;

    console.log(
      `🌀 批次 ${round + 1}/${maxRounds}，新增 ${gained}，累積 ${reviewMap.size}，新ID=${result.newIds}，${result.method}`
    );

    if (gained === 0) {
      stableCount++;
    } else {
      stableCount = 0;
    }

    if (
      !result.success &&
      !result.newIds
    ) {
      console.warn(
        '⚠️ 卡片未移動，停止對錯誤位置反覆滾動'
      );

      break;
    }

    if (stableCount >= 5) {
      break;
    }
  }

  const reviews = [
    ...reviewMap.values()
  ];

  console.log(
    `✅ 抓到 ${reviews.length} 筆評論`
  );

  if (reviews.length) {
    console.log(
      '✅ 第一筆範例:',
      reviews[0]
    );
  }

  return reviews;
}

// ========================================
// 單一店家爬取
// ========================================

async function scrapeOneStore(
  page,
  storeConfig,
  maxRounds
) {
  console.log(
    `➡️ 開始抓取：${storeConfig.brand} ${storeConfig.store}`
  );

  console.log('➡️ 前往 Google...');

  await page.goto(
    forceGoogleChineseUrl(
      'https://www.google.com.tw/?hl=zh-TW&gl=TW'
    ),
    {
      waitUntil: 'networkidle2',
      timeout: 60000
    }
  );

  await randomDelay(2000, 3000);

  console.log(
    `🔍 搜尋 ${storeConfig.keyword}...`
  );

  const searchBox =
    'textarea[name="q"], input[name="q"]';

  await page.waitForSelector(
    searchBox,
    {
      timeout: 30000
    }
  );

  await page.click(searchBox, {
    clickCount: 3
  });

  await page.keyboard.press('Backspace');

  for (const char of storeConfig.keyword) {
    await page.type(
      searchBox,
      char
    );

    await randomDelay(100, 200);
  }

  await page.keyboard.press('Enter');

  await randomDelay(5000, 6000);

  console.log(
    '🚀 嘗試進入 Google Maps...'
  );

  const opened = await page.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll(
        'a, button, span'
      )
    );

    const target = els.find(el => {
      const t = (
        el.innerText || ''
      ).toLowerCase();

      return (
        t.includes('地圖') ||
        t.includes('google 地圖')
      );
    });

    if (target) {
      target.click();
      return true;
    }

    return false;
  });

  if (opened) {
    await randomDelay(4000, 6000);
  }

  let currentUrl = page.url();

  if (!currentUrl.includes('/maps/')) {
    console.log(
      '⚠️ 尚未真正進入 Google Maps，改用 fallback'
    );

    await page.goto(
      forceGoogleChineseUrl(
        storeConfig.fallbackUrl
      ),
      {
        waitUntil: 'networkidle2',
        timeout: 60000
      }
    );

    await randomDelay(8000, 10000);

    currentUrl = page.url();
  }

  console.log(
    '🗺️目前 Maps URL:',
    currentUrl
  );

  await randomDelay(8000, 10000);

  console.log(
    '🎯 確認進入 Google Maps 評論列表...'
  );

  const reviewsOpened =
    await openReviewsTab(page);

  if (!reviewsOpened) {
    console.warn(
      '❌ 評論列表未開啟，略過本店'
    );

    return [];
  }

  await clickNewestSort(page);

  await randomDelay(1500, 2500);

  const storeRating =
    await extractStoreRating(page);

  console.log(
    `⭐ ${storeConfig.brand} ${storeConfig.store} 平均星等:`,
    storeRating || '未抓到'
  );

  console.log(
    '🔁 本次評論滑動輪數:',
    maxRounds
  );

  const reviews =
    await fastLoadAndCollectReviews(
      page,
      maxRounds
    );

  reviews.forEach(review => {
    review.brand = storeConfig.brand;
    review.store = storeConfig.store;
    review.branch = storeConfig.branch;
    review.storeRating = storeRating;
    review.averageRating = storeRating;
  });

  console.log(
    `✅ ${storeConfig.brand} ${storeConfig.store} 完成：${reviews.length} 筆`
  );

  return reviews;
}

// ========================================
// 主程式
// ========================================

async function scrapeGoogleReviews(
  retryCount = 0
) {
  let browser;

  try {
    console.log(
      '➡️ 啟動防偵測 Chrome...'
    );

    const isCloud = isCloudEnv();

    const chromePath =
      getChromeExecutablePath(isCloud);

    console.log(
      '☁️ isCloud:',
      isCloud
    );

    console.log(
      '🧭 Chrome executablePath:',
      chromePath || '使用 Puppeteer 預設'
    );

    browser = await puppeteer.launch({
      headless: isCloud ? 'new' : false,
      protocolTimeout: 600000,
      executablePath: chromePath,

      defaultViewport: isCloud
        ? {
            width: 1366,
            height: 768
          }
        : null,

      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1366,768',
        '--lang=zh-TW',
        '--accept-lang=zh-TW,zh,en-US,en'
      ]
    });

    const page =
      (await browser.pages())[0] ||
      await browser.newPage();

    await page.setExtraHTTPHeaders({
      'Accept-Language':
        'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(
        navigator,
        'webdriver',
        {
          get: () => undefined
        }
      );

      Object.defineProperty(
        navigator,
        'language',
        {
          get: () => 'zh-TW'
        }
      );

      Object.defineProperty(
        navigator,
        'languages',
        {
          get: () => [
            'zh-TW',
            'zh',
            'en-US',
            'en'
          ]
        }
      );
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    const maxRounds = getMaxRounds();

    const allReviews = [];

    const targetBrand =
      process.env.SCRAPE_TARGET_BRAND ||
      'all';

    const targetStore =
      process.env.SCRAPE_TARGET_STORE ||
      'all';

    const targetStores = STORES.filter(
      storeConfig => {
        const brandMatched =
          targetBrand === 'all' ||
          storeConfig.brand === targetBrand;

        const storeMatched =
          targetStore === 'all' ||
          storeConfig.store === targetStore;

        return (
          brandMatched &&
          storeMatched
        );
      }
    );

    console.log(
      '🎯 本次同步目標:',
      targetBrand,
      targetStore
    );

    console.log(
      '🎯 本次店家數:',
      targetStores.length
    );

    for (const storeConfig of targetStores) {
      try {
        const reviews =
          await scrapeOneStore(
            page,
            storeConfig,
            maxRounds
          );

        // 保留第一間店僅抓到 3 筆時
        // 重新啟動瀏覽器一次的機制
        if (
          allReviews.length === 0 &&
          reviews.length === 3 &&
          retryCount < 1
        ) {
          console.log(
            '⚠️ 第一間店只抓到 3 筆，判定本次 Google session 異常'
          );

          console.log(
            '🔄 關閉 Chrome，整輪重新執行一次'
          );

          await browser.close().catch(
            () => {}
          );

          browser = null;

          return await scrapeGoogleReviews(
            retryCount + 1
          );
        }

        allReviews.push(...reviews);
      } catch (err) {
        console.error(
          `❌ ${storeConfig.brand} ${storeConfig.store} 抓取失敗:`,
          err.message
        );
      }

      await randomDelay(3000, 5000);
    }

    console.log(
      `✅ 全部店家合計抓到 ${allReviews.length} 筆評論`
    );

    return allReviews;
  } catch (err) {
    console.error(
      '❌ 錯誤:',
      err
    );

    return [];
  } finally {
    if (browser) {
      await browser.close().catch(
        () => {}
      );
    }
  }
}

module.exports = scrapeGoogleReviews;
