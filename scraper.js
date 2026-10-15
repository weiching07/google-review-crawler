
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
  return page.evaluate(() => {
    const clean = value =>
      String(value || '').replace(/\s+/g, ' ').trim();

    const visible = el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);

      return (
        r.width > 0 &&
        r.height > 0 &&
        s.display !== 'none' &&
        s.visibility !== 'hidden'
      );
    };

    const valid = value => {
      const n = Number(value);

      return (
        Number.isFinite(n) &&
        n >= 1 &&
        n <= 5 &&
        String(value).includes('.')
      );
    };

    const blocks = [
      ...document.querySelectorAll('.F7nice')
    ];

    for (const block of blocks) {
      if (!visible(block)) continue;

      for (const el of block.querySelectorAll('span, div')) {
        if (!visible(el)) continue;

        const match = clean(
          el.innerText || el.textContent
        ).match(/^([1-5]\.\d)$/);

        if (match && valid(match[1])) {
          return match[1];
        }
      }

      const match = clean(
        block.innerText || block.textContent
      ).match(/\b([1-5]\.\d)\b/);

      if (match && valid(match[1])) {
        return match[1];
      }
    }

    for (const el of document.querySelectorAll('span, div')) {
      if (!visible(el)) continue;

      const match = clean(
        el.innerText || el.textContent
      ).match(/^([1-5]\.\d)$/);

      if (match && valid(match[1])) {
        return match[1];
      }
    }

    for (const el of document.querySelectorAll('[aria-label], [title]')) {
      if (!visible(el)) continue;

      const source = clean(
        (el.getAttribute('aria-label') || '') +
        ' ' +
        (el.getAttribute('title') || '')
      );

      const match = source.match(
        /([1-5]\.\d)\s*(?:星|顆星|stars?)/i
      );

      if (match && valid(match[1])) {
        return match[1];
      }
    }

    return '';
  });
}

// ========================================
// 評論列表狀態
// ========================================

async function getReviewState(page) {
  return page.evaluate(() => {
    const cards = [
      ...document.querySelectorAll('[data-review-id]')
    ];

    const ids = [
      ...new Set(
        cards
          .map(el => el.getAttribute('data-review-id'))
          .filter(Boolean)
      )
    ];

    const feeds = [
      ...document.querySelectorAll(
        '[role="feed"], .m6U62c'
      )
    ];

    const activeTab = [
      ...document.querySelectorAll('[role="tab"]')
    ].find(el =>
      el.getAttribute('aria-selected') === 'true' &&
      /評論|reviews/i.test(
        (el.getAttribute('aria-label') || '') +
        ' ' +
        (el.innerText || '')
      )
    );

    return {
      count: cards.length,
      uniqueIds: ids.length,
      firstId: ids[0] || '',
      lastId: ids[ids.length - 1] || '',
      feedCount: feeds.length,
      activeReviewTab: Boolean(activeTab),
      url: location.href
    };
  });
}

// ========================================
// 精確開啟評論分頁
// ========================================

