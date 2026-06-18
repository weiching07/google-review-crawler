const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const STORES = require('./stores');

puppeteer.use(StealthPlugin());

const randomDelay = (min, max) =>
  new Promise(resolve =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min)
  );

function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    )
  ]);
}

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

  // ✅ 快速同步維持 5
  if (value <= 5) {
    return Math.floor(value);
  }

  // ✅ 完整同步原本常用 999，這裡統一拉到 2000
  if (value >= 999) {
    return 2000;
  }

  // ✅ 其他手動輸入最多也不超過 2000
  return Math.min(Math.floor(value), 2000);
}

function getReviewKey(review) {
  return (
    review.reviewId ||
    review.id ||
    `${review.author || ''}-${review.date || ''}-${review.rating || ''}-${String(review.content || '').slice(0, 120)}`
  );
}

async function extractStoreRating(page) {
  return await page.evaluate(() => {
    function clean(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
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
      return Number.isFinite(n) && n >= 1 && n <= 5 && String(value).includes('.');
    }

    const ratingBlocks = Array.from(document.querySelectorAll('.F7nice'));

    for (const block of ratingBlocks) {
      if (!isVisible(block)) continue;

      const items = Array.from(block.querySelectorAll('span, div'));

      for (const el of items) {
        if (!isVisible(el)) continue;

        const text = clean(el.innerText || el.textContent || '');
        const match = text.match(/^([1-5]\.\d)$/);

        if (match && isValidAverageRating(match[1])) {
          return match[1];
        }
      }

      const blockText = clean(block.innerText || block.textContent || '');
      const blockMatch = blockText.match(/\b([1-5]\.\d)\b/);

      if (blockMatch && isValidAverageRating(blockMatch[1])) {
        return blockMatch[1];
      }
    }

    const visibleElements = Array.from(document.querySelectorAll('span, div'))
      .filter(isVisible);

    for (const el of visibleElements) {
      const text = clean(el.innerText || el.textContent || '');
      const match = text.match(/^([1-5]\.\d)$/);

      if (match && isValidAverageRating(match[1])) {
        return match[1];
      }
    }

    for (const el of visibleElements) {
      const aria = clean(el.getAttribute('aria-label') || '');
      const title = clean(el.getAttribute('title') || '');
      const source = `${aria} ${title}`;

      const match = source.match(/([1-5]\.\d)\s*(?:星|顆星|stars?)/i);

      if (match && isValidAverageRating(match[1])) {
        return match[1];
      }
    }

    return '';
  });
}

// ✅ 保留你原本可用的最新排序版本
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

        if (/^由\s*Google\s*提供翻譯/i.test(line)) break;
        if (/^查看原文/i.test(line)) break;
        if (/^餐點[:：]|^服務[:：]|^氣氛[:：]/.test(line)) break;
        if (/^\d+\s*星$/.test(line)) break;
        if (/在地嚮導/.test(line) && /則評論|張相片/.test(line)) break;
        if (/^排序$|^最相關$|^最新$|^評論$/i.test(line)) break;

        replyLines.push(line);
      }

      const replyContent = cleanReplyText(replyLines.join('\n'));

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

    if (!key) {
      return;
    }

    if (!reviewMap.has(key)) {
      reviewMap.set(key, r);
    } else {
      const old = reviewMap.get(key);

      reviewMap.set(key, {
        ...old,
        ...r,
        hasReply: Boolean(r.replyContent || old.replyContent),
        replyContent: r.replyContent || old.replyContent || '',
        replyDate: r.replyDate || old.replyDate || ''
      });
    }
  });

  return current.length;
}

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

