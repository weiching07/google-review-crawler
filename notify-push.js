const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const WORKER_URL = process.env.WORKER_URL;
const SYNC_SECRET = process.env.SYNC_SECRET;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:review@example.com';

const COMMENTS_PATH = path.join(__dirname, 'public', 'comments.json');
const NOTIFIED_PATH = path.join(__dirname, 'public', 'notified-review-ids.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    const raw = fs.readFileSync(filePath, 'utf8').trim();

    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw);
  } catch (err) {
    console.log(`⚠️ 讀取失敗：${filePath}`, err.message);
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });

  fs.writeFileSync(
    filePath,
    JSON.stringify(data, null, 2),
    'utf8'
  );
}

function normalizeComments(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && Array.isArray(data.comments)) {
    return data.comments;
  }

  return [];
}

function getReviewId(review) {
  return String(
    review.reviewId ||
    review.id ||
    ''
  ).trim();
}

function getReviewText(review) {
  return String(review.content || '').replace(/\s+/g, ' ').trim();
}

function buildPayload(review) {
  const rating = review.rating || 0;
  const author = review.author || '未知作者';
  const content = getReviewText(review);

  return JSON.stringify({
    title: '有新的 Google 評論',
    body: `${rating} 星｜${author}：${content}`.slice(0, 180),
    tag: getReviewId(review),
    url: './index.html'
  });
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

  return Array.isArray(data.subscriptions)
    ? data.subscriptions
    : [];
}

async function sendPushToSubscriptions(subscriptions, payload, reviewId) {
  let successCount = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
      successCount++;
      console.log(`✅ 已推播：${reviewId}`);
    } catch (err) {
      const code = err.statusCode || err.status || '';

      if (code === 404 || code === 410) {
        console.log(`⚠️ 訂閱已失效：${code} ${reviewId}`);
      } else if (code === 429) {
        console.log(`⚠️ 推播太快被限流：429 ${reviewId}`);
      } else {
        console.log(`⚠️ 推播失敗：${code} ${err.message}`);
      }
    }

    await sleep(800);
  }

  return successCount;
}

async function main() {
  if (!WORKER_URL || !SYNC_SECRET || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('⚠️ 缺少 push 環境變數，略過推播');
    return;
  }

  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  const commentsData = loadJson(COMMENTS_PATH, []);
  const comments = normalizeComments(commentsData);

  const notifiedData = loadJson(NOTIFIED_PATH, []);
  const notifiedIds = new Set(
    Array.isArray(notifiedData)
      ? notifiedData.map(String)
      : []
  );

  const currentReviewIds = comments
    .map(getReviewId)
    .filter(Boolean);

  console.log(`目前評論數：${comments.length}`);
  console.log(`已通知 ID 數：${notifiedIds.size}`);

  if (comments.length === 0) {
    console.log('沒有評論資料，略過推播');
    return;
  }

  // ✅ 第一次啟用時，不要把舊的 382 筆全部推播
  // ✅ 只把目前存在的評論標記成已通知，之後才會只推新的
  if (notifiedIds.size === 0) {
    saveJson(NOTIFIED_PATH, Array.from(new Set(currentReviewIds)));
    console.log(`初始化通知紀錄：已把目前 ${currentReviewIds.length} 筆評論標記為已通知，本次不推播`);
    return;
  }

  const newReviews = comments.filter(review => {
    const reviewId = getReviewId(review);

    if (!reviewId) {
      return false;
    }

    return !notifiedIds.has(reviewId);
  });

  console.log(`新評論數：${newReviews.length}`);

  if (newReviews.length === 0) {
    console.log('沒有新評論，不推播');
    return;
  }

  const subscriptions = await getSubscriptions();

  console.log(`手機訂閱數：${subscriptions.length}`);

  if (subscriptions.length === 0) {
    console.log('沒有手機訂閱，略過推播');
    return;
  }

  const sentReviewIds = [];

  for (const review of newReviews) {
    const reviewId = getReviewId(review);
    const payload = buildPayload(review);

    const successCount = await sendPushToSubscriptions(
      subscriptions,
      payload,
      reviewId
    );

    if (successCount > 0) {
      sentReviewIds.push(reviewId);
    }

    await sleep(1200);
  }

  for (const id of sentReviewIds) {
    notifiedIds.add(id);
  }

  saveJson(
    NOTIFIED_PATH,
    Array.from(notifiedIds)
  );

  console.log(`✅ 本次成功通知新評論數：${sentReviewIds.length}`);
  console.log(`✅ notified-review-ids.json 已更新`);
}

main().catch(err => {
  console.error('❌ 推播流程失敗：', err);
  process.exit(1);
});