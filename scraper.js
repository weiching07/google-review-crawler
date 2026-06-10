const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const randomDelay = (min, max) =>
  new Promise(r =>
    setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min)
  );

function isCloudEnv() {
  return (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.GITHUB_ACTIONS) ||
    Boolean(process.env.CI)
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

  return Math.floor(value);
}

// ✅ 切換「最新排序」：維持你現在成功的版本
async function clickNewestSort(page) {
  console.log("🔃 嘗試切換最新排序...");

  await randomDelay(1000, 1500);

  await page.evaluate(() => {
    let container =
      document.querySelector('div[role="feed"]') ||
      document.querySelector('.m6U62c');

    if (!container) {
      const firstReview = document.querySelector('div[data-review-id]');

      if (firstReview) {
        let p = firstReview.parentElement;

        while (p) {
          const style = window.getComputedStyle(p);

          if (
            p.scrollHeight > p.clientHeight &&
            ['auto', 'scroll', 'overlay'].includes(style.overflowY)
          ) {
            container = p;
            break;
          }

          p = p.parentElement;
        }
      }
    }

    if (container) {
      container.scrollTop = 0;
    }
  });

  await randomDelay(1200, 1800);

  const sortResult = await page.evaluate(() => {
    function getText(el) {
      return (
        (el.innerText || '') +
        ' ' +
        (el.textContent || '') +
        ' ' +
        (el.getAttribute('aria-label') || '') +
        ' ' +
        (el.getAttribute('title') || '')
      ).replace(/\s+/g, ' ').trim();
    }

    function isVisible(el) {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);

      return (
        r.width > 0 &&
        r.height > 0 &&
        s.display !== 'none' &&
        s.visibility !== 'hidden'
      );
    }

    const elements = Array.from(document.querySelectorAll(
      'button, div[role="button"], [aria-haspopup="menu"]'
    ));

    const candidates = [];

    for (const el of elements) {
      if (!isVisible(el)) continue;

      const text = getText(el);
      const lower = text.toLowerCase();

      if (
        text.includes('排序') ||
        text.includes('最相關') ||
        lower.includes('sort') ||
        lower.includes('most relevant')
      ) {
        const r = el.getBoundingClientRect();

        candidates.push({
          el,
          text,
          top: r.top,
          left: r.left
        });
      }
    }

    candidates.sort((a, b) => {
      if (a.top !== b.top) return a.top - b.top;
      return a.left - b.left;
    });

    if (candidates.length === 0) {
      return {
        success: false,
        text: ''
      };
    }

    const target = candidates[0];

    target.el.scrollIntoView({
      block: 'center',
      inline: 'center'
    });

    target.el.click();

    return {
      success: true,
      text: target.text
    };
  });

  console.log("🔃 sort result:", sortResult);

  if (!sortResult.success) {
    console.log("❌ 找不到排序按鈕");
    return false;
  }

  await randomDelay(1500, 2200);

  const newestResult = await page.evaluate(() => {
    function getText(el) {
      return (
        (el.innerText || '') +
        ' ' +
        (el.textContent || '') +
        ' ' +
        (el.getAttribute('aria-label') || '') +
        ' ' +
        (el.getAttribute('title') || '')
      ).replace(/\s+/g, ' ').trim();
    }

    function isVisible(el) {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);

      return (
        r.width > 0 &&
        r.height > 0 &&
        r.top >= 0 &&
        r.left >= 0 &&
        r.top < window.innerHeight &&
        r.left < window.innerWidth &&
        s.display !== 'none' &&
        s.visibility !== 'hidden'
      );
    }

    const menuRoots = Array.from(document.querySelectorAll(
      '[role="menu"], [role="listbox"], [role="presentation"], div[aria-modal="true"]'
    )).filter(isVisible);

    const roots = menuRoots.length > 0 ? menuRoots : [document.body];

    for (const root of roots) {
      const items = Array.from(root.querySelectorAll(
        '[role="menuitem"], [role="menuitemradio"], [role="option"], button, div[role="button"], div, span'
      ));

      for (const item of items) {
        if (!isVisible(item)) continue;

        const text = getText(item);

        if (text !== '最新') continue;

        let clickable = item;
        let p = item.parentElement;

        while (p && p !== document.body) {
          const role = p.getAttribute('role') || '';
          const tag = p.tagName.toLowerCase();

          if (
            tag === 'button' ||
            role === 'menuitem' ||
            role === 'menuitemradio' ||
            role === 'option' ||
            role === 'button'
          ) {
            clickable = p;
            break;
          }

          p = p.parentElement;
        }

        clickable.scrollIntoView({
          block: 'center',
          inline: 'center'
        });

        clickable.click();

        return {
          success: true,
          text
        };
      }
    }

    return {
      success: false,
      text: ''
    };
  });

  console.log("🆕 newest result:", newestResult);

  if (!newestResult.success) {
    console.log("⚠️ DOM 沒點到最新，改用鍵盤備援");

    await page.keyboard.press('ArrowDown');
    await randomDelay(300, 500);
    await page.keyboard.press('Enter');

    await randomDelay(5000, 7000);

    console.log("✅ 已用鍵盤備援選最新");
    return true;
  }

  await randomDelay(5000, 7000);

  console.log("✅ 已切換最新排序");
  return true;
}