async function jsWheelFallbackScroll(page, totalReviews = 0) {
  try {
    const result = await withTimeout(
      page.evaluate(async (totalReviews) => {
        function sleep(ms) {
          return new Promise(resolve => setTimeout(resolve, ms));
        }

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

        function findReviewContainer() {
          let container =
            document.querySelector('div[role="feed"]') ||
            document.querySelector('.m6U62c');

          if (isScrollable(container)) {
            return container;
          }

          const firstReview = document.querySelector('div[data-review-id]');

          if (firstReview) {
            let p = firstReview.parentElement;

            while (p && p !== document.body) {
              if (isScrollable(p)) {
                return p;
              }

              p = p.parentElement;
            }
          }

          const candidates = Array.from(document.querySelectorAll('div'))
            .filter(isScrollable)
            .map(el => {
              const r = el.getBoundingClientRect();

              return {
                el,
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight
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
              return b.scrollHeight - a.scrollHeight;
            });

          if (candidates.length > 0) {
            return candidates[0].el;
          }

          return null;
        }

        const container = findReviewContainer();

        if (!container) {
          const before = window.scrollY;

          window.scrollBy(0, 1200);

          await sleep(1800);

          return {
            success: false,
            before,
            after: window.scrollY,
            height: document.documentElement.scrollHeight || 0,
            clientHeight: window.innerHeight || 0,
            remaining: -1,
            timeout: false,
            method: 'window-js-fallback'
          };
        }

        const before = container.scrollTop;

        const step = 900;
        const times = 4;
        const delay = 900;

        for (let i = 0; i < times; i++) {
          container.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY: step,
              deltaMode: 0,
              bubbles: true,
              cancelable: true,
              view: window
            })
          );

          container.scrollTop += step;

          container.dispatchEvent(new Event('scroll', { bubbles: true }));

          await sleep(delay);
        }

        await sleep(3000);

        const after = container.scrollTop;
        const remaining = Math.max(0, container.scrollHeight - container.clientHeight - after);

        return {
          success: true,
          before,
          after,
          height: container.scrollHeight,
          clientHeight: container.clientHeight,
          remaining,
          timeout: false,
          method: 'js-fallback-1000'
        };
      }, totalReviews),
      25000,
      'jsWheelFallbackScroll'
    );

    return result;
  } catch (err) {
    console.warn('⚠️ JS fallback 捲動失敗:', err.message);

    return {
      success: false,
      before: -1,
      after: -1,
      height: -1,
      clientHeight: -1,
      remaining: -1,
      timeout: true,
      method: 'js-fallback-timeout'
    };
  }
}

async function hardWakeReviewList(page, stableCount = 0, totalReviews = 0) {
  console.log(`🛠️ hard wake 啟動：已連續 ${stableCount} 輪沒新增，目前 ${totalReviews} 筆`);

  try {
    const result = await withTimeout(
      page.evaluate(async () => {
        function sleep(ms) {
          return new Promise(resolve => setTimeout(resolve, ms));
        }

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

        function findReviewContainer() {
          let container =
            document.querySelector('div[role="feed"]') ||
            document.querySelector('.m6U62c');

          if (isScrollable(container)) {
            return container;
          }

          const firstReview = document.querySelector('div[data-review-id]');

          if (firstReview) {
            let p = firstReview.parentElement;

            while (p && p !== document.body) {
              if (isScrollable(p)) {
                return p;
              }

              p = p.parentElement;
            }
          }

          const candidates = Array.from(document.querySelectorAll('div'))
            .filter(isScrollable)
            .map(el => {
              const r = el.getBoundingClientRect();

              return {
                el,
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight
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
              return b.scrollHeight - a.scrollHeight;
            });

          return candidates.length > 0 ? candidates[0].el : null;
        }

        const container = findReviewContainer();

        if (!container) {
          return {
            success: false,
            before: -1,
            after: -1,
            height: -1,
            clientHeight: -1,
            remaining: -1,
            method: 'hard-wake-no-container'
          };
        }

        const before = container.scrollTop;

        // 先小幅往上退，讓 Google 虛擬列表重新渲染
        container.scrollTop = Math.max(0, container.scrollTop - 12000);
        container.dispatchEvent(new Event('scroll', { bubbles: true }));
        await sleep(2500);

        // 再往下推
        for (let i = 0; i < 5; i++) {
          container.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY: 1800,
              deltaMode: 0,
              bubbles: true,
              cancelable: true,
              view: window
            })
          );

          container.scrollTop += 1800;
          container.dispatchEvent(new Event('scroll', { bubbles: true }));

          await sleep(1200);
        }

        await sleep(5000);

        const after = container.scrollTop;
        const remaining = Math.max(0, container.scrollHeight - container.clientHeight - after);

        return {
          success: true,
          before,
          after,
          height: container.scrollHeight,
          clientHeight: container.clientHeight,
          remaining,
          method: 'hard-wake-up-down'
        };
      }),
      35000,
      'hardWakeReviewList'
    );

    console.log(`🛠️ hard wake 結果 top=${result.before}->${result.after} remaining=${result.remaining} ${result.method}`);

    return result;
  } catch (err) {
    console.warn('⚠️ hard wake 失敗:', err.message);

    return {
      success: false,
      before: -1,
      after: -1,
      height: -1,
      clientHeight: -1,
      remaining: -1,
      method: 'hard-wake-timeout'
    };
  }
}

