
'use strict';

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const STORES = require('./stores');
const path = require('path');

puppeteer.use(StealthPlugin());

// ======================================================
// 共用設定
// ======================================================

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const randomDelay = (min, max) =>
  sleep(Math.floor(Math.random() * (max - min + 1)) + min);

const clean = value =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function isCloudEnv() {
  return Boolean(
    process.env.GITHUB_ACTIONS ||
    process.env.CI ||
    process.env.NODE_ENV === 'production'
  );
}

function getChromeExecutablePath(isCloud) {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }

  if (process.env.GOOGLE_CHROME_BIN) {
    return process.env.GOOGLE_CHROME_BIN;
  }

  if (!isCloud) {
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  }

  return undefined;
}

function getMaxRounds() {
  const value = Number(process.env.SCRAPE_MAX_ROUNDS || 5);

  if (!Number.isFinite(value) || value <= 0) {
    return 5;
  }

  if (value >= 999) {
    return 15000;
  }

  if (value >= 100) {
    return 10000;
  }

  return Math.floor(value);
}

function getReviewKey(review) {
  return (
    review.reviewId ||
    `${review.author || ''}|${review.date || ''}|${review.rating ?? ''}|${String(review.content || '').slice(0, 150)}`
  );
}

// ======================================================
// 店家平均星等
// ======================================================

async function extractStoreRating(page) {
  return page.evaluate(() => {
    const blocks = [
      ...document.querySelectorAll(
        '.F7nice, [aria-label*="星"], [aria-label*="stars"]'
      )
    ];

    for (const block of blocks) {
      const text = (
        (block.innerText || '') +
        ' ' +
        (block.getAttribute('aria-label') || '')
      ).replace(/\s+/g, ' ').trim();

      const match = text.match(/\b([1-5]\.\d)\b/);

      if (match) {
        return match[1];
      }
    }

    return '';
  });
}

// ======================================================
// 直接點「最新」
// 不先點「排序」
// ======================================================

async function clickNewestSort(page) {
  console.log('🆕 直接尋找「最新」...');

  const result = await page.evaluate(() => {
    const visible = el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < innerHeight &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      );
    };

    const selectors = [
      'button',
      '[role="button"]',
      '[role="tab"]',
      '[role="option"]',
      'a',
      'span'
    ].join(',');

    const nodes = [
      ...document.querySelectorAll(selectors)
    ];

    const candidates = nodes.filter(el => {
      if (!visible(el)) {
        return false;
      }

      const text = (
        el.innerText ||
        el.textContent ||
        ''
      ).replace(/\s+/g, ' ').trim();

      const aria = (
        el.getAttribute('aria-label') || ''
      ).trim();

      return (
        /^(最新|Newest|Most recent)$/i.test(text) ||
        /^(最新|Newest|Most recent)$/i.test(aria)
      );
    });

    for (const item of candidates) {
      const target =
        item.closest(
          'button,[role="button"],[role="tab"],[role="option"],a'
        ) || item;

      try {
        target.scrollIntoView({
          block: 'nearest',
          inline: 'nearest'
        });

        target.click();

        return {
          clicked: true,
          text: (
            item.innerText ||
            item.getAttribute('aria-label') ||
            ''
          ).trim()
        };
      } catch (_) {
        // 嘗試下一個候選元素
      }
    }

    return {
      clicked: false,
      visibleButtons: [
        ...document.querySelectorAll(
          'button,[role="button"],[role="tab"]'
        )
      ]
        .filter(visible)
        .slice(0, 20)
        .map(el =>
          (
            el.innerText ||
            el.getAttribute('aria-label') ||
            ''
          ).trim()
        )
        .filter(Boolean)
    };
  });

  console.log('🆕 最新排序結果:', result);

  if (result.clicked) {
    await randomDelay(1500, 2500);
  } else {
    console.warn('⚠️ 找不到「最新」，保留目前排序');
  }

  return result.clicked;
}

