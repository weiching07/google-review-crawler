const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const COMMENTS_FILE = path.join(PUBLIC_DIR, 'comments.json');
const VERSIONS_FILE = path.join(PUBLIC_DIR, 'review-versions.json');

function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    return fallback;
  }

  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));

    if (Array.isArray(fallback) && !Array.isArray(data)) {
      return fallback;
    }

    return data;
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), {
    recursive: true
  });

  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    'utf-8'
  );
}

function text(value) {
  return String(value || '').trim();
}

function isEditedText(value) {
  return /上次編輯|已編輯|edited|last edited/i.test(text(value));
}

function normalizeGroup(value) {
  const raw = String(value || '').trim();

  if (!raw) return 'new-brand';

  const upper = raw.toUpperCase();

  if (raw === 'new-brand' || upper === 'NEW-BRAND') {
    return 'new-brand';
  }

  if (upper === 'TGIF' || upper === 'FRIDAYS') {
    return 'TGIF';
  }

  if (upper === 'TXRH' || upper === 'ROADHOUSE') {
    return 'TXRH';
  }

  return 'new-brand';
}

function getDashboardGroup() {
  return normalizeGroup(process.env.DASHBOARD_GROUP || 'new-brand');
}

function getMaxRounds() {
  const rawValue = process.env.SCRAPE_MAX_ROUNDS;

  console.log('🧪 原始 process.env.SCRAPE_MAX_ROUNDS =', rawValue);

  const value = Number(rawValue || 5);

  if (!Number.isFinite(value) || value <= 0) {
    return 5;
  }

  return Math.floor(value);
}

function getTargetBrand() {
  return String(process.env.SCRAPE_TARGET_BRAND || 'all').trim() || 'all';
}

function getTargetStore() {
  return String(process.env.SCRAPE_TARGET_STORE || 'all').trim() || 'all';
}

function isTargetedStoreSync(targetBrand, targetStore) {
  return targetBrand !== 'all' || targetStore !== 'all';
}

function matchesTargetStore(comment, targetBrand, targetStore) {
  if (!comment) {
    return false;
  }

  const brand = String(comment.brand || '').trim();
  const store = String(comment.store || '').trim();

  const brandMatched =
    targetBrand === 'all' ||
    brand === targetBrand;

  const storeMatched =
    targetStore === 'all' ||
    store === targetStore;

  return brandMatched && storeMatched;
}

function makeKey(r, index) {
  return String(
    r.reviewId ||
    r.id ||
    `${r.author || 'unknown'}-${r.rating || 0}-${text(r.content).slice(0, 60)}-${index}`
  );
}

function makeContentKey(r, index) {
  return `${r.author || 'unknown'}-${r.rating || 0}-${text(r.content).slice(0, 60)}-${index}`;
}

function getAllPossibleKeys(r, index) {
  const keys = [];

  const mainKey = makeKey(r, index);
  const contentKey = makeContentKey(r, index);

  if (mainKey) {
    keys.push(String(mainKey));
  }

  if (r.reviewId) {
    keys.push(String(r.reviewId));
  }

  if (r.id) {
    keys.push(String(r.id));
  }

  if (contentKey) {
    keys.push(String(contentKey));
  }

  return [...new Set(keys.filter(Boolean))];
}

function buildOldMap(oldComments) {
  const map = new Map();

  oldComments.forEach((c, index) => {
    const keys = getAllPossibleKeys(c, index);

    keys.forEach(key => {
      if (key && !map.has(key)) {
        map.set(key, c);
      }
    });
  });

  return map;
}

function findOldComment(oldMap, r, index) {
  const keys = getAllPossibleKeys(r, index);

  for (const key of keys) {
    if (oldMap.has(key)) {
      return oldMap.get(key);
    }
  }

  return null;
}

function markMatchedOld(matchedOldKeys, old) {
  if (!old) {
    return;
  }

  if (old.id) {
    matchedOldKeys.add(String(old.id));
  }

  if (old.reviewId) {
    matchedOldKeys.add(String(old.reviewId));
  }
}

function hasReplyField(r) {
  return Object.prototype.hasOwnProperty.call(r, 'hasReply') ||
    Object.prototype.hasOwnProperty.call(r, 'replyContent') ||
    Object.prototype.hasOwnProperty.call(r, 'replyDate');
}

function getMergedReplyData(r, old) {
  const scraperHasReplyField = hasReplyField(r);

  const newReplyContent = text(r.replyContent);
  const newReplyDate = text(r.replyDate);

  if (scraperHasReplyField) {
    return {
      hasReply: Boolean(newReplyContent),
      replyContent: newReplyContent,
      replyDate: newReplyDate
    };
  }

  return {
    hasReply: Boolean(old?.replyContent),
    replyContent: old?.replyContent || '',
    replyDate: old?.replyDate || ''
  };
}