// ✅ 找評論容器座標，給 mouse.wheel 用
async function getReviewScrollBox(page) {
  return await page.evaluate(() => {
    function isScrollable(el) {
      if (!el) return false;

      const s = window.getComputedStyle(el);

      return (
        el.scrollHeight > el.clientHeight + 100 &&
        s.display !== 'none' &&
        s.visibility !== 'hidden' &&
        s.overflowY !== 'hidden'
      );
    }

    let container =
      document.querySelector('div[role="feed"]') ||
      document.querySelector('.m6U62c');

    if (!isScrollable(container)) {
      container = null;
    }

    if (!container) {
      const firstReview = document.querySelector('div[data-review-id]');

      if (firstReview) {
        let p = firstReview.parentElement;

        while (p && p !== document.body) {
          if (isScrollable(p)) {
            container = p;
            break;
          }

          p = p.parentElement;
        }
      }
    }

    if (!container) {
      const divs = Array.from(document.querySelectorAll('div'));

      const candidates = divs
        .filter(isScrollable)
        .map(el => {
          const r = el.getBoundingClientRect();

          return {
            el,
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height
          };
        })
        .filter(x => {
          return (
            x.width > 260 &&
            x.height > 300 &&
            x.left < window.innerWidth * 0.75
          );
        })
        .sort((a, b) => {
          if (a.left !== b.left) return a.left - b.left;
          return b.height - a.height;
        });

      if (candidates.length > 0) {
        container = candidates[0].el;
      }
    }

    if (!container) {
      return null;
    }

    const r = container.getBoundingClientRect();

    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      top: container.scrollTop,
      height: container.scrollHeight,
      clientHeight: container.clientHeight
    };
  });
}

