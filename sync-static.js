const fs = require('fs');
const path = require('path');
const scrapeGoogleReviews = require('./scraper');

const PUBLIC_DIR = path.join(__dirname, 'public');
const COMMENTS_FILE = path.join(PUBLIC_DIR, 'comments.json');
const VERSIONS_FILE = path.join(PUBLIC_DIR, 'review-versions.json');

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;

  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
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

function makeKey(r, index) {
  return String(
    r.reviewId ||
    r.id ||
    `${r.author || 'unknown'}-${r.rating || 0}-${text(r.content).slice(0, 60)}-${index}`
  );
}

function buildOldMap(oldComments) {
  const map = new Map();

  oldComments.forEach((c, index) => {
    const key = makeKey(c, index);

    if (key && !map.has(key)) {
      map.set(key, c);
    }

    if (c.reviewId && !map.has(String(c.reviewId))) {
      map.set(String(c.reviewId), c);
    }

    const contentKey = `${c.author || 'unknown'}-${c.rating || 0}-${text(c.content).slice(0, 60)}-${index}`;
    if (!map.has(contentKey)) {
      map.set(contentKey, c);
    }
  });

  return map;
}

async function main() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }

  console.log('🔥 開始同步 Google 評論...');

  const oldComments = readJson(COMMENTS_FILE, []);
  const oldVersions = readJson(VERSIONS_FILE, []);

  const oldMap = buildOldMap(oldComments);

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

  const nextComments = reviews.map((r, index) => {
    const key = makeKey(r, index);

    const old =
      oldMap.get(key) ||
      oldMap.get(String(r.reviewId || '')) ||
      oldMap.get(`${r.author || 'unknown'}-${r.rating || 0}-${text(r.content).slice(0, 60)}-${index}`);

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

  writeJson(COMMENTS_FILE, nextComments);
  writeJson(VERSIONS_FILE, oldVersions);

  console.log(`✅ 抓到 ${reviews.length} 筆`);
  console.log(`💾 新增 ${newCount} 筆，更新 ${updatedCount} 筆，保存舊版本 ${versionSavedCount} 筆`);
}

main().catch(err => {
  console.error('❌ 同步失敗:', err);
  process.exit(1);
});