async function fastScrollReviews(page, totalReviews = 0, forceMouse = false) {
  // ✅ 1000 筆以上：平常用 JS fallback；連續 10 輪沒新增時 forceMouse=true，強制 mouse probe
  if (totalReviews >= 1000 && !forceMouse) {
    return await jsWheelFallbackScroll(page, totalReviews);
  }

  try {
    const box = await withTimeout(
      getReviewScrollBox(page),
      10000,
      'getReviewScrollBox'
    );

    if (!box) {
      console.log("⚠️ 找不到評論捲動容器，改用 JS fallback");
      return await jsWheelFallbackScroll(page, totalReviews);
    }

    const before = box.top;

    try {
      await page.mouse.move(box.x, box.y);
    } catch (err) {
      console.warn('⚠️ mouse.move 失敗，略過 move 直接 wheel:', err.message);
    }

    let wheelTimes = 6;
    let deltaY = 2200;
    let wheelDelayMin = 200;
    let wheelDelayMax = 350;
    let afterDelayMin = 900;
    let afterDelayMax = 1300;
    let method = 'mouse-wheel-fast';

    if (totalReviews >= 1000) {
      wheelTimes = 2;
      deltaY = 1200;
      wheelDelayMin = 1200;
      wheelDelayMax = 1800;
      afterDelayMin = 5000;
      afterDelayMax = 7000;
      method = 'mouse-wheel-probe-1000';
    }

    if (totalReviews >= 1500) {
      wheelTimes = 1;
      deltaY = 900;
      wheelDelayMin = 1800;
      wheelDelayMax = 2500;
      afterDelayMin = 7000;
      afterDelayMax = 10000;
      method = 'mouse-wheel-probe-1500';
    }

    for (let i = 0; i < wheelTimes; i++) {
      try {
        await page.mouse.wheel({
          deltaY
        });
      } catch (err) {
        console.warn('⚠️ mouse.wheel 失敗，等待 20 秒後改回 JS fallback:', err.message);

        await randomDelay(20000, 22000);

        return await jsWheelFallbackScroll(page, totalReviews);
      }

      await randomDelay(wheelDelayMin, wheelDelayMax);
    }

    await randomDelay(afterDelayMin, afterDelayMax);

    const afterBox = await withTimeout(
      getReviewScrollBox(page),
      10000,
      'getReviewScrollBox after'
    );

    const after = afterBox ? afterBox.top : before;
    const height = afterBox ? afterBox.height : -1;
    const clientHeight = afterBox ? afterBox.clientHeight : -1;
    const remaining =
      afterBox && after >= 0
        ? Math.max(0, afterBox.height - afterBox.clientHeight - after)
        : -1;

    if (after >= 0 && before >= 0 && after < before - 50000) {
      console.warn(`⚠️ 捲軸疑似跳回前面 ${before}->${after}，等待 20 秒後改用 JS fallback`);

      await randomDelay(20000, 22000);

      return await jsWheelFallbackScroll(page, totalReviews);
    }

    return {
      success: true,
      before,
      after,
      height,
      clientHeight,
      remaining,
      timeout: false,
      method
    };

  } catch (err) {
    console.warn('⚠️ fastScrollReviews 失敗，等待 20 秒後改用 JS fallback:', err.message);

    await randomDelay(20000, 22000);

    return await jsWheelFallbackScroll(page, totalReviews);
  }
}