function findIndexInComments(comments, target, targetIndex) {
  const targetKeys = getAllPossibleKeys(target, targetIndex).map(String);

  return comments.findIndex((item, index) => {
    const itemKeys = getAllPossibleKeys(item, index).map(String);

    return itemKeys.some(key => targetKeys.includes(key));
  });
}

/**
 * 重要：
 * scraper.js 內部會 require('./stores')。
 * 所以這裡必須在 require('./scraper') 之前，
 * 先把 require cache 裡的 stores.js exports 改成該 group 的店家。
 */
function prepareStoresForDashboardGroup(dashboardGroup) {
  const storesPath = require.resolve('./stores');

  delete require.cache[storesPath];

  const allStores = require(storesPath);

  if (!Array.isArray(allStores)) {
    throw new Error('stores.js 必須 export array');
  }

  const filteredStores = allStores.filter(store => {
    return normalizeGroup(store.group || 'new-brand') === dashboardGroup;
  });

  console.log(`🧩 本次資料群組：${dashboardGroup}`);
  console.log(`🏪 stores.js 全部店家數：${allStores.length}`);
  console.log(`🏪 ${dashboardGroup} 群組店家數：${filteredStores.length}`);

  if (filteredStores.length === 0) {
    throw new Error(`找不到 ${dashboardGroup} 群組的店家，請檢查 stores.js 是否有 group: '${dashboardGroup}'`);
  }

  require.cache[storesPath].exports = filteredStores;

  return filteredStores;
}