async function openReviewsTab(page) {
  console.log('🎯 正在尋找真正的評論按鈕...');

  const before = await getReviewState(page);

  const candidates = await page.evaluate(() => {
    const visible = el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);

      return (
        r.width > 0 &&
        r.height > 0 &&
        r.bottom > 0 &&
        r.top < innerHeight &&
        s.visibility !== 'hidden' &&
        s.display !== 'none'
      );
    };

    const elements = [
      ...document.querySelectorAll(
        'button, [role="tab"], [role="button"], a[aria-label]'
      )
    ];

    return elements
      .filter(visible)
      .map((el, index) => {
        const label = (
          el.getAttribute('aria-label') || ''
        ).replace(/\s+/g, ' ').trim();

        const text = (
          el.innerText || el.textContent || ''
        ).replace(/\s+/g, ' ').trim();

        let score = 0;

        if (/^評論$/i.test(label)) score = 100;
        else if (/^reviews$/i.test(label)) score = 100;
        else if (/^評論(?:\s|$)/.test(label)) score = 95;
        else if (/^reviews?(?:\s|$)/i.test(label)) score = 95;
        else if (/^查看(?:全部|所有)?評論/.test(label)) score = 90;
        else if (/^see all reviews/i.test(label)) score = 90;
        else if (/^評論(?:\s|$)/.test(text)) score = 85;
        else if (/^reviews?(?:\s|$)/i.test(text)) score = 85;
        else if (/^查看(?:全部|所有)?評論/.test(text)) score = 80;

        if (el.getAttribute('role') === 'tab') {
          score += 10;
        }

        const r = el.getBoundingClientRect();

        return {
          index,
          label,
          text: text.slice(0, 100),
          score,
          x: r.left + r.width / 2,
          y: r.top + r.height / 2
        };
      })
      .filter(item => item.score >= 80)
      .sort((a, b) => b.score - a.score);
  });

  console.log('🎯 評論按鈕候選:', candidates.slice(0, 5));

  if (candidates.length === 0) {
    if (before.count > 0 && before.activeReviewTab) {
      console.log('✅ 評論分頁已經開啟');
      return true;
    }

    console.warn('❌ 找不到真正的評論按鈕');
    return false;
  }

  const target = candidates[0];

  await page.mouse.click(target.x, target.y);

  await randomDelay(1800, 2800);

  try {
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll(
        '[data-review-id]'
      );

      const active = [
        ...document.querySelectorAll('[role="tab"]')
      ].some(el =>
        el.getAttribute('aria-selected') === 'true' &&
        /評論|reviews/i.test(
          (el.getAttribute('aria-label') || '') +
          ' ' +
          (el.innerText || '')
        )
      );

      return cards.length > 0 && (
        active ||
        document.querySelector('[role="feed"]') ||
        document.querySelector('.m6U62c')
      );
    }, {
      timeout: 15000,
      polling: 500
    });
  } catch {
    console.warn('⚠️ 點擊後尚未確認評論列表');
  }

  const after = await getReviewState(page);

  console.log('🎯 點擊後評論狀態:', after);

  if (
    after.count === 0 ||
    (
      !after.activeReviewTab &&
      after.feedCount === 0
    )
  ) {
    console.warn('❌ 尚未確認進入完整評論列表');
    return false;
  }

  console.log('✅ 已進入評論列表');
  return true;
}

// ========================================
// 修正：排序 → 最新
// ========================================