async function fastLoadAndCollectReviews(page, maxRounds = 30) {
  console.log("➡️ 開始快速載入並抓評論...");

  const reviewMap = new Map();

  let stableCount = 0;
  let noMoveCount = 0;
  let timeoutCount = 0;
  let lastTotal = 0;
  let completedByBottom = false;
  let lastRemaining = -1;

  for (let round = 0; round < maxRounds; round++) {
    const beforeTotal = reviewMap.size;

    const beforeExpandCount = await collectCurrentReviews(page, reviewMap);

    const expanded = await expandCurrentMore(page);

    if (expanded > 0) {
      await randomDelay(700, 1000);
    }

    const afterExpandCount = await collectCurrentReviews(page, reviewMap);

    const afterTotal = reviewMap.size;
    const gained = afterTotal - beforeTotal;

    console.log(
      `🌀 批次 ${round + 1}/${maxRounds}，畫面 ${beforeExpandCount}->${afterExpandCount}，展開 ${expanded}，累積 ${reviewMap.size}`
    );

    if (reviewMap.size === lastTotal) {
      stableCount++;
    } else {
      stableCount = 0;
      lastTotal = reviewMap.size;
    }

    const forceMouse =
      reviewMap.size >= 1000 &&
      stableCount > 0 &&
      stableCount % 10 === 0;

    if (forceMouse) {
      console.log(`🧪 已連續 ${stableCount} 輪沒新增，強制用 mouse-wheel probe 觸發載入`);
    }

    const scrollResult = await fastScrollReviews(page, reviewMap.size, forceMouse);

    if (typeof scrollResult.remaining === 'number') {
      lastRemaining = scrollResult.remaining;
    }

    console.log(
      `⬇️ 快速滾動 top=${scrollResult.before}->${scrollResult.after}${scrollResult.timeout ? ' timeout' : ''} ${scrollResult.method || ''}${scrollResult.remaining >= 0 ? ` remaining=${scrollResult.remaining}` : ''}`
    );

    const moved =
      scrollResult.before >= 0 &&
      scrollResult.after >= 0 &&
      scrollResult.after !== scrollResult.before;

    if (scrollResult.timeout) {
      timeoutCount++;
    } else {
      timeoutCount = 0;
    }

    if (moved) {
      noMoveCount = 0;
    } else {
      noMoveCount++;
    }

    if (gained > 0) {
      console.log(`✅ 本輪新增 ${gained} 筆，目前累積 ${reviewMap.size}`);
    }

    if (stableCount >= 5) {
      console.log(`⚠️ 已連續 ${stableCount} 輪評論沒有新增，但不停止，繼續往下拉`);
    }

    // ✅ 完成偵測：真的接近容器底部，而且多輪沒新增、捲軸也不動，才判定爬完
    const nearBottom =
      typeof scrollResult.remaining === 'number' &&
      scrollResult.remaining >= 0 &&
      scrollResult.remaining <= 2500;

    if (nearBottom && stableCount >= 15 && noMoveCount >= 2) {
      console.log(`🧪 疑似到底：remaining=${scrollResult.remaining}，stable=${stableCount}，noMove=${noMoveCount}，啟動最後確認`);

      await hardWakeReviewList(page, stableCount, reviewMap.size);
      await randomDelay(8000, 12000);

      const beforeConfirmTotal = reviewMap.size;
      const confirmVisible = await collectCurrentReviews(page, reviewMap);
      const afterConfirmTotal = reviewMap.size;
      const confirmBox = await getReviewScrollBox(page).catch(() => null);
      const confirmRemaining =
        confirmBox && confirmBox.top >= 0
          ? Math.max(0, confirmBox.height - confirmBox.clientHeight - confirmBox.top)
          : -1;

      console.log(
        `🧪 到底確認：畫面 ${confirmVisible}，新增 ${afterConfirmTotal - beforeConfirmTotal}，remaining=${confirmRemaining}`
      );

      if (afterConfirmTotal === beforeConfirmTotal && confirmRemaining >= 0 && confirmRemaining <= 3000) {
        completedByBottom = true;
        console.log(`✅ 判定已滑到評論列表底部，停止。總計 ${reviewMap.size} 筆`);
        break;
      }
    }

    // ✅ 停滯處理：避免同一位置空滑 70 幾輪
    if (reviewMap.size >= 1000 && stableCount > 0 && stableCount % 20 === 0) {
      console.log(`⏳ ${reviewMap.size} 筆後已連續 ${stableCount} 輪沒新增，等待 25~40 秒讓 Google 載入`);

      await randomDelay(25000, 40000);

      try {
        await page.keyboard.press('PageDown');
        await randomDelay(1500, 2500);
      } catch {}
    }

    if (reviewMap.size >= 1000 && stableCount > 0 && stableCount % 30 === 0) {
      await hardWakeReviewList(page, stableCount, reviewMap.size);
    }

    if (reviewMap.size >= 1000 && stableCount > 0 && stableCount % 50 === 0) {
      console.log(`🧊 已連續 ${stableCount} 輪沒新增，長等待 60~75 秒`);

      await randomDelay(60000, 75000);
    }

    if (reviewMap.size >= 1000 && stableCount > 0 && stableCount % 70 === 0) {
      console.log(`🧪 已連續 ${stableCount} 輪沒新增，強制 mouse probe + PageDown`);

      try {
        await page.keyboard.press('PageDown');
        await randomDelay(2000, 3000);
      } catch {}

      await fastScrollReviews(page, reviewMap.size, true);
    }

    const waitThreshold = reviewMap.size >= 1000 ? 2 : 3;

    if (noMoveCount >= waitThreshold) {
      console.log(`⏳ 目前 ${reviewMap.size} 筆，捲軸連續 ${noMoveCount} 次沒變，等待後繼續拉`);

      if (reviewMap.size >= 1000) {
        await randomDelay(10000, 15000);
      } else {
        await randomDelay(8000, 12000);
      }

      try {
        await page.keyboard.press('PageDown');
        await randomDelay(1200, 1800);
      } catch {}

      noMoveCount = 0;
    }

    if (timeoutCount >= 2) {
      console.log(`⏳ 連續 timeout ${timeoutCount} 次，等待 15~25 秒後繼續`);

      await randomDelay(15000, 25000);

      timeoutCount = 0;
    }

    await randomDelay(1000, 1500);
  }

  const reviews = Array.from(reviewMap.values());

  if (!completedByBottom && reviews.length > 0) {
    console.log(`⚠️ 已跑完滑動輪數或被流程中斷，未明確偵測到底。最後 remaining=${lastRemaining}`);
  }

  console.log(`✅ 抓到 ${reviews.length} 筆評論`);

  if (reviews.length > 0) {
    console.log("✅ 第一筆範例:", reviews[0]);
  }

  return reviews;
}

