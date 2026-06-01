const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const scrapeGoogleReviews = require('./scraper');

const app = express();

const DB_PATH = path.join(__dirname, 'reviews.db');
const OLD_JSON_DB = path.join(__dirname, 'db.json');

const db = new Database(DB_PATH);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ===============================
// SQLite 初始化
// ===============================
db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    reviewId TEXT UNIQUE,
    author TEXT DEFAULT '',
    content TEXT DEFAULT '',
    rating INTEGER DEFAULT 0,
    date TEXT DEFAULT '',
    editedText TEXT DEFAULT '',
    isEdited INTEGER DEFAULT 0,
    branch TEXT DEFAULT 'LILLA',
    scrapedAt TEXT DEFAULT '',
    updatedAt TEXT DEFAULT '',
    lastSeenAt TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS review_versions (
    id TEXT PRIMARY KEY,
    commentId TEXT DEFAULT '',
    reviewId TEXT DEFAULT '',
    author TEXT DEFAULT '',
    content TEXT DEFAULT '',
    rating INTEGER DEFAULT 0,
    date TEXT DEFAULT '',
    editedText TEXT DEFAULT '',
    branch TEXT DEFAULT 'LILLA',
    oldScrapedAt TEXT DEFAULT '',
    oldUpdatedAt TEXT DEFAULT '',
    savedAt TEXT DEFAULT '',
    replacedAt TEXT DEFAULT '',
    reason TEXT DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_comments_reviewId
  ON comments(reviewId);

  CREATE INDEX IF NOT EXISTS idx_review_versions_reviewId
  ON review_versions(reviewId);

  CREATE INDEX IF NOT EXISTS idx_review_versions_commentId
  ON review_versions(commentId);
`);

// ===============================
// 共用工具
// ===============================
function text(value) {
  return String(value || '').trim();
}

function sameValue(a, b) {
  return text(a) === text(b);
}

function isEditedText(value) {
  return /上次編輯|已編輯|edited|last edited/i.test(text(value));
}

function nowISO() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeReviewId(r, timestamp, index) {
  return String(r.reviewId || r.id || `no-id-${timestamp}-${index}`);
}

function toBoolInt(value) {
  return value ? 1 : 0;
}

function rowBool(value) {
  return Number(value || 0) === 1;
}

// ===============================
// 舊 db.json 自動匯入 SQLite
// 只會在 SQLite comments 是空的時候匯入一次
// ===============================
function migrateJsonToSQLiteIfNeeded() {
  const countRow = db.prepare(`SELECT COUNT(*) AS count FROM comments`).get();

  if (countRow.count > 0) {
    return;
  }

  if (!fs.existsSync(OLD_JSON_DB)) {
    return;
  }

  try {
    const raw = fs.readFileSync(OLD_JSON_DB, 'utf-8');
    const oldDb = JSON.parse(raw);

    const oldComments = Array.isArray(oldDb.comments) ? oldDb.comments : [];
    const oldVersions = Array.isArray(oldDb.reviewVersions) ? oldDb.reviewVersions : [];

    if (oldComments.length === 0 && oldVersions.length === 0) {
      return;
    }

    const insertComment = db.prepare(`
      INSERT OR IGNORE INTO comments (
        id,
        reviewId,
        author,
        content,
        rating,
        date,
        editedText,
        isEdited,
        branch,
        scrapedAt,
        updatedAt,
        lastSeenAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertVersion = db.prepare(`
      INSERT OR IGNORE INTO review_versions (
        id,
        commentId,
        reviewId,
        author,
        content,
        rating,
        date,
        editedText,
        branch,
        oldScrapedAt,
        oldUpdatedAt,
        savedAt,
        replacedAt,
        reason
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const migrate = db.transaction(() => {
      oldComments.forEach((c, index) => {
        const id = String(c.id || `migrated-comment-${Date.now()}-${index}`);
        const reviewId = String(c.reviewId || '');

        insertComment.run(
          id,
          reviewId,
          c.author || '',
          c.content || '',
          Number(c.rating || 0),
          c.date || '',
          c.editedText || '',
          toBoolInt(
            Boolean(c.isEdited) ||
            isEditedText(c.date) ||
            isEditedText(c.editedText)
          ),
          c.branch || 'LILLA',
          c.scrapedAt || nowISO(),
          c.updatedAt || '',
          c.lastSeenAt || ''
        );
      });

      oldVersions.forEach((v, index) => {
        insertVersion.run(
          String(v.id || `migrated-version-${Date.now()}-${index}`),
          v.commentId || '',
          v.reviewId || '',
          v.author || '',
          v.content || '',
          Number(v.rating || 0),
          v.date || '',
          v.editedText || '',
          v.branch || 'LILLA',
          v.oldScrapedAt || v.originalScrapedAt || '',
          v.oldUpdatedAt || v.originalUpdatedAt || '',
          v.savedAt || nowISO(),
          v.replacedAt || v.savedAt || nowISO(),
          v.reason || 'migrated_from_json'
        );
      });
    });

    migrate();

    console.log(`✅ 已從 db.json 匯入 SQLite：comments=${oldComments.length}, versions=${oldVersions.length}`);
  } catch (err) {
    console.warn('⚠️ db.json 匯入 SQLite 失敗，略過:', err.message);
  }
}

migrateJsonToSQLiteIfNeeded();

// ===============================
// Prepared Statements
// ===============================
const stmtGetCommentByReviewId = db.prepare(`
  SELECT *
  FROM comments
  WHERE reviewId = ?
  LIMIT 1
`);

const stmtGetCommentBySameContentNoReviewId = db.prepare(`
  SELECT *
  FROM comments
  WHERE
    IFNULL(reviewId, '') = ''
    AND TRIM(content) = TRIM(?)
    AND CAST(rating AS TEXT) = CAST(? AS TEXT)
    AND branch = 'LILLA'
  LIMIT 1
`);

const stmtInsertComment = db.prepare(`
  INSERT INTO comments (
    id,
    reviewId,
    author,
    content,
    rating,
    date,
    editedText,
    isEdited,
    branch,
    scrapedAt,
    updatedAt,
    lastSeenAt
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtUpdateComment = db.prepare(`
  UPDATE comments
  SET
    reviewId = ?,
    author = ?,
    content = ?,
    rating = ?,
    date = ?,
    editedText = ?,
    isEdited = ?,
    updatedAt = ?,
    lastSeenAt = ?
  WHERE id = ?
`);

const stmtUpdateLastSeen = db.prepare(`
  UPDATE comments
  SET lastSeenAt = ?
  WHERE id = ?
`);

const stmtInsertVersion = db.prepare(`
  INSERT INTO review_versions (
    id,
    commentId,
    reviewId,
    author,
    content,
    rating,
    date,
    editedText,
    branch,
    oldScrapedAt,
    oldUpdatedAt,
    savedAt,
    replacedAt,
    reason
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtVersionExists = db.prepare(`
  SELECT id
  FROM review_versions
  WHERE
    (
      (reviewId != '' AND reviewId = ?)
      OR
      (commentId != '' AND commentId = ?)
    )
    AND TRIM(content) = TRIM(?)
    AND CAST(rating AS TEXT) = CAST(? AS TEXT)
  LIMIT 1
`);

const stmtCountVersions = db.prepare(`
  SELECT COUNT(*) AS count
  FROM review_versions
  WHERE
    (reviewId != '' AND reviewId = ?)
    OR
    (commentId != '' AND commentId = ?)
`);

const stmtCleanupBadVersions = db.prepare(`
  DELETE FROM review_versions
  WHERE id IN (
    SELECT v.id
    FROM review_versions v
    JOIN comments c
      ON (
        (v.reviewId != '' AND v.reviewId = c.reviewId)
        OR
        (v.commentId != '' AND v.commentId = c.id)
      )
    WHERE
      TRIM(v.content) = TRIM(c.content)
      AND CAST(v.rating AS TEXT) = CAST(c.rating AS TEXT)
  )
`);

// ===============================
// DB 操作函式
// ===============================
function findExistingReview(reviewId, r) {
  let exists = null;

  if (reviewId) {
    exists = stmtGetCommentByReviewId.get(reviewId);
  }

  // 舊資料如果沒有 reviewId，就用相同內容接回來一次
  if (!exists) {
    exists = stmtGetCommentBySameContentNoReviewId.get(
      r.content || '',
      r.rating || 0
    );
  }

  return exists || null;
}

function countVersions(comment) {
  const row = stmtCountVersions.get(comment.reviewId || '', comment.id || '');
  return row ? Number(row.count || 0) : 0;
}

function alreadySavedOldVersion(oldComment) {
  const found = stmtVersionExists.get(
    oldComment.reviewId || '',
    oldComment.id || '',
    oldComment.content || '',
    oldComment.rating || 0
  );

  return Boolean(found);
}

function saveOldVersionBeforeOverwrite(oldComment, reason = 'content_or_rating_changed') {
  const oldContent = text(oldComment.content);

  if (!oldContent) {
    return false;
  }

  if (alreadySavedOldVersion(oldComment)) {
    return false;
  }

  const now = nowISO();

  stmtInsertVersion.run(
    makeId('version'),
    oldComment.id || '',
    oldComment.reviewId || '',
    oldComment.author || '',
    oldComment.content || '',
    Number(oldComment.rating || 0),
    oldComment.date || '',
    oldComment.editedText || '',
    oldComment.branch || 'LILLA',
    oldComment.scrapedAt || '',
    oldComment.updatedAt || '',
    now,
    now,
    reason
  );

  return true;
}

function cleanupBadVersions() {
  const result = stmtCleanupBadVersions.run();

  if (result.changes > 0) {
    console.log(`🧹 已清掉 ${result.changes} 筆與目前內容相同的無效舊版本`);
  }
}

// ===============================
// Routes
// ===============================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/comments', (req, res) => {
  try {
    cleanupBadVersions();

    const comments = db.prepare(`
      SELECT *
      FROM comments
      ORDER BY scrapedAt DESC
    `).all();

    const result = comments.map(c => {
      const versionsCount = countVersions(c);

      return {
        ...c,
        isEdited:
          rowBool(c.isEdited) ||
          versionsCount > 0 ||
          isEditedText(c.date) ||
          isEditedText(c.editedText),
        hasVersions: versionsCount > 0,
        versionsCount
      };
    });

    res.json(result);
  } catch (err) {
    console.error('❌ /comments 讀取 SQLite 失敗:', err);
    res.json([]);
  }
});

app.get('/review-versions/:key', (req, res) => {
  try {
    cleanupBadVersions();

    const key = decodeURIComponent(req.params.key || '');

    const versions = db.prepare(`
      SELECT *
      FROM review_versions
      WHERE
        reviewId = ?
        OR commentId = ?
        OR id = ?
      ORDER BY replacedAt DESC
    `).all(key, key, key);

    res.json(versions);
  } catch (err) {
    console.error('❌ /review-versions/:key 讀取 SQLite 失敗:', err);
    res.json([]);
  }
});

app.get('/review-versions', (req, res) => {
  try {
    cleanupBadVersions();

    const key = req.query.key ? decodeURIComponent(req.query.key) : '';

    if (key) {
      const versions = db.prepare(`
        SELECT *
        FROM review_versions
        WHERE
          reviewId = ?
          OR commentId = ?
          OR id = ?
        ORDER BY replacedAt DESC
      `).all(key, key, key);

      res.json(versions);
      return;
    }

    const versions = db.prepare(`
      SELECT *
      FROM review_versions
      ORDER BY replacedAt DESC
    `).all();

    res.json(versions);
  } catch (err) {
    console.error('❌ /review-versions 讀取 SQLite 失敗:', err);
    res.json([]);
  }
});

app.get('/sync-google', async (req, res) => {
  console.log('🔥 準備啟動爬蟲...');

  try {
    const reviews = await scrapeGoogleReviews();

    let newCount = 0;
    let updatedCount = 0;
    let versionSavedCount = 0;

    const timestamp = Date.now();

    const syncTransaction = db.transaction((reviews) => {
      reviews.forEach((r, index) => {
        const reviewId = makeReviewId(r, timestamp, index);

        const newAuthor = r.author || '';
        const newContent = r.content || '';
        const newRating = Number(r.rating || 0);
        const newDate = r.date || '';
        const newEditedText = r.editedText || '';

        const exists = findExistingReview(reviewId, r);

        if (!exists) {
          stmtInsertComment.run(
            `${timestamp}-${index}`,
            reviewId,
            newAuthor,
            newContent,
            newRating,
            newDate,
            newEditedText,
            toBoolInt(
              Boolean(r.isEdited) ||
              isEditedText(newDate) ||
              isEditedText(newEditedText)
            ),
            'LILLA',
            nowISO(),
            '',
            nowISO()
          );

          newCount++;
          return;
        }

        const contentChanged = !sameValue(exists.content, newContent);
        const ratingChanged = String(exists.rating || '') !== String(newRating || '');
        const dateChanged = !sameValue(exists.date, newDate) && Boolean(newDate);
        const authorChanged = !sameValue(exists.author, newAuthor) && Boolean(newAuthor);
        const editedTextChanged = !sameValue(exists.editedText, newEditedText) && Boolean(newEditedText);
        const reviewIdChanged = !sameValue(exists.reviewId, reviewId) && Boolean(reviewId);

        let changed = false;
        let contentOrRatingChanged = false;

        if (contentChanged || ratingChanged) {
          const saved = saveOldVersionBeforeOverwrite(
            exists,
            'content_or_rating_changed'
          );

          if (saved) {
            versionSavedCount++;
          }

          contentOrRatingChanged = true;
          changed = true;
        }

        if (
          dateChanged ||
          authorChanged ||
          editedTextChanged ||
          reviewIdChanged
        ) {
          changed = true;
        }

        const nextIsEdited =
          rowBool(exists.isEdited) ||
          Boolean(r.isEdited) ||
          isEditedText(newDate) ||
          isEditedText(newEditedText) ||
          contentOrRatingChanged;

        if (changed) {
          stmtUpdateComment.run(
            reviewId || exists.reviewId || '',
            newAuthor || exists.author || '',
            newContent,
            newRating,
            newDate || exists.date || '',
            newEditedText || exists.editedText || '',
            toBoolInt(nextIsEdited),
            nowISO(),
            nowISO(),
            exists.id
          );

          updatedCount++;
        } else {
          stmtUpdateLastSeen.run(nowISO(), exists.id);
        }
      });

      cleanupBadVersions();
    });

    syncTransaction(reviews);

    console.log(
      `💾 新增 ${newCount} 筆，更新 ${updatedCount} 筆，保存舊版本 ${versionSavedCount} 筆`
    );

    res.json({
      message: '抓取完成',
      totalScraped: reviews.length,
      newSaved: newCount,
      updated: updatedCount,
      versionSaved: versionSavedCount
    });
  } catch (err) {
    console.error('❌ 伺服器同步發生錯誤:', err);

    res.status(500).json({
      error: '爬蟲失敗',
      detail: err.message
    });
  }
});

app.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
  console.log(`📦 SQLite DB: ${DB_PATH}`);
});