const BASE_URL = process.env.BASE_URL;

if (!BASE_URL) {
  console.error('❌ 缺少 BASE_URL 環境變數');
  process.exit(1);
}

async function main() {
  const url = `${BASE_URL.replace(/\/$/, '')}/sync-google`;

  console.log(`🔁 Cron 開始呼叫：${url}`);

  const res = await fetch(url);
  const text = await res.text();

  console.log(`HTTP ${res.status}`);
  console.log(text);

  if (!res.ok) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Cron 執行失敗:', err);
  process.exit(1);
});