async function main() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, {
      recursive: true
    });
  }

  const dashboardGroup = getDashboardGroup();
  process.env.DASHBOARD_GROUP = dashboardGroup;

  prepareStoresForDashboardGroup(dashboardGroup);

  const scraperPath = require.resolve('./scraper');
  delete require.cache[scraperPath];

  const scrapeGoogleReviews = require('./scraper');

  const maxRounds = getMaxRounds();

  process.env.SCRAPE_MAX_ROUNDS = String(maxRounds);

  const isPartialSync = maxRounds <= 5;

  const targetBrand = getTargetBrand();
  const targetStore = getTargetStore();
  const targetedStoreSync = isTargetedStoreSync(targetBrand, targetStore);

  console.log('🔥 開始同步 Google 評論...');
  console.log(`🧩 本次 DASHBOARD_GROUP=${dashboardGroup}`);
  console.log(`🔁 本次 sync-static.js 讀到 SCRAPE_MAX_ROUNDS=${maxRounds}`);
  console.log(`🔁 已重新寫入 process.env.SCRAPE_MAX_ROUNDS=${process.env.SCRAPE_MAX_ROUNDS}`);
  console.log(`🎯 本次同步店別目標：${targetBrand} ${targetStore}`);
  console.log(isPartialSync ? '⚡ 快速同步模式：保留舊有評論' : '🧹 完整同步模式：以本次完整資料為準');

  if (targetedStoreSync) {
    console.log('🟡 單店 / 單品牌同步模式：其他店資料會原封不動保留，不會被標記刪除');
  }

  const oldComments = readJson(COMMENTS_FILE, []);
  const oldVersions = readJson(VERSIONS_FILE, []);

  const oldMap = buildOldMap(oldComments);
  const matchedOldKeys = new Set();

  const reviews = await scrapeGoogleReviews(maxRounds);

  if (!Array.isArray(reviews) || reviews.length === 0) {
    console.warn('⚠️ 本次抓到 0 筆，為避免覆蓋舊資料，不更新 comments.json / review-versions.json');
    console.warn(`📦 目前舊資料仍保留：comments=${oldComments.length}, versions=${oldVersions.length}`);
    return;
  }

  let newCount = 0;
  let updatedCount = 0;
  let versionSavedCount = 0;

  const now = new Date().toISOString();

  const crawledComments = reviews.map((r, index) => {
    const key = makeKey(r, index);
    const old = findOldComment(oldMap, r, index);
    const replyData = getMergedReplyData(r, old);

    if (old) {
      markMatchedOld(matchedOldKeys, old);
    }

    const next = {
      id: old?.id || `${Date.now()}-${index}`,
      reviewId: key,
      author: r.author || old?.author || '',
      content: r.content || '',
      rating: Number(r.rating || 0),

      storeRating: r.storeRating || r.averageRating || old?.storeRating || old?.averageRating || '',
      averageRating: r.averageRating || r.storeRating || old?.averageRating || old?.storeRating || '',

      date: r.date || old?.date || '',
      editedText: r.editedText || old?.editedText || '',
      isEdited:
        Boolean(r.isEdited) ||
        isEditedText(r.date) ||
        isEditedText(r.editedText) ||
        Boolean(old?.isEdited),

      hasReply: replyData.hasReply,
      replyContent: replyData.replyContent,
      replyDate: replyData.replyDate,

      branch: r.branch || old?.branch || '',
      brand: r.brand || old?.brand || '',
      store: r.store || old?.store || '',
      group: r.group || old?.group || dashboardGroup,

      scrapedAt: old?.scrapedAt || now,
      updatedAt: old?.updatedAt || '',
      lastSeenAt: now
    };

    if (!old) {
      newCount++;
      return next;
    }

    const contentChanged = text(old.content) !== text(next.content);
    const ratingChanged = String(old.rating || '') !== String(next.rating || '');
    const replyChanged =
      text(old.replyContent) !== text(next.replyContent) ||
      Boolean(old.hasReply) !== Boolean(next.hasReply);

    if (contentChanged || ratingChanged) {
      const duplicate = oldVersions.some(v =>
        String(v.reviewId || '') === String(key) &&
        text(v.content) === text(old.content) &&
        String(v.rating || '') === String(old.rating || '')
      );

      if (!duplicate && text(old.content)) {
        oldVersions.unshift({
          id: `version-${Date.now()}-${index}`,
          commentId: old.id || '',
          reviewId: key,
          author: old.author || '',
          content: old.content || '',
          rating: old.rating || 0,
          date: old.date || '',
          editedText: old.editedText || '',
          branch: old.branch || '',
          brand: old.brand || '',
          store: old.store || '',
          group: old.group || dashboardGroup,
          savedAt: now,
          replacedAt: now,
          reason: 'content_or_rating_changed'
        });

        versionSavedCount++;
      }

      next.isEdited = true;
      next.updatedAt = now;
      updatedCount++;
    } else if (replyChanged) {
      next.updatedAt = now;
      updatedCount++;
    }

    return next;
  });

  let nextComments;

  if (isPartialSync) {
    const mergedComments = [...oldComments];

    crawledComments.forEach((newComment, newIndex) => {
      const old = findOldComment(oldMap, newComment, newIndex);

      if (old) {
        const oldIndex = findIndexInComments(mergedComments, old, newIndex);

        if (oldIndex >= 0) {
          mergedComments[oldIndex] = {
            ...old,
            ...newComment,

            id: old.id || newComment.id,
            reviewId: newComment.reviewId || old.reviewId,
            scrapedAt: old.scrapedAt || newComment.scrapedAt,
            lastSeenAt: newComment.lastSeenAt || now,

            isDeleted: false,
            deleted: false,
            deletedAt: ''
          };

          updatedCount++;
        } else {
          mergedComments.unshift(newComment);
          newCount++;
        }
      } else {
        mergedComments.unshift(newComment);
        newCount++;
      }
    });

    nextComments = mergedComments;

    console.log(`📌 快速同步模式：舊評論全部保留，本次爬到 ${crawledComments.length} 筆，合併後 ${nextComments.length} 筆`);
  } else {
    // 完整同步模式暫停刪除功能：
    // 沒被本次抓到的舊評論，不再標記 isDeleted，全部保留。
    const mergedComments = [...oldComments];

    crawledComments.forEach((newComment, newIndex) => {
      const old = findOldComment(oldMap, newComment, newIndex);

      if (old) {
        const oldIndex = findIndexInComments(mergedComments, old, newIndex);

        if (oldIndex >= 0) {
          mergedComments[oldIndex] = {
            ...old,
            ...newComment,

            id: old.id || newComment.id,
            reviewId: newComment.reviewId || old.reviewId,
            scrapedAt: old.scrapedAt || newComment.scrapedAt,
            lastSeenAt: newComment.lastSeenAt || now,

            isDeleted: false,
            deleted: false,
            deletedAt: ''
          };

          updatedCount++;
        } else {
          mergedComments.unshift({
            ...newComment,
            isDeleted: false,
            deleted: false,
            deletedAt: ''
          });

          newCount++;
        }
      } else {
        mergedComments.unshift({
          ...newComment,
          isDeleted: false,
          deleted: false,
          deletedAt: ''
        });

        newCount++;
      }
    });

    nextComments = mergedComments;

    console.log(`📌 完整同步模式：已暫停刪除判斷，舊評論全部保留，本次爬到 ${crawledComments.length} 筆，合併後 ${nextComments.length} 筆`);
  }

  writeJson(COMMENTS_FILE, nextComments);
  writeJson(VERSIONS_FILE, oldVersions);

  console.log(`✅ 本次抓到 ${reviews.length} 筆`);
  console.log(`📦 寫入 comments.json ${nextComments.length} 筆`);
  console.log(`💾 新增 ${newCount} 筆，更新 ${updatedCount} 筆，保存舊版本 ${versionSavedCount} 筆`);

  const replyCount = nextComments.filter(c => text(c.replyContent)).length;
  console.log(`💬 已寫入有業主回應 ${replyCount} 筆`);
}

main().catch(err => {
  console.error('❌ 同步失敗:', err);
  process.exit(1);
});