// ✅ 抓目前 DOM 裡已載入的評論
async function collectCurrentReviews(page, reviewMap) {
  const current = await page.evaluate(() => {
    const results = [];
    const reviewEls = Array.from(document.querySelectorAll('div[data-review-id]'));

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

      // ✅ 只抓目前這張評論卡內的文字
      // ❌ 不抓 nextElementSibling
      // ❌ 不抓 parentElement
      const sourceText = String(el.innerText || el.textContent || '')
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

      const startIndex = lines.findIndex(line => REPLY_KEYWORD.test(line));

      if (startIndex === -1) {
        return empty;
      }

      let replyDate = '';
      const replyLines = [];

      const firstLine = lines[startIndex]
        .replace(REPLY_KEYWORD, '')
        .replace(/^[:：]\s*/, '')
        .trim();

      if (firstLine && !isJunkReplyLine(firstLine) && !isReplyDateLine(firstLine)) {
        replyLines.push(firstLine);
      }

      for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];

        if (!line) continue;

        if (!replyDate && isReplyDateLine(line)) {
          replyDate = normalizeText(line);
          continue;
        }

        if (isJunkReplyLine(line)) continue;

        // 離開業主回應區就停止
        if (/^由\s*Google\s*提供翻譯/i.test(line)) break;
        if (/^查看原文/i.test(line)) break;
        if (/^餐點[:：]|^服務[:：]|^氣氛[:：]/.test(line)) break;
        if (/^\d+\s*星$/.test(line)) break;
        if (/在地嚮導/.test(line) && /則評論|張相片/.test(line)) break;

        // 避免吃到 Google Maps UI 字樣
        if (/^排序$|^最相關$|^最新$|^評論$/i.test(line)) break;

        replyLines.push(line);
      }

      const replyContent = cleanReplyText(replyLines.join('\n'));

      // ✅ 一定要真的抓到回覆文字才算已回覆
      // ✅ 不用「謝謝分享」黑名單
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
      const id = el.getAttribute('data-review-id') || `r-${i}`;

      const textEl =
        el.querySelector('.wiI7pd') ||
        el.querySelector('[jsname="fbQN7e"]');

      const ratingEl =
        el.querySelector('[role="img"][aria-label*="星"]') ||
        el.querySelector('[role="img"][aria-label*="star"]') ||
        el.querySelector('[role="img"]');

      const authorEl =
        el.querySelector('.d4r55') ||
        el.querySelector('.TSUbDb');

      const dateEl =
        el.querySelector('.rsqaWe') ||
        el.querySelector('.xRkPPb') ||
        Array.from(el.querySelectorAll('span')).find(s => {
          const t = (s.innerText || '').trim();

          return /剛剛|分鐘前|小時前|天前|週前|個月前|年前|分鐘|小時|天|週|個月|年|minute|hour|day|week|month|year/i.test(t);
        });

      const content = textEl ? textEl.innerText.trim() : '';
      const author = authorEl ? authorEl.innerText.trim() : '';
      const date = dateEl ? dateEl.innerText.trim() : '';

      let rating = 5;

      if (ratingEl) {
        const m = ratingEl.getAttribute('aria-label')?.match(/\d/);
        if (m) rating = parseInt(m[0], 10);
      }

      if (
        content &&
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

          // 店家 / 業主回應
          hasReply: replyData.hasReply,
          replyContent: replyData.replyContent,
          replyDate: replyData.replyDate
        });
      }
    });

    return results;
  });

  current.forEach(r => {
    const key = r.reviewId || `${r.author}-${r.date}-${r.content}`;

    if (!reviewMap.has(key)) {
      reviewMap.set(key, r);
    } else {
      const old = reviewMap.get(key);

      // ✅ 同一輪重複抓到同一張評論時，以最新 DOM 結果為準
      // ❌ 不用 old.replyContent 補回來
      reviewMap.set(key, {
        ...old,
        ...r,
        hasReply: Boolean(r.replyContent),
        replyContent: r.replyContent || '',
        replyDate: r.replyDate || ''
      });
    }
  });

  return current.length;
}

