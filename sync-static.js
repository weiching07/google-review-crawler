const fs = require('fs');
const path = require('path');
const scrapeGoogleReviews = require('./scraper');

const PUBLIC_DIR = path.join(__dirname, 'public');
const COMMENTS_FILE = path.join(PUBLIC_DIR, 'comments.json');
const VERSIONS_FILE = path.join(PUBLIC_DIR, 'review-versions.json');

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;

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
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function text(value) {
  return String(value || '').trim();
}

function isEditedText(value) {
  return /上次編輯|已編輯|edited|last edited/i.test(text(value));
}

function getMaxRounds() {
  const value = Number(process.env.SCRAPE_MAX_ROUNDS || 5);

  if (!Number.isFinite(value) || value <= 0) {
    return 5;
  }

  return Math.floor(value);
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

  if (mainKey) keys.push(String(mainKey));
  if (r.reviewId) keys.push(String(r.reviewId));
  if (r.id) keys.push(String(r.id));
  if (contentKey) keys.push(String(contentKey));

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
  if (!old) return;

  if (old.id) matchedOldKeys.add(String(old.id));
  if (old.reviewId) matchedOldKeys.add(String(old.reviewId));
}

function isOldMatched(matchedOldKeys, old) {
  if (!old) return false;

  if (old.id && matchedOldKeys.has(String(old.id))) {
    return true;
  }

  if (old.reviewId && matchedOldKeys.has(String(old.reviewId))) {
    return true;
  }

  return false;
}

async function main() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  const maxRounds = getMaxRounds();

  // ✅ 5 次以內視為快速同步：不刪舊資料
  // ✅ 999 或大於 5 視為完整同步：用完整爬到的資料覆蓋
  const isPartialSync = maxRounds <= 5;

  console.log('🔥 開始同步 Google 評論...');
  console.log(`🔁 SCRAPE_MAX_ROUNDS=${maxRounds}`);
  console.log(isPartialSync ? '⚡ 快速同步模式：保留舊有評論' : '🧹 完整同步模式：以本次完整資料為準');

  const oldComments = readJson(COMMENTS_FILE, []);
  const oldVersions = readJson(VERSIONS_FILE, []);

  const oldMap = buildOldMap(oldComments);
  const matchedOldKeys = new Set();

  const reviews = await scrapeGoogleReviews();

  // ✅ 重要：如果這次抓到 0 筆，不覆蓋原本資料
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

    if (old) {
      markMatchedOld(matchedOldKeys, old);
    }

    const next = {
      id: old?.id || `${Date.now()}-${index}`,
      reviewId: key,
      author: r.author || old?.author || '',
      content: r.content || '',
      rating: Number(r.rating || 0),
      date: r.date || old?.date || '',
      editedText: r.editedText || old?.editedText || '',
      isEdited:
        Boolean(r.isEdited) ||
        isEditedText(r.date) ||
        isEditedText(r.editedText) ||
        Boolean(old?.isEdited),
      branch: 'LILLA',
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
          branch: old.branch || 'LILLA',
          savedAt: now,
          replacedAt: now,
          reason: 'content_or_rating_changed'
        });

        versionSavedCount++;
      }

      next.isEdited = true;
      next.updatedAt = now;
      updatedCount++;
    }

    return next;
  });

  let nextComments;

  if (isPartialSync) {
    // ✅ 快速同步：這次抓到的放前面，舊的沒抓到也保留
    const crawledKeySet = new Set();

    crawledComments.forEach((c, index) => {
      getAllPossibleKeys(c, index).forEach(key => {
        crawledKeySet.add(String(key));
      });
    });

    const preservedOldComments = oldComments.filter((old, index) => {
      if (isOldMatched(matchedOldKeys, old)) {
        return false;
      }

      const oldKeys = getAllPossibleKeys(old, index);

      return !oldKeys.some(key => crawledKeySet.has(String(key)));
    });

    nextComments = [
      ...crawledComments,
      ...preservedOldComments
    ];

    console.log(`📌 快速同步保留舊評論 ${preservedOldComments.length} 筆`);
  } else {
    // ✅ 完整同步：以完整爬到的結果為準，沒爬到的視為不存在
    nextComments = crawledComments;
  }

  writeJson(COMMENTS_FILE, nextComments);
  writeJson(VERSIONS_FILE, oldVersions);

  console.log(`✅ 本次抓到 ${reviews.length} 筆`);
  console.log(`📦 寫入 comments.json ${nextComments.length} 筆`);
  console.log(`💾 新增 ${newCount} 筆，更新 ${updatedCount} 筆，保存舊版本 ${versionSavedCount} 筆`);
}

main().catch(err => {
  console.error('❌ 同步失敗:', err);
  process.exit(1);
});