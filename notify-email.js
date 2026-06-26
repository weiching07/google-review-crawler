const nodemailer = require('nodemailer');

function text(value) {
  return String(value || '').trim();
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getRating(value) {
  const rating = Number(value);

  if (!Number.isFinite(rating)) {
    return 0;
  }

  return rating;
}

function isNegativeReview(review) {
  return getRating(review.rating) <= 2 && getRating(review.rating) > 0;
}

function renderReviewCard(review) {
  const negative = isNegativeReview(review);

  const borderColor = negative ? '#dc2626' : '#ddd';
  const backgroundColor = negative ? '#fff1f2' : '#ffffff';
  const titleColor = negative ? '#b91c1c' : '#111827';

  return `
    <div style="border:2px solid ${borderColor}; background:${backgroundColor}; padding:12px; margin:12px 0; border-radius:8px;">
      ${
        negative
          ? `<p style="margin:0 0 10px 0; color:${titleColor}; font-size:16px; font-weight:bold;">⚠️ 負評提醒：${escapeHtml(review.rating || '-')} 星</p>`
          : ''
      }

      <p><b>品牌：</b>${escapeHtml(review.brand || review.branch || '-')}</p>
      <p><b>店別：</b>${escapeHtml(review.store || '-')}</p>
      <p><b>作者：</b>${escapeHtml(review.author || '-')}</p>
      <p><b>星等：</b><span style="font-weight:bold; color:${negative ? '#dc2626' : '#111827'};">${escapeHtml(review.rating || '-')} 星</span></p>
      <p><b>日期：</b>${escapeHtml(review.date || '-')}</p>
      <p><b>內容：</b><br>${escapeHtml(review.content || '-').replace(/\n/g, '<br>')}</p>
    </div>
  `;
}

async function sendNewReviewEmail(newReviews) {
  if (!Array.isArray(newReviews) || newReviews.length === 0) {
    return;
  }

  const user = process.env.O365_SMTP_USER;
  const pass = process.env.O365_SMTP_PASS;
  const to = process.env.O365_NOTIFY_TO || 'it.group@casualrestaurants.com';

  if (!user || !pass) {
    console.warn('⚠️ 未設定 O365_SMTP_USER / O365_SMTP_PASS，略過寄信');
    return;
  }

  const negativeReviews = newReviews.filter(isNegativeReview);
  const hasNegativeReview = negativeReviews.length > 0;

  const transporter = nodemailer.createTransport({
    host: process.env.O365_SMTP_HOST || 'smtp.office365.com',
    port: Number(process.env.O365_SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: {
      user,
      pass
    }
  });

  const subject = hasNegativeReview
    ? `⚠️【Google 負評提醒】新增 ${newReviews.length} 筆評論，其中 ${negativeReviews.length} 筆 1-2 星`
    : `【Google 新評論通知】新增 ${newReviews.length} 筆評論`;

  const html = `
    <div style="font-family: Arial, 'Microsoft JhengHei', sans-serif; line-height: 1.6;">
      <h2 style="color:${hasNegativeReview ? '#b91c1c' : '#111827'};">
        ${hasNegativeReview ? '⚠️ Google 新評論通知：含負評' : 'Google 新評論通知'}
      </h2>

      <p>本次偵測到 <b>${newReviews.length}</b> 筆新評論。</p>

      ${
        hasNegativeReview
          ? `<p style="color:#b91c1c; font-weight:bold;">其中有 ${negativeReviews.length} 筆 1 星或 2 星負評，請優先處理。</p>`
          : ''
      }

      ${newReviews.map(renderReviewCard).join('')}
    </div>
  `;

  await transporter.sendMail({
    from: `"Google 評論通知" <${user}>`,
    to,
    subject,
    html
  });

  console.log(`📧 已寄出新評論通知：${newReviews.length} 筆 → ${to}`);

  if (hasNegativeReview) {
    console.log(`⚠️ 其中負評 ${negativeReviews.length} 筆`);
  }
}

module.exports = {
  sendNewReviewEmail
};