// ✅ 展開目前畫面評論全文，只點評論卡裡的更多
async function expandCurrentMore(page) {
  const count = await page.evaluate(() => {
    const reviewEls = Array.from(document.querySelectorAll('div[data-review-id]'));
    let count = 0;

    reviewEls.forEach(review => {
      const buttons = Array.from(review.querySelectorAll('button'));

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

// ✅ 快速滾動下一批評論
async function fastScrollReviews(page) {
  const box = await getReviewScrollBox(page);

  if (!box) {
    await page.mouse.wheel({
      deltaY: 3000
    });

    return {
      success: false,
      before: 0,
      after: 0
    };
  }

  await page.mouse.move(box.x, box.y);

  const before = box.top;

  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel({
      deltaY: 2200
    });

    await randomDelay(200, 350);
  }

  await randomDelay(700, 1000);

  const afterBox = await getReviewScrollBox(page);

  return {
    success: true,
    before,
    after: afterBox ? afterBox.top : before
  };
}

// ✅ 快速載入 + 邊抓邊存
async function fastLoadAndCollectReviews(page, maxRounds = 30) {
  console.log("➡️ 開始快速載入並抓評論...");

  const reviewMap = new Map();

  let stableCount = 0;
  let lastTotal = 0;

  for (let round = 0; round < maxRounds; round++) {
    const beforeExpandCount = await collectCurrentReviews(page, reviewMap);

    const expanded = await expandCurrentMore(page);

    if (expanded > 0) {
      await randomDelay(700, 1000);
    }

    const afterExpandCount = await collectCurrentReviews(page, reviewMap);

    console.log(
      `🌀 批次 ${round + 1}/${maxRounds}，畫面 ${beforeExpandCount}->${afterExpandCount}，展開 ${expanded}，累積 ${reviewMap.size}`
    );

    if (reviewMap.size === lastTotal) {
      stableCount++;
    } else {
      stableCount = 0;
      lastTotal = reviewMap.size;
    }

    if (stableCount >= 5) {
      console.log("✅ 評論沒有再增加，停止");
      break;
    }

    const scrollResult = await fastScrollReviews(page);

    console.log(
      `⬇️ 快速滾動 top=${scrollResult.before}->${scrollResult.after}`
    );

    await randomDelay(1200, 1800);
  }

  const reviews = Array.from(reviewMap.values());

  console.log(`✅ 抓到 ${reviews.length} 筆評論`);

  if (reviews.length > 0) {
    console.log("✅ 第一筆範例:", reviews[0]);
  }

  return reviews;
}

async function scrapeGoogleReviews() {
  let browser;

  try {
    console.log("➡️ 啟動防偵測 Chrome...");

    const isCloud = isCloudEnv();
    const chromePath = getChromeExecutablePath(isCloud);

    console.log("☁️ isCloud:", isCloud);
    console.log("🧭 Chrome executablePath:", chromePath || "使用 Puppeteer 預設");

    browser = await puppeteer.launch({
      headless: isCloud ? 'new' : false,

      executablePath: chromePath,

      defaultViewport: isCloud
        ? { width: 1366, height: 768 }
        : null,

      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1366,768'
      ]
    });

    const page = (await browser.pages())[0] || await browser.newPage();

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // 🚀 Step 1
    console.log("➡️ 前往 Google...");
    await page.goto('https://www.google.com.tw/?hl=zh-TW', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await randomDelay(2000, 3000);

    // 🚀 Step 2
    console.log("🔍 搜尋 LillA 台北...");
    const searchBox = 'textarea[name="q"], input[name="q"]';

    await page.waitForSelector(searchBox, {
      timeout: 30000
    });

    await page.click(searchBox);

    for (const char of 'LillA 台北') {
      await page.type(searchBox, char);
      await randomDelay(100, 200);
    }

    await page.keyboard.press('Enter');
    await randomDelay(5000, 6000);

    // 🚀 Step 3（進地圖）
    console.log("🚀 嘗試進入 Google Maps...");

    const opened = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, button, span'));

      const target = els.find(el => {
        const t = (el.innerText || '').toLowerCase();
        return t.includes('地圖') || t.includes('google 地圖');
      });

      if (target) {
        target.click();
        return true;
      }

      return false;
    });

    if (!opened) {
      console.log("⚠️ 直接開地圖 fallback");

      await page.goto('https://www.google.com/maps/search/LillA', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
    }

    await randomDelay(8000, 10000);

    // 🚀 Step 4（評論按鈕強化版）
    console.log("🎯 找評論按鈕...");

    const tabClicked = await page.evaluate(() => {
      const getText = (el) => {
        return (
          (el.innerText || '') +
          (el.textContent || '') +
          (el.getAttribute('aria-label') || '') +
          (el.getAttribute('title') || '')
        ).toLowerCase();
      };

      const keywords = [
        '評論',
        'reviews',
        '查看評論',
        '查看全部評論'
      ];

      const elements = Array.from(document.querySelectorAll('button, a, div'));

      for (const el of elements) {
        const text = getText(el);

        if (keywords.some(k => text.includes(k))) {
          el.click();
          return true;
        }
      }

      return false;
    });

    console.log("🎯 review tab result:", tabClicked);

    if (tabClicked) {
      await randomDelay(6000, 8000);
    } else {
      console.log("⚠️ 沒點到評論");
    }

    // ✅ 切換最新排序
    await clickNewestSort(page);

    // ✅ 快速載入 + 邊抓邊存
    const maxRounds = getMaxRounds();

    console.log("🔁 本次評論滑動輪數:", maxRounds);

    const reviews = await fastLoadAndCollectReviews(page, maxRounds);

    return reviews;

  } catch (err) {
    console.error("❌ 錯誤:", err);
    return [];
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = scrapeGoogleReviews;