// ======================================================
// 從 Google 搜尋頁擷取評論
//
// 1. 直接使用 [data-review-id]
// 2. 不要求星等元素一定存在
// 3. 抓不到星等保留 null
// 4. 不限定在 [role="dialog"] 內
// 5. 顯示實際解析數量
// ======================================================

async function collectCurrentReviews(page, reviewMap) {
  const snapshot = await page.evaluate(() => {
    const normalize = value =>
      String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const datePattern =
      /(?:剛剛|\d+\s*(?:分鐘|小時|天|週|星期|個月|年)前|\d+\s*(?:minutes?|hours?|days?|weeks?|months?|years?) ago)/i;

    const replyPattern =
      /店家回覆|店家回應|業主回覆|業主回應|商家回覆|商家回應|Response from the owner|Owner response/i;

    const junkPattern =
      /^(讚|分享|更多|回覆|查看原文|翻譯|有幫助|Like|Share|More|Read more)$/i;

    const visible = el => {
      if (!el) {
        return false;
      }

      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      );
    };

    const cards = [
      ...document.querySelectorAll(
        '[data-review-id]'
      )
    ];

    const results = [];
    const seen = new Set();

    function getFirstText(el, selectors) {
      for (const selector of selectors) {
        const found = el.querySelector(selector);

        if (found) {
          const text = normalize(
            found.innerText ||
            found.textContent ||
            ''
          );

          if (text) {
            return text;
          }
        }
      }

      return '';
    }

    function extractRating(el) {
      const ratingNodes = [
        el,
        ...el.querySelectorAll(
          '[aria-label],[title],[data-rating]'
        )
      ];

      for (const node of ratingNodes) {
        const sources = [
          node.getAttribute('aria-label'),
          node.getAttribute('title'),
          node.getAttribute('data-rating')
        ].filter(Boolean);

        for (const source of sources) {
          const text = normalize(source);

          const patterns = [
            /(?:評分|星等|Rated)\s*[:：]?\s*([1-5])(?:\s*\/\s*5)?/i,
            /([1-5])\s*(?:顆星|星|stars?)/i,
            /([1-5])\s*(?:out of 5)/i,
            /^([1-5])$/
          ];

          for (const pattern of patterns) {
            const match = text.match(pattern);

            if (match) {
              const rating = Number(match[1]);

              if (rating >= 1 && rating <= 5) {
                return rating;
              }
            }
          }
        }
      }

      const raw = normalize(
        el.innerText ||
        el.textContent ||
        ''
      );

      const textMatch = raw.match(
        /(?:評分|星等)\s*[:：]?\s*([1-5])/
      );

      if (textMatch) {
        return Number(textMatch[1]);
      }

      // 星等無法確認時，不假設為 5 星
      return null;
    }

    function extractReply(lines) {
      const start = lines.findIndex(line =>
        replyPattern.test(line)
      );

      if (start === -1) {
        return {
          hasReply: false,
          replyContent: '',
          replyDate: ''
        };
      }

      let replyDate = '';

      const firstLine = lines[start]
        .replace(replyPattern, '')
        .replace(/^[:：]\s*/, '')
        .trim();

      const replyLines = [];

      if (
        firstLine &&
        !junkPattern.test(firstLine) &&
        !datePattern.test(firstLine)
      ) {
        replyLines.push(firstLine);
      }

      for (let i = start + 1; i < lines.length; i++) {
        const line = lines[i];

        if (!line) {
          continue;
        }

        if (!replyDate && datePattern.test(line)) {
          replyDate = line;
          continue;
        }

        if (junkPattern.test(line)) {
          continue;
        }

        if (
          /^查看原文|^由 Google 提供翻譯/i.test(line)
        ) {
          break;
        }

        replyLines.push(line);
      }

      const replyContent = replyLines
        .join('\n')
        .trim();

      return {
        hasReply: Boolean(replyContent),
        replyContent,
        replyDate
      };
    }

    for (const el of cards) {
      if (!visible(el)) {
        continue;
      }

      const reviewId = (
        el.getAttribute('data-review-id') ||
        ''
      ).trim();

      if (!reviewId || seen.has(reviewId)) {
        continue;
      }

      const rawText = String(
        el.innerText ||
        el.textContent ||
        ''
      );

      const lines = rawText
        .split('\n')
        .map(normalize)
        .filter(Boolean);

      const fullText = normalize(rawText);

      if (!fullText) {
        continue;
      }

      // 避免把整個評論清單誤認成單筆評論
      if (fullText.length > 12000) {
        continue;
      }

      let author = getFirstText(el, [
        '.d4r55',
        '.TSUbDb',
        '.TSUbDb a',
        '.Y5pjHe',
        '.Vpc5Fe',
        '[data-reviewer-name]',
        '[class*="reviewer-name"]'
      ]);

      let date = getFirstText(el, [
        '.rsqaWe',
        '.xRkPPb',
        '.dehysf',
        '[class*="review-date"]',
        '[class*="review-time"]'
      ]);

      let content = getFirstText(el, [
        '.wiI7pd',
        '.Jtu6Td',
        '.review-full-text',
        '.review-snippet',
        '[jsname="fbQN7e"]',
        '[class*="review-text"]'
      ]);

      if (!date) {
        date = lines.find(line =>
          datePattern.test(line) &&
          line.length < 90
        ) || '';
      }

      if (!author) {
        const candidate = lines.find(line =>
          line.length >= 2 &&
          line.length <= 70 &&
          line !== date &&
          !datePattern.test(line) &&
          !junkPattern.test(line) &&
          !replyPattern.test(line) &&
          !/^(Google|評論|最新|最相關|在地嚮導|Local Guide)$/i.test(line) &&
          !/^[1-5]\s*(?:顆星|星|stars?)$/i.test(line)
        );

        author = candidate || '';
      }

      const rating = extractRating(el);
      const reply = extractReply(lines);

      if (!content) {
        // 搜尋頁評論沒有固定的文字 class 時，
        // 使用卡片內的文字作為備援。
        const replyStart = lines.findIndex(line =>
          replyPattern.test(line)
        );

        const reviewLines =
          replyStart >= 0
            ? lines.slice(0, replyStart)
            : lines;

        const filtered = reviewLines.filter(line => {
          if (line === author || line === date) {
            return false;
          }

          if (junkPattern.test(line)) {
            return false;
          }

          if (
            /^(Google|評論|最新|最相關|在地嚮導|Local Guide)$/i.test(line)
          ) {
            return false;
          }

          if (
            /^[1-5]\s*(?:顆星|星|stars?)$/i.test(line)
          ) {
            return false;
          }

          if (
            /^餐點[:：]|^服務[:：]|^氣氛[:：]/.test(line)
          ) {
            return false;
          }

          return line.length >= 3;
        });

        content = filtered.join(' ').trim();
      }

      // 移除誤合併進評論內容的店家回覆
      if (content && replyPattern.test(content)) {
        content = content.split(replyPattern)[0].trim();
      }

      if (!author && !content) {
        continue;
      }

      seen.add(reviewId);

      results.push({
        reviewId,
        author,
        content,
        rating,
        date,
        hasReply: reply.hasReply,
        replyContent: reply.replyContent,
        replyDate: reply.replyDate
      });
    }

    return {
      reviews: results,
      diagnostics: {
        cardsFound: cards.length,
        parsed: results.length,
        withContent: results.filter(x =>
          Boolean(x.content)
        ).length,
        withRating: results.filter(x =>
          x.rating !== null
        ).length,
        sample: results[0] || null,
        rawSample: cards[0]
          ? String(
              cards[0].innerText ||
              cards[0].textContent ||
              ''
            ).slice(0, 500)
          : ''
      }
    };
  });

  for (const review of snapshot.reviews) {
    const key = getReviewKey(review);

    if (!key) {
      continue;
    }

    const old = reviewMap.get(key);

    if (!old) {
      reviewMap.set(key, review);
    } else {
      reviewMap.set(key, {
        ...old,
        ...review,
        author:
          review.author || old.author || '',
        content:
          review.content || old.content || '',
        rating:
          review.rating ?? old.rating ?? null,
        date:
          review.date || old.date || '',
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

  const d = snapshot.diagnostics;

  console.log(
    `📋 DOM 評論=${d.cardsFound}，解析=${d.parsed}，有文字=${d.withContent}，有星等=${d.withRating}，累積=${reviewMap.size}`
  );

  if (d.sample) {
    console.log(
      '🔍 第一筆評論範例:',
      d.sample
    );
  } else if (d.cardsFound > 0) {
    console.log(
      '⚠️ 找到評論 DOM 但無法解析，原始內容範例:',
      d.rawSample
    );
  }

  return snapshot.reviews.length;
}

// ======================================================
// 展開單筆評論的「更多」
// ======================================================

async function expandCurrentMore(page) {
  return page.evaluate(() => {
    const buttons = [
      ...document.querySelectorAll(
        'button,[role="button"],span'
      )
    ];

    let count = 0;

    for (const button of buttons) {
      const text = (
        button.innerText ||
        button.getAttribute('aria-label') ||
        ''
      ).trim();

      if (
        !/^(更多|顯示更多|全文|More|Read more)$/i.test(text)
      ) {
        continue;
      }

      const target =
        button.closest(
          'button,[role="button"]'
        ) || button;

      const rect = target.getBoundingClientRect();

      if (
        rect.width === 0 ||
        rect.height === 0 ||
        rect.bottom < 0 ||
        rect.top > innerHeight
      ) {
        continue;
      }

      target.click();
      count++;

      if (count >= 30) {
        break;
      }
    }

    return count;
  });
}

// ======================================================
// GitHub Actions 搜尋頁診斷
// ======================================================

async function logSearchPageDiagnostics(page, storeConfig) {
  const info = await page.evaluate(() => {
    const body = (
      document.body?.innerText || ''
    ).replace(/\s+/g, ' ').trim();

    const elements = [
      ...document.querySelectorAll(
        'a,button,[role="button"],span'
      )
    ];

    const reviewLabels = elements
      .map(el => ({
        text: (el.innerText || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100),

        aria: (
          el.getAttribute('aria-label') || ''
        ).slice(0, 100)
      }))
      .filter(x =>
        /評論|reviews?|評價/i.test(
          x.text + ' ' + x.aria
        ) &&
        x.text.length < 100
      )
      .slice(0, 12);

    return {
      url: location.href,
      title: document.title,
      bodyPreview: body.slice(0, 1000),

      possibleBlock:
        /unusual traffic|not a robot|captcha|verify you are human|異常流量|驗證您是人類|存取遭拒/i.test(body),

      reviewLabels
    };
  });

  console.log(
    '🧪 搜尋頁診斷:',
    JSON.stringify({
      store: storeConfig.store,
      ...info
    }, null, 2)
  );

  return info;
}

// ======================================================
// Google 搜尋結果：點評論數量
// 不主動切換到 Google Maps
// ======================================================

async function openFullReviews(page) {
  console.log(
    '🎯 搜尋頁：嘗試點擊 Google 評論數量，不切換 Google Maps'
  );

  for (let attempt = 1; attempt <= 4; attempt++) {
    const result = await page.evaluate(() => {
      const pattern =
        /(?:Google\s*)?評論|Google\s*reviews?|\d[\d,，.]*\s*(?:則|篇)?\s*評論/i;

      const nodes = [
        ...document.querySelectorAll(
          'a,button,[role="button"],span,div'
        )
      ];

      const candidates = [];

      for (const node of nodes) {
        const text = (
          node.innerText || ''
        ).replace(/\s+/g, ' ').trim();

        const aria = (
          node.getAttribute('aria-label') || ''
        ).trim();

        const label = [aria, text].find(t =>
          t &&
          t.length <= 90 &&
          pattern.test(t)
        );

        if (!label) {
          continue;
        }

        const r = node.getBoundingClientRect();

        if (!r.width || !r.height) {
          continue;
        }

        const target =
          node.closest(
            'a,button,[role="button"]'
          ) || node;

        const href =
          target.getAttribute('href') || '';

        if (/\/maps\//i.test(href)) {
          continue;
        }

        const priority =
          (
            /Google\s*評論|Google\s*reviews?/i.test(label)
              ? 0
              : 10
          ) +
          (
            /\d/.test(label)
              ? 0
              : 5
          ) +
          (
            target.matches(
              'a,button,[role="button"]'
            )
              ? 0
              : 3
          ) +
          label.length / 100;

        candidates.push({
          target,
          label,
          priority
        });
      }

      candidates.sort(
        (a, b) =>
          a.priority - b.priority
      );

      if (!candidates.length) {
        return null;
      }

      candidates[0].target.setAttribute(
        'data-scraper-review-entry',
        '1'
      );

      return {
        label: candidates[0].label,
        count: candidates.length
      };
    });

    if (result) {
      console.log(
        '🔎 評論入口:',
        result
      );

      const target = await page.$(
        '[data-scraper-review-entry="1"]'
      );

      if (target) {
        try {
          await target.evaluate(el =>
            el.scrollIntoView({
              block: 'center',
              inline: 'nearest'
            })
          );

          await target.click({
            delay: 100
          });

          await randomDelay(1300, 2300);

          if (/\/maps\//i.test(page.url())) {
            console.warn(
              '⚠️ 入口跳至 Maps，按需求略過本店'
            );

            return false;
          }

          await page.waitForFunction(
            () =>
              document.querySelectorAll(
                '[data-review-id]'
              ).length > 0,
            {
              polling: 300,
              timeout: 16000
            }
          );

          console.log(
            '✅ 搜尋頁評論卡片:',
            await page.evaluate(() =>
              document.querySelectorAll(
                '[data-review-id]'
              ).length
            )
          );

          return true;
        } catch (err) {
          console.warn(
            '⚠️ 點擊或等待評論失敗:',
            err.message
          );
        }
      }
    }

    console.warn(
      `⚠️ 第 ${attempt}/4 次未成功開啟搜尋頁評論`
    );

    await randomDelay(1200, 2000);
  }

  console.warn(
    '❌ 搜尋結果沒有可用的評論入口；不抓預覽評論'
  );

  return false;
}

// ======================================================
// 搜尋頁評論面板滑鼠捲動
// 保留先前已成功運作的方式
// ======================================================

async function scrollSearchReviewPanel(page) {
  const panel = await page.evaluate(() => {
    const firstCard =
      document.querySelector(
        '[data-review-id]'
      );

    let container =
      firstCard?.parentElement;

    while (
      container &&
      container !== document.body
    ) {
      const style =
        getComputedStyle(container);

      if (
        container.scrollHeight >
          container.clientHeight + 80 &&
        /auto|scroll|overlay/.test(
          style.overflowY
        )
      ) {
        break;
      }

      container =
        container.parentElement;
    }

    if (
      !container ||
      container === document.body
    ) {
      const candidates = [
        ...document.querySelectorAll(
          'div,section'
        )
      ]
        .filter(el => {
          const rect =
            el.getBoundingClientRect();

          const style =
            getComputedStyle(el);

          return (
            rect.width > 200 &&
            rect.height > 180 &&
            rect.top < innerHeight &&
            rect.bottom > 0 &&
            el.scrollHeight >
              el.clientHeight + 80 &&
            /auto|scroll|overlay/.test(
              style.overflowY
            )
          );
        })
        .sort((a, b) =>
          a.getBoundingClientRect().width -
          b.getBoundingClientRect().width
        );

      container = candidates[0];
    }

    if (!container) {
      return null;
    }

    container.setAttribute(
      'data-scraper-scroll-panel',
      '1'
    );

    const rect =
      container.getBoundingClientRect();

    return {
      x:
        rect.left +
        rect.width / 2,

      y: Math.min(
        innerHeight - 12,
        Math.max(
          12,
          rect.top + rect.height / 2
        )
      ),

      before:
        container.scrollTop
    };
  });

  if (!panel) {
    console.warn(
      '⚠️ 找不到搜尋頁評論捲動容器'
    );

    return {
      before: -1,
      after: -1,
      remaining: -1,
      method: 'no-panel'
    };
  }

  await page.mouse.move(
    panel.x,
    panel.y
  );

  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel({
      deltaY: 1100
    });

    await randomDelay(450, 700);
  }

  await randomDelay(1300, 2000);

  const after = await page.evaluate(() => {
    const container =
      document.querySelector(
        '[data-scraper-scroll-panel="1"]'
      );

    if (!container) {
      return {
        after: -1,
        remaining: -1
      };
    }

    return {
      after: container.scrollTop,

      remaining: Math.max(
        0,
        container.scrollHeight -
        container.clientHeight -
        container.scrollTop
      )
    };
  });

  return {
    before: panel.before,
    after: after.after,
    remaining: after.remaining,
    method: 'search-mouse-wheel'
  };
}

// ======================================================
// 單一店家爬取
// ======================================================

async function scrapeOneStore(
  page,
  storeConfig,
  maxRounds
) {
  console.log(
    `➡️ 開始抓取：${storeConfig.brand} ${storeConfig.store}`
  );

  const query =
    encodeURIComponent(
      storeConfig.keyword
    );

  const searchUrl =
    `https://www.google.com/search?q=${query}&hl=zh-TW&gl=TW`;

  console.log(
    '🔍 Google 搜尋:',
    storeConfig.keyword
  );

  await page.goto(
    searchUrl,
    {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    }
  );

  await randomDelay(2500, 4000);

  // 記錄 GitHub 與本機實際看到的 Google 頁面
  await logSearchPageDiagnostics(
    page,
    storeConfig
  );

  const storeRating =
    await extractStoreRating(page);

  console.log(
    '⭐ 店家平均星等:',
    storeRating || '未找到'
  );

  // 直接從搜尋結果頁進入評論
  if (!(await openFullReviews(page))) {
    console.warn(
      '❌ 搜尋頁評論沒有成功開啟，本店略過'
    );

    return [];
  }

  // 直接點「最新」，不先點「排序」
  await clickNewestSort(page);

  const reviewMap = new Map();

  const stableLimit =
    maxRounds > 5 ? 5 : 3;

  let stable = 0;

  console.log(
    `🔁 本店評論滑動輪數：${maxRounds}`
  );

  for (
    let round = 0;
    round < maxRounds;
    round++
  ) {
    const before =
      reviewMap.size;

    // 展開可見評論全文
    const expanded =
      await expandCurrentMore(page);

    if (expanded > 0) {
      await randomDelay(400, 700);
    }

    await collectCurrentReviews(
      page,
      reviewMap
    );

    const gained =
      reviewMap.size - before;

    console.log(
      `🌀 第 ${round + 1}/${maxRounds} 輪：展開 ${expanded}，新增 ${gained} 筆，累積 ${reviewMap.size} 筆`
    );

    if (gained === 0) {
      stable++;
    } else {
      stable = 0;
    }

    if (stable >= stableLimit) {
      console.log(
        `🛑 連續 ${stable} 輪沒有新增評論，停止本店`
      );

      break;
    }

    // 使用滑鼠滾輪捲動評論面板
    const scrollResult =
      await scrollSearchReviewPanel(page);

    console.log(
      '⬇️ 搜尋結果滑鼠捲動:',
      scrollResult
    );

    // 捲動後再擷取一次
    await collectCurrentReviews(
      page,
      reviewMap
    );
  }

  // 最後再收集目前畫面的評論
  await expandCurrentMore(page);

  await collectCurrentReviews(
    page,
    reviewMap
  );

  const reviews =
    Array.from(
      reviewMap.values()
    );

  reviews.forEach(review => {
    review.brand =
      storeConfig.brand;

    review.store =
      storeConfig.store;

    review.branch =
      storeConfig.branch;

    review.storeRating =
      storeRating;

    review.averageRating =
      storeRating;
  });

  console.log(
    `✅ ${storeConfig.brand} ${storeConfig.store} 完成：${reviews.length} 筆`
  );

  return reviews;
}

// ======================================================
// 主程式
// 相容 Windows 與 GitHub Actions
// ======================================================

async function scrapeGoogleReviews(
  retryCount = 0
) {
  let browser;

  try {
    console.log(
      '➡️ 啟動 Chrome...'
    );

    const isCloud =
      isCloudEnv();

    const chromePath =
      getChromeExecutablePath(
        isCloud
      );

    console.log(
      '☁️ isCloud:',
      isCloud
    );

    console.log(
      '🧭 Chrome executablePath:',
      chromePath || '使用 Puppeteer 預設'
    );

    const profileDir =
      process.env.GOOGLE_PROFILE_DIR ||
      path.join(
        __dirname,
        'chrome-google-profile'
      );

    browser = await puppeteer.launch({
      headless:
        isCloud ? 'new' : false,

      protocolTimeout:
        600000,

      executablePath:
        chromePath,

      // 本機保存登入設定檔
      // GitHub Actions 不使用本機設定檔
      ...(
        !isCloud
          ? {
              userDataDir:
                profileDir
            }
          : {}
      ),

      defaultViewport:
        isCloud
          ? {
              width: 1366,
              height: 768
            }
          : null,

      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1366,768',
        '--lang=zh-TW',
        '--accept-lang=zh-TW,zh,en-US,en'
      ]
    });

    const page =
      (
        await browser.pages()
      )[0] ||
      await browser.newPage();

    await page.setExtraHTTPHeaders({
      'Accept-Language':
        'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
    });

    const maxRounds =
      getMaxRounds();

    const targetBrand =
      process.env.SCRAPE_TARGET_BRAND ||
      'all';

    const targetStore =
      process.env.SCRAPE_TARGET_STORE ||
      'all';

    const targetStores =
      STORES.filter(storeConfig => {
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
      });

    console.log(
      '🎯 本次同步目標:',
      targetBrand,
      targetStore
    );

    console.log(
      '🎯 本次店家數:',
      targetStores.length
    );

    console.log(
      '🔁 評論滑動輪數:',
      maxRounds
    );

    const allReviews = [];

    for (const storeConfig of targetStores) {
      try {
        const reviews =
          await scrapeOneStore(
            page,
            storeConfig,
            maxRounds
          );

        // 第一間店只取得 3 筆時，重新啟動一次 Chrome
        if (
          allReviews.length === 0 &&
          reviews.length === 3 &&
          retryCount < 1
        ) {
          console.warn(
            '⚠️ 第一間店只有 3 筆，重新啟動 Chrome 重試一次'
          );

          await browser.close().catch(
            () => {}
          );

          browser = null;

          return await scrapeGoogleReviews(
            retryCount + 1
          );
        }

        allReviews.push(
          ...reviews
        );
      } catch (error) {
        console.error(
          `❌ ${storeConfig.brand} ${storeConfig.store} 抓取失敗:`,
          error.message
        );
      }

      await randomDelay(
        3000,
        5000
      );
    }

    console.log(
      `✅ 全部店家合計抓到 ${allReviews.length} 筆評論`
    );

    return allReviews;
  } catch (error) {
    console.error(
      '❌ 爬蟲發生錯誤:',
      error
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

// ======================================================
// 保留原本匯出格式
// ======================================================

module.exports = scrapeGoogleReviews;
