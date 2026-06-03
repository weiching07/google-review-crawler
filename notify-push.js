const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const PUBLIC_DIR = path.join(__dirname, 'public');
const COMMENTS_FILE = path.join(PUBLIC_DIR, 'comments.json');
const NOTIFIED_FILE = path.join(PUBLIC_DIR, 'notified-review-ids.json');

const WORKER_URL = process.env.WORKER_URL;
const SYNC_SECRET = process.env.SYNC_SECRET;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:review@example.com';

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

function getReviewKey(c) {
  return String(c.reviewId || c.id || '');
}

function makeBody(review) {
  const rating = review.rating || 0;
  const author = review.author || '未知作者';
  const content = review.content || '無內容';

  return `${rating} 星｜${author}：${content}`.slice(0, 180);
}

async function getSubscriptions() {
  const res = await fetch(`${WORKER_URL}/subscriptions`, {
    method: 'GET',
    headers: {
      'X-Sync-Secret': SYNC_SECRET
    }
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.message || '讀取訂閱失敗');
  }

  return Array.isArray(data.subscriptions) ? data.subscriptions : [];
}

async function main() {
  if (!WORKER_URL || !SYNC_SECRET || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('⚠️ 缺少 push 環境變數，略過推播');
    return;
  }

  const comments = readJson(COMMENTS_FILE, []);

  if (!Array.isArray(comments) || comments.length === 0) {
    console.log('⚠️ 沒有 comments.json 資料，略過推播');
    return;
  }

  const oldNotified = readJson(NOTIFIED_FILE, null);

  if (!oldNotified) {
    const initialIds = comments.map(getReviewKey).filter(Boolean);
    writeJson(NOTIFIED_FILE, initialIds);
    console.log('✅ 第一次建立 notified-review-ids.json，不推播舊評論');
    return;
  }

  const notifiedSet = new Set(oldNotified.map(String));

  const newReviews = comments.filter(c => {
    const key = getReviewKey(c);
    return key && !notifiedSet.has(key);
  });

  if (newReviews.length === 0) {
    console.log('✅ 沒有新評論要推播');
    return;
  }

  const subscriptions = await getSubscriptions();

  if (subscriptions.length === 0) {
    console.log('⚠️ 沒有任何手機訂閱通知');
    newReviews.forEach(c => notifiedSet.add(getReviewKey(c)));
    writeJson(NOTIFIED_FILE, Array.from(notifiedSet));
    return;
  }

  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  for (const review of newReviews) {
    const payload = JSON.stringify({
      title: '有新的 Google 評論',
      body: makeBody(review),
      tag: getReviewKey(review),
      url: './index.html'
    });

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, payload);
        console.log('✅ 已推播：', getReviewKey(review));
      } catch (err) {
        console.log('⚠️ 推播失敗：', err.statusCode || '', err.message);
      }
    }

    notifiedSet.add(getReviewKey(review));
  }

  writeJson(NOTIFIED_FILE, Array.from(notifiedSet));
}

main().catch(err => {
  console.error('❌ 推播失敗:', err);
  process.exit(1);
});