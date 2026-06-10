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

  const subject = `【Google 新評論通知】新增 ${newReviews.length} 筆評論`;

  const html = `
    <div style="font-family: Arial, 'Microsoft JhengHei', sans-serif; line-height: 1.6;">
      <h2>Google 新評論通知</h2>
      <p>本次偵測到 <b>${newReviews.length}</b> 筆新評論。</p>

      ${newReviews.map(r => `
        <div style="border:1px solid #ddd; padding:12px; margin:12px 0; border-radius:8px;">
          <p><b>品牌：</b>${escapeHtml(r.brand || r.branch || '-')}</p>
          <p><b>店別：</b>${escapeHtml(r.store || '-')}</p>
          <p><b>作者：</b>${escapeHtml(r.author || '-')}</p>
          <p><b>星等：</b>${escapeHtml(r.rating || '-')} 星</p>
          <p><b>日期：</b>${escapeHtml(r.date || '-')}</p>
          <p><b>內容：</b><br>${escapeHtml(r.content || '-').replace(/\n/g, '<br>')}</p>
        </div>
      `).join('')}
    </div>
  `;

  await transporter.sendMail({
    from: `"Google 評論通知" <${user}>`,
    to,
    subject,
    html
  });

  console.log(`📧 已寄出新評論通知：${newReviews.length} 筆 → ${to}`);
}

module.exports = {
  sendNewReviewEmail
};