async function clickNewestSort(page) {
  console.log('🔃 嘗試切換最新排序...');

  const sortButton = await page.evaluate(() => {
    const visible = el => {
      const r = el.getBoundingClientRect();

      return (
        r.width > 0 &&
        r.height > 0 &&
        r.top < innerHeight &&
        r.bottom > 0
      );
    };

    const elements = [
      ...document.querySelectorAll(
        'button, [role="button"], [aria-haspopup]'
      )
    ];

    const matches = elements
      .filter(visible)
      .map(el => {
        const label = (
          el.getAttribute('aria-label') || ''
        ).replace(/\s+/g, ' ').trim();

        const text = (
          el.innerText || ''
        ).replace(/\s+/g, ' ').trim();

        let score = 0;

        if (/^排序$|^sort$/i.test(label)) score = 100;
        else if (/^排序|^sort by/i.test(label)) score = 95;
        else if (/^排序$|^sort$/i.test(text)) score = 90;
        else if (/^排序方式|^sort by/i.test(text)) score = 85;
        else if (/^排序/.test(text) && text.length < 35) score = 70;

        const r = el.getBoundingClientRect();

        return {
          score,
          label,
          text,
          x: r.left + r.width / 2,
          y: r.top + r.height / 2
        };
      })
      .filter(x => x.score >= 70)
      .sort((a, b) => b.score - a.score);

    return matches[0] || null;
  });

  console.log('🔃 排序按鈕:', sortButton);

  if (!sortButton) {
    console.warn('⚠️ 找不到排序按鈕，保留目前排序');
    return false;
  }

  await page.mouse.click(
    sortButton.x,
    sortButton.y
  );

  await randomDelay(600, 1000);

  const newest = await page.evaluate(() => {
    const visible = el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);

      return (
        r.width > 0 &&
        r.height > 0 &&
        r.top < innerHeight &&
        r.bottom > 0 &&
        s.visibility !== 'hidden'
      );
    };

    const selectors = [
      '[role="menuitemradio"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="listbox"] [role="button"]',
      '[role="menu"] button',
      '[role="listbox"] div',
      '[role="menu"] div'
    ].join(',');

    const items = [
      ...document.querySelectorAll(selectors)
    ].filter(visible);

    const matches = [];

    for (const el of items) {
      const ownText = (
        el.innerText ||
        el.textContent ||
        ''
      ).replace(/\s+/g, ' ').trim();

      const label = (
        el.getAttribute('aria-label') || ''
      ).replace(/\s+/g, ' ').trim();

      if (
        !/^(最新|最新評論|Newest|Most recent)$/i.test(ownText) &&
        !/^(最新|最新評論|Newest|Most recent)$/i.test(label)
      ) {
        continue;
      }

      const r = el.getBoundingClientRect();

      matches.push({
        el,
        text: ownText || label,
        area: r.width * r.height
      });
    }

    matches.sort((a, b) => a.area - b.area);

    if (!matches.length) {
      return {
        found: false,
        clicked: false
      };
    }

    let target = matches[0].el;

    let p = target.parentElement;

    while (p && p !== document.body) {
      if (
        p.matches(
          '[role="menuitemradio"], [role="menuitem"], [role="option"], button'
        )
      ) {
        target = p;
        break;
      }

      p = p.parentElement;
    }

    target.click();

    return {
      found: true,
      clicked: true,
      text: matches[0].text
    };
  });

  console.log('🆕 最新排序結果:', newest);

  if (!newest.clicked) {
    console.warn(
      '⚠️ 沒有找到最新排序選項，不使用鍵盤猜測'
    );
    return false;
  }

  await randomDelay(1600, 2500);

  const state = await getReviewState(page);

  console.log('🔎 排序後評論狀態:', state);
  console.log('✅ 已點擊最新排序選項');

  return true;
}

// ========================================
// 偵測真正評論捲動容器
// ========================================

async function getReviewScrollBox(page) {
  return page.evaluate(() => {
    const cards = [
      ...document.querySelectorAll('[data-review-id]')
    ];

    if (!cards.length) return null;

    const candidates = new Set();

    for (const card of cards.slice(0, 6)) {
      let p = card.parentElement;

      while (p && p !== document.body) {
        candidates.add(p);
        p = p.parentElement;
      }
    }

    for (const el of document.querySelectorAll(
      '[role="feed"], .m6U62c'
    )) {
      candidates.add(el);
    }

    const options = [...candidates]
      .map(el => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);

        const count = cards.filter(c =>
          el.contains(c)
        ).length;

        const scrollRange =
          el.scrollHeight - el.clientHeight;

        const visible =
          r.width > 240 &&
          r.height > 180 &&
          r.top < innerHeight &&
          r.bottom > 0;

        const isFeed = el.matches(
          '[role="feed"], .m6U62c'
        );

        const overflow =
          /auto|scroll|overlay/.test(style.overflowY);

        const score =
          (isFeed ? 100 : 0) +
          count * 5 +
          (overflow ? 30 : 0);

        return {
          el,
          r,
          count,
          scrollRange,
          visible,
          isFeed,
          overflow,
          score
        };
      })
      .filter(x =>
        x.visible &&
        x.scrollRange > 40 &&
        x.count >= 1 &&
        (x.overflow || x.isFeed)
      )
      .sort((a, b) =>
        b.score - a.score ||
        a.r.width - b.r.width
      );

    const pick = options[0];

    if (!pick) return null;

    const { el, r } = pick;

    const ids = [
      ...new Set(
        cards
          .filter(c => el.contains(c))
          .map(c => c.getAttribute('data-review-id'))
          .filter(Boolean)
      )
    ];

    return {
      x: Math.max(
        3,
        Math.min(
          innerWidth - 3,
          r.left + r.width / 2
        )
      ),

      y: Math.max(
        3,
        Math.min(
          innerHeight - 3,
          (
            Math.max(0, r.top) +
            Math.min(innerHeight, r.bottom)
          ) / 2
        )
      ),

      top: el.scrollTop,
      height: el.scrollHeight,
      clientHeight: el.clientHeight,

      remaining: Math.max(
        0,
        el.scrollHeight -
        el.clientHeight -
        el.scrollTop
      ),

      domReviews: cards.length,
      uniqueIds: ids.length,
      lastId: ids[ids.length - 1] || ''
    };
  });
}

