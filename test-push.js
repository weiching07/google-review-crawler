const webpush = require('web-push');

const WORKER_URL = process.env.WORKER_URL;
const SYNC_SECRET = process.env.SYNC_SECRET;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:review@example.com';

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
    throw new Error('缺少 WORKER_URL / SYNC_SECRET / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');
  }

  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  const subscriptions = await getSubscriptions();

  console.log('目前訂閱數：', subscriptions.length);

  if (subscriptions.length === 0) {
    console.log('沒有任何手機訂閱通知，請先用手機按「開啟評論通知」。');
    return;
  }

  const payload = JSON.stringify({
    title: '有新的 Google 評論',
    body: '測試新留言：這是一則手機背景通知測試。',
    tag: 'test-new-review-' + Date.now(),
    url: './index.html'
  });

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
      console.log('✅ 測試通知已送出');
    } catch (err) {
      console.log('❌ 測試通知失敗：', err.statusCode || '', err.message);
    }
  }
}

main().catch(err => {
  console.error('❌ 測試推播失敗：', err);
  process.exit(1);
});