async function scrapeOneStore(page, storeConfig, maxRounds) {
  console.log(`➡️ 開始抓取：${storeConfig.brand} ${storeConfig.store}`);

  console.log("➡️ 前往 Google...");
  await page.goto('https://www.google.com.tw/?hl=zh-TW', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  await randomDelay(2000, 3000);

  console.log(`🔍 搜尋 ${storeConfig.keyword}...`);

  const searchBox = 'textarea[name="q"], input[name="q"]';

  await page.waitForSelector(searchBox, {
    timeout: 30000
  });

  await page.click(searchBox, { clickCount: 3 });
  await page.keyboard.press('Backspace');

  for (const char of storeConfig.keyword) {
    await page.type(searchBox, char);
    await randomDelay(100, 200);
  }

  await page.keyboard.press('Enter');
  await randomDelay(5000, 6000);

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

    await page.goto(storeConfig.fallbackUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
  }

  await randomDelay(8000, 10000);

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

  await clickNewestSort(page);

  const storeRating = await extractStoreRating(page);

  console.log(`⭐ ${storeConfig.brand} ${storeConfig.store} 平均星等:`, storeRating || "未抓到");
  console.log("🔁 本次評論滑動輪數:", maxRounds);

  const reviews = await fastLoadAndCollectReviews(page, maxRounds);

  reviews.forEach(review => {
    review.brand = storeConfig.brand;
    review.store = storeConfig.store;
    review.branch = storeConfig.branch;
    review.storeRating = storeRating;
    review.averageRating = storeRating;
  });

  console.log(`✅ ${storeConfig.brand} ${storeConfig.store} 完成：${reviews.length} 筆`);

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
      protocolTimeout: 600000,
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

    const maxRounds = getMaxRounds();
    const allReviews = [];

    const targetBrand = process.env.SCRAPE_TARGET_BRAND || 'all';
    const targetStore = process.env.SCRAPE_TARGET_STORE || 'all';

    const targetStores = STORES.filter(storeConfig => {
      const brandMatched =
        targetBrand === 'all' ||
        storeConfig.brand === targetBrand;

      const storeMatched =
        targetStore === 'all' ||
        storeConfig.store === targetStore;

      return brandMatched && storeMatched;
    });

    console.log("🎯 本次同步目標:", targetBrand, targetStore);
    console.log("🎯 本次店家數:", targetStores.length);

    for (const storeConfig of targetStores) {
      try {
        const reviews = await scrapeOneStore(page, storeConfig, maxRounds);
        allReviews.push(...reviews);
      } catch (err) {
        console.error(`❌ ${storeConfig.brand} ${storeConfig.store} 抓取失敗:`, err.message);
      }

      await randomDelay(3000, 5000);
    }

    console.log(`✅ 全部店家合計抓到 ${allReviews.length} 筆評論`);

    return allReviews;
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