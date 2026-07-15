const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const { sendNewReviewEmail } = require('./notify-email');

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

function getReviewRating(review) {
  const rating = Number(review.rating || 0);

  if (!Number.isFinite(rating)) {
    return 0;
  }

  return rating;
}

function isNegativeReview(review) {
  const rating = getReviewRating(review);

  // 這裡定義 1～3 星為負評
  return rating > 0 && rating <= 3;
}

function buildSummaryPayload(newReviews) {
  const totalCount = newReviews.length;
  const negativeCount = newReviews.filter(isNegativeReview).length;

  const latestReview = newReviews[0] || {};
  const latestAuthor = latestReview.author || '未知作者';
  const latestRating = getReviewRating(latestReview);
  const latestContent = getReviewText(latestReview);

  const summaryText = `本次偵測到 ${totalCount} 筆新評論，其中 ${negativeCount} 筆負評。`;

  const previewText = latestContent
    ? `最新一筆：${latestRating} 星｜${latestAuthor}：${latestContent}`.slice(0, 120)
    : '';

  return JSON.stringify({
    title: 'Google 新評論通知',
    body: previewText
      ? `${summaryText}\n${previewText}`.slice(0, 180)
      : summaryText,
    tag: `google-review-summary-${Date.now()}`,
    url: './new-brand/index.html',
    totalCount,
    negativeCount
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

async function sendPushSummaryToSubscriptions(subscriptions, payload) {
  let successCount = 0;
  let expiredCount = 0;
  let rateLimitedCount = 0;
  let failedCount = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
      successCount++;
    } catch (err) {
      const code = Number(err.statusCode || err.status || 0);

      if (code === 404 || code === 410) {
        expiredCount++;
      } else if (code === 429) {
        rateLimitedCount++;
      } else {
        failedCount++;
        console.log(`⚠️ 推播失敗：${code || 'unknown'} ${err.message}`);
      }
    }

    await sleep(300);
  }

  if (expiredCount > 0) {
    console.log(`⚠️ 已略過失效訂閱：${expiredCount} 筆`);
  }

  if (rateLimitedCount > 0) {
    console.log(`⚠️ 推播被限流：${rateLimitedCount} 筆`);
  }

  console.log(`📣 手機推播總結：成功 ${successCount} 筆，失效 ${expiredCount} 筆，限流 ${rateLimitedCount} 筆，失敗 ${failedCount} 筆`);

  return {
    successCount,
    expiredCount,
    rateLimitedCount,
    failedCount
  };
}

function hasEmailConfig() {
  return Boolean(
    process.env.O365_SMTP_USER &&
    process.env.O365_SMTP_PASS
  );
}

async function main() {
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
    console.log('沒有評論資料，略過通知');
    return;
  }

  // 第一次啟用時，不要把舊的全部通知
  if (notifiedIds.size === 0) {
    saveJson(NOTIFIED_PATH, Array.from(new Set(currentReviewIds)));
    console.log(`初始化通知紀錄：已把目前 ${currentReviewIds.length} 筆評論標記為已通知，本次不通知`);
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
    console.log('沒有新評論，不通知');
    return;
  }

  const negativeCount = newReviews.filter(isNegativeReview).length;
  console.log(`本次新評論：${newReviews.length} 筆，其中負評 ${negativeCount} 筆`);

  const sentReviewIds = new Set();

  // Email 通知保留原本邏輯
  if (hasEmailConfig()) {
    try {
      await sendNewReviewEmail(newReviews);

      for (const review of newReviews) {
        const reviewId = getReviewId(review);

        if (reviewId) {
          sentReviewIds.add(reviewId);
        }
      }

      console.log(`✅ 本次成功寄出 Email 新評論數：${newReviews.length}`);
    } catch (err) {
      console.log(`⚠️ Email 通知失敗：${err.message}`);
    }
  } else {
    console.log('⚠️ 未設定 O365_SMTP_USER / O365_SMTP_PASS，略過 Email 通知');
  }

  // 手機推播改成「總結一則」，不再每筆評論推一次
  if (!WORKER_URL || !SYNC_SECRET || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log('⚠️ 缺少 push 環境變數，略過手機推播');
  } else {
    webpush.setVapidDetails(
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const subscriptions = await getSubscriptions();

    console.log(`手機訂閱數：${subscriptions.length}`);

    if (subscriptions.length === 0) {
      console.log('沒有手機訂閱，略過手機推播');
    } else {
      const payload = buildSummaryPayload(newReviews);

      const result = await sendPushSummaryToSubscriptions(
        subscriptions,
        payload
      );

      if (result.successCount > 0) {
        for (const review of newReviews) {
          const reviewId = getReviewId(review);

          if (reviewId) {
            sentReviewIds.add(reviewId);
          }
        }
      }
    }
  }

  if (sentReviewIds.size === 0) {
    console.log('⚠️ Email 和手機推播都沒有成功，本次不更新 notified-review-ids.json');
    return;
  }

  for (const id of sentReviewIds) {
    notifiedIds.add(id);
  }

  saveJson(
    NOTIFIED_PATH,
    Array.from(notifiedIds)
  );

  console.log(`✅ 本次成功通知新評論數：${sentReviewIds.size}`);
  console.log(`✅ notified-review-ids.json 已更新`);
}

main().catch(err => {
  console.error('❌ 通知流程失敗：', err);
  process.exit(1);
});