// ========================================
// 擷取評論與店家回覆
// ========================================

async function collectCurrentReviews(page, reviewMap) {
  const current = await page.evaluate(() => {
    const results = [];

    const reviewEls = [
      ...document.querySelectorAll(
        'div[data-review-id]'
      )
    ];

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

      if (startIndex === -1) return empty;

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

      if (!replyContent) return empty;

      return {
        hasReply: true,
        replyContent,
        replyDate
      };
    }

    reviewEls.forEach((el, i) => {
      const rawId =
        el.getAttribute('data-review-id') || '';

      const textEl =
        el.querySelector('.wiI7pd') ||
        el.querySelector('[jsname="fbQN7e"]');

      const ratingEl =
        el.querySelector(
          '[role="img"][aria-label*="星"]'
        ) ||
        el.querySelector(
          '[role="img"][aria-label*="star"]'
        );

      const authorEl =
        el.querySelector('.d4r55') ||
        el.querySelector('.TSUbDb');

      const dateEl =
        el.querySelector('.rsqaWe') ||
        el.querySelector('.xRkPPb') ||
        [
          ...el.querySelectorAll('span')
        ].find(s => {
          const t = (s.innerText || '').trim();

          return /剛剛|分鐘前|小時前|天前|週前|個月前|年前|minute|hour|day|week|month|year/i.test(t);
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

      let rating = 0;

      if (ratingEl) {
        const m = (
          ratingEl.getAttribute('aria-label') || ''
        ).match(/[1-5]/);

        if (m) rating = Number(m[0]);
      }

      const valid =
        rawId &&
        (author || rating > 0 || content) &&
        !content.includes('function(){') &&
        !content.includes('window.tactilecsi') &&
        !content.includes('window.google') &&
        !content.includes('RegExp(') &&
        !content.includes('sjsuid_') &&
        !content.includes(':root{');

      if (!valid) return;

      const replyData = extractOwnerReply(el);

      results.push({
        reviewId: rawId,
        author,
        content,
        rating,
        date,
        hasReply: replyData.hasReply,
        replyContent: replyData.replyContent,
        replyDate: replyData.replyDate
      });
    });

    return results;
  });

  for (const review of current) {
    const key = getReviewKey(review);

    if (!key) continue;

    if (!reviewMap.has(key)) {
      reviewMap.set(key, review);
    } else {
      const old = reviewMap.get(key);

      reviewMap.set(key, {
        ...old,
        ...review,

        hasReply: Boolean(
          review.replyContent ||
          old.replyContent
        ),

        replyContent:
          review.replyContent ||
          old.replyContent ||
          '',

        replyDate:
          review.replyDate ||
          old.replyDate ||
          ''
      });
    }
  }

  return current.length;
}

// ========================================
// 展開更多評論文字
// ========================================

async function expandCurrentMore(page) {
  return page.evaluate(() => {
    const reviews = [
      ...document.querySelectorAll(
        'div[data-review-id]'
      )
    ];

    let count = 0;

    for (const review of reviews) {
      const buttons = [
        ...review.querySelectorAll('button')
      ];

      for (const btn of buttons) {
        const text = (
          (btn.innerText || '') +
          (btn.getAttribute('aria-label') || '')
        ).toLowerCase().trim();

        if (
          text === '更多' ||
          text === 'more' ||
          text === 'read more' ||
          text === '查看更多'
        ) {
          btn.click();
          count++;
        }
      }
    }

    return count;
  });
}

// ========================================
// 評論捲動
// ========================================

async function jsScrollReviewList(page, options = {}) {
  const label = options.label || 'review-wheel';

  try {
    const before = await getReviewScrollBox(page);

    if (!before) {
      console.warn('❌ 找不到評論捲動容器');

      return {
        success: false,
        before: -1,
        after: -1,
        remaining: -1,
        domReviews: 0,
        uniqueIds: 0,
        method: 'no-container',
        timeout: false
      };
    }

    await page.mouse.move(
      before.x,
      before.y
    );

    // 每一外部輪分段滾動
    // 不增加 SCRAPE_MAX_ROUNDS
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel({
        deltaY: 850
      });

      await randomDelay(450, 700);
    }

    let after = await getReviewScrollBox(page);

    if (after && after.remaining < 40) {
      await page.waitForFunction(
        ({ lastId, count }) => {
          const ids = [
            ...new Set(
              [
                ...document.querySelectorAll(
                  '[data-review-id]'
                )
              ]
                .map(el =>
                  el.getAttribute('data-review-id')
                )
                .filter(Boolean)
            )
          ];

          return (
            ids.length > count ||
            (
              ids.length > 0 &&
              ids[ids.length - 1] !== lastId
            )
          );
        },
        {
          timeout: 3500,
          polling: 300
        },
        {
          lastId: before.lastId,
          count: before.uniqueIds
        }
      ).catch(() => {});

      after = await getReviewScrollBox(page);
    }

    return {
      success: Boolean(after),
      before: before.top,
      after: after?.top ?? -1,
      remaining: after?.remaining ?? -1,
      domReviews: after?.domReviews ?? 0,
      uniqueIds: after?.uniqueIds ?? 0,
      lastId: after?.lastId || '',
      method: label,
      timeout: false
    };
  } catch (err) {
    console.warn(
      '⚠️ 評論捲動失敗:',
      err.message
    );

    return {
      success: false,
      before: -1,
      after: -1,
      remaining: -1,
      domReviews: 0,
      uniqueIds: 0,
      method: label + '-error',
      timeout: false
    };
  }
}

async function fastScrollReviews(
  page,
  totalReviews = 0,
  maxRounds = 30
) {
  return jsScrollReviewList(page, {
    label: 'review-feed-wheel'
  });
}

// ========================================
// 載入並收集評論
// ========================================

async function fastLoadAndCollectReviews(
  page,
  maxRounds = 30
) {
  console.log('➡️ 開始快速載入並抓評論...');

  const reviewMap = new Map();

  const isFullSync = maxRounds > 5;

  // 保持 5，不再擅自改成 10
  const maxStableRounds = 5;

  console.log(
    isFullSync
      ? '🚀 完整同步模式'
      : '⚡ 快速同步模式'
  );

  console.log(
    `🔁 連續未新增上限：${maxStableRounds}`
  );

  let stableCount = 0;
  let noMoveCount = 0;
  let lastRemaining = -1;

  for (
    let round = 0;
    round < maxRounds;
    round++
  ) {
    const beforeTotal = reviewMap.size;

    const beforeExpandCount =
      await collectCurrentReviews(
        page,
        reviewMap
      );

    const expanded =
      await expandCurrentMore(page);

    if (expanded > 0) {
      await randomDelay(
        isFullSync ? 300 : 700,
        isFullSync ? 600 : 1000
      );
    }

    const afterExpandCount =
      await collectCurrentReviews(
        page,
        reviewMap
      );

    const gained =
      reviewMap.size - beforeTotal;

    const state = await getReviewState(page);

    console.log(
      `🌀 批次 ${round + 1}/${maxRounds}，畫面 ${beforeExpandCount}->${afterExpandCount}，展開 ${expanded}，本輪新增 ${gained}，累積 ${reviewMap.size}`
    );

    console.log(
      `🔎 DOM卡片=${state.count}，不重複評論ID=${state.uniqueIds}，已儲存=${reviewMap.size}`
    );

    if (gained > 0) {
      stableCount = 0;

      console.log(
        `✅ 本輪新增 ${gained} 筆`
      );
    } else {
      stableCount++;

      console.log(
        `⏳ 本輪沒有新增，連續未新增 ${stableCount}/${maxStableRounds}`
      );
    }

    if (stableCount >= maxStableRounds) {
      console.log(
        '🛑 連續未新增，結束本店抓取'
      );
      break;
    }

    const scrollResult =
      await fastScrollReviews(
        page,
        reviewMap.size,
        maxRounds
      );

    lastRemaining = scrollResult.remaining;

    console.log(
      `⬇️ 評論滾動 top=${scrollResult.before}->${scrollResult.after} ${scrollResult.method} remaining=${scrollResult.remaining}`
    );

    const moved =
      scrollResult.before >= 0 &&
      scrollResult.after >= 0 &&
      scrollResult.after !== scrollResult.before;

    if (moved) {
      noMoveCount = 0;
    } else {
      noMoveCount++;
    }

    if (noMoveCount >= 3) {
      console.warn(
        '⚠️ 連續三次滑動位置沒有改變'
      );

      console.warn(
        '⚠️ 不再將滑動位置不變視為載入成功'
      );

      // 不立即判定抓取完成
      // 仍依照原本的未新增條件結束
      noMoveCount = 0;
    }

    await randomDelay(
      isFullSync ? 300 : 1000,
      isFullSync ? 700 : 1500
    );
  }

  const reviews = [
    ...reviewMap.values()
  ];

  console.log(
    `⚠️ 前台滑動結束，抓到 ${reviews.length} 筆。最後 remaining=${lastRemaining}`
  );

  console.log(
    `✅ 抓到 ${reviews.length} 筆評論`
  );

  if (reviews.length > 0) {
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

  await page.waitForSelector(searchBox, {
    timeout: 30000
  });

  await page.click(searchBox, {
    clickCount: 3
  });

  await page.keyboard.press('Backspace');

  for (const char of storeConfig.keyword) {
    await page.type(searchBox, char);
    await randomDelay(100, 200);
  }

  await page.keyboard.press('Enter');

  await randomDelay(5000, 6000);

  console.log(
    '🚀 嘗試進入 Google Maps...'
  );

  const opened = await page.evaluate(() => {
    const elements = [
      ...document.querySelectorAll('a, button')
    ];

    const target = elements.find(el => {
      const text = (
        el.getAttribute('aria-label') ||
        el.innerText ||
        ''
      ).toLowerCase().trim();

      return (
        text === '地圖' ||
        text === 'maps' ||
        text === 'google 地圖'
      );
    });

    if (!target) return false;

    target.click();
    return true;
  });

  if (opened) {
    await randomDelay(4000, 6000);
  }

  let currentUrl = page.url();

  if (!currentUrl.includes('/maps/')) {
    console.log(
      '⚠️ 尚未進入 Google Maps，改用 fallback'
    );

    if (!storeConfig.fallbackUrl) {
      throw new Error(
        '未進入 Google Maps，且沒有 fallbackUrl'
      );
    }

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
    '🗺️ 目前 Maps URL:',
    currentUrl
  );

  await randomDelay(4000, 6000);

  console.log(
    '🎯 確認進入 Google Maps 評論列表...'
  );

  const reviewsOpened =
    await openReviewsTab(page);

  if (!reviewsOpened) {
    throw new Error(
      `${storeConfig.brand} ${storeConfig.store} 無法確認評論分頁已開啟`
    );
  }

  const newestSelected =
    await clickNewestSort(page);

  if (!newestSelected) {
    console.warn(
      '⚠️ 最新排序未確認成功，本店仍可抓取，但排序可能不是最新'
    );
  }

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

async function scrapeGoogleReviews(retryCount = 0) {
  let browser;

  try {
    console.log(
      '➡️ 啟動防偵測 Chrome...'
    );

    const isCloud = isCloudEnv();
    const chromePath =
      getChromeExecutablePath(isCloud);

    console.log('☁️ isCloud:', isCloud);

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

        // 保留原本首店僅抓到 3 筆時
        // 重啟一次瀏覽器的功能
        if (
          allReviews.length === 0 &&
          reviews.length === 3 &&
          retryCount < 1
        ) {
          console.warn(
            '⚠️ 第一間店只抓到 3 筆，重新啟動 Chrome 一次'
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
