const nodemailer = require('nodemailer');
const stores = require('./stores');

const IT_GROUP_EMAIL = 'it.group@casualrestaurants.com';

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
  return getRating(review.rating) <= 2 &&
    getRating(review.rating) > 0;
}

function getDashboardGroup() {
  const group = text(
    process.env.DASHBOARD_GROUP ||
    'new-brand'
  );

  if (group === 'TGIF') {
    return 'TGIF';
  }

  if (group === 'TXRH') {
    return 'TXRH';
  }

  return 'new-brand';
}

function getGroupLabel(group) {
  if (group === 'TGIF') {
    return 'TGI FRIDAYS';
  }

  if (group === 'TXRH') {
    return 'Texas Roadhouse';
  }

  return 'NEW BRAND';
}

function getNotifyTo() {
  const group = getDashboardGroup();

  if (group === 'TGIF') {
    return text(
      process.env.O365_NOTIFY_TO_TGIF ||
      process.env.O365_NOTIFY_TO
    );
  }

  if (group === 'TXRH') {
    return text(
      process.env.O365_NOTIFY_TO_TXRH ||
      process.env.O365_NOTIFY_TO
    );
  }

  return text(
    process.env.O365_NOTIFY_TO_NEW_BRAND ||
    process.env.O365_NOTIFY_TO
  );
}

function normalizeStoreName(value) {
  return text(value)
    .replace(/\s*(餐廳|店)$/g, '')
    .trim();
}

function getStoreConfig(
  group,
  storeName,
  brand
) {
  const normalizedStoreName =
    normalizeStoreName(storeName);

  const normalizedBrand =
    text(brand).toUpperCase();

  if (
    !normalizedStoreName ||
    !Array.isArray(stores)
  ) {
    return null;
  }

  return stores.find(storeItem => {
    return (
      text(storeItem.group) === group &&
      text(storeItem.brand).toUpperCase() === normalizedBrand &&
      normalizeStoreName(storeItem.store) === normalizedStoreName
    );
  }) || null;
}

function getReviewStoreCode(
  group,
  review
) {
  const reviewStoreCode = text(
    review.storeCode
  );

  if (reviewStoreCode) {
    return reviewStoreCode;
  }

 const storeConfig =
  getStoreConfig(
    group,
    review.store,
    review.brand || review.branch
  );

  return text(
    storeConfig &&
    storeConfig.storeCode
  );
}

/*
 * GM 信箱
 */
function getStoreManagerEmail(
  group,
  storeCode,
  brand
) {
  if (!storeCode) {
    return '';
  }

  if (group === 'TGIF') {
    return `${storeCode}.gm@tgifridays.com.tw`;
  }

  if (group === 'TXRH') {
    return `${storeCode}.gm@texasroadhouse.com.tw`;
  }

  if (group === 'new-brand') {
    const normalizedBrand =
      text(brand).toUpperCase();

    if (
      normalizedBrand ===
      'SALT&STONE'
    ) {
      return `${storeCode}.gm@saltandstonedining.com`;
    }

    if (
      normalizedBrand ===
      'LILLA'
    ) {
      return `${storeCode}.gm@lillaeats.com`;
    }

    if (
      text(brand) === '泰勒肉舖' ||
      normalizedBrand.includes(
        'TAYLOR'
      )
    ) {
      return '1801@taylorbutchery.com.tw';
    }
  }

  return '';
}

/*
 * STORE 信箱
 *
 * 1801 泰勒肉舖例外：
 * 不新增 store 帳號。
 */
function getStoreAccountEmail(
  group,
  storeCode,
  brand
) {
  if (!storeCode) {
    return '';
  }

  if (storeCode === '1801') {
    return '';
  }

  if (group === 'TGIF') {
    return `${storeCode}.store@tgifridays.com.tw`;
  }

  if (group === 'TXRH') {
    return `${storeCode}.store@texasroadhouse.com.tw`;
  }

  if (group === 'new-brand') {
    const normalizedBrand =
      text(brand).toUpperCase();

    if (
      normalizedBrand ===
      'SALT&STONE'
    ) {
      return `${storeCode}.store@saltandstonedining.com`;
    }

    if (
      normalizedBrand ===
      'LILLA'
    ) {
      return `${storeCode}.store@lillaeats.com`;
    }
  }

  return '';
}

function isReviewWithinOneDay(review) {
  const dateText =
    text(review.date).toLowerCase();

  if (!dateText) {
    return false;
  }

  if (
    dateText.includes('剛剛') ||
    dateText.includes('分鐘前') ||
    dateText.includes('小時前') ||
    dateText.includes('昨天') ||
    dateText.includes('一天前')
  ) {
    return true;
  }

  const chineseDayMatch =
    dateText.match(
      /(\d+)\s*天前/
    );

  if (chineseDayMatch) {
    return Number(
      chineseDayMatch[1]
    ) <= 1;
  }

  if (
    dateText.includes('just now') ||
    dateText.includes('minute ago') ||
    dateText.includes('minutes ago') ||
    dateText.includes('hour ago') ||
    dateText.includes('hours ago') ||
    dateText.includes('yesterday')
  ) {
    return true;
  }

  const englishDayMatch =
    dateText.match(
      /(\d+)\s*day[s]?\s*ago/
    );

  if (englishDayMatch) {
    return Number(
      englishDayMatch[1]
    ) <= 1;
  }

  return false;
}

function renderReviewCard(review) {
  const negative =
    isNegativeReview(review);

  const borderColor =
    negative
      ? '#dc2626'
      : '#ddd';

  const backgroundColor =
    negative
      ? '#fff1f2'
      : '#ffffff';

  const titleColor =
    negative
      ? '#b91c1c'
      : '#111827';

  return `
    <div style="border:2px solid ${borderColor}; background:${backgroundColor}; padding:12px; margin:12px 0; border-radius:8px;">
      ${
        negative
          ? `
            <p style="margin:0 0 10px 0; color:${titleColor}; font-size:16px; font-weight:bold;">
              ⚠️ 負評提醒：${escapeHtml(
                review.rating || '-'
              )} 星
            </p>
          `
          : ''
      }

      <p>
        <b>品牌：</b>
        ${escapeHtml(
          review.brand ||
          review.branch ||
          '-'
        )}
      </p>

      <p>
        <b>店別：</b>
        ${escapeHtml(
          review.store || '-'
        )}
      </p>

      <p>
        <b>作者：</b>
        ${escapeHtml(
          review.author || '-'
        )}
      </p>

      <p>
        <b>星等：</b>

        <span
          style="
            font-weight:bold;
            color:${
              negative
                ? '#dc2626'
                : '#111827'
            };
          "
        >
          ${escapeHtml(
            review.rating || '-'
          )} 星
        </span>
      </p>

      <p>
        <b>日期：</b>
        ${escapeHtml(
          review.date || '-'
        )}
      </p>

      <p>
        <b>內容：</b><br>

        ${escapeHtml(
          review.content || '-'
        ).replace(/\n/g, '<br>')}
      </p>
    </div>
  `;
}

function groupNegativeReviewsByStore(
  group,
  negativeReviews
) {
  const groupedReviews =
    new Map();

  for (
    const review of
    negativeReviews
  ) {
    const storeName =
      text(
        review.store ||
        '未知店別'
      );

    /*
     * new-brand 需要 brand
     * 才知道 SALT&STONE / LILLA
     * 要使用哪個 mail domain。
     */
    const brand =
      text(
        review.brand ||
        review.branch ||
        ''
      );

    const storeCode =
      getReviewStoreCode(
        group,
        review
      );

    const key =
      storeCode ||
      `${brand}:STORE:${normalizeStoreName(
        storeName
      )}`;

    if (
      !groupedReviews.has(key)
    ) {
      groupedReviews.set(
        key,
        {
          storeCode,
          storeName,
          brand,
          reviews: []
        }
      );
    }

    groupedReviews
      .get(key)
      .reviews
      .push(review);
  }

  return Array.from(
    groupedReviews.values()
  );
}

async function sendStoreNegativeReviewEmails({
  transporter,
  user,
  group,
  groupLabel,
  negativeReviews
}) {
  if (
    !Array.isArray(
      negativeReviews
    ) ||
    negativeReviews.length === 0
  ) {
    return;
  }

  if (
    group !== 'TGIF' &&
    group !== 'TXRH' &&
    group !== 'new-brand'
  ) {
    return;
  }

  const groupedStores =
    groupNegativeReviewsByStore(
      group,
      negativeReviews
    );

  for (
    const storeGroup of
    groupedStores
  ) {
    const {
      storeCode,
      storeName,
      brand,
      reviews
    } = storeGroup;

    const managerEmail =
      getStoreManagerEmail(
        group,
        storeCode,
        brand
      );

    const storeEmail =
      getStoreAccountEmail(
        group,
        storeCode,
        brand
      );

    /*
     * 第二封負評信收件人：
     *
     * 一般門店：
     * 1. 店號.gm@
     * 2. 店號.store@
     * 3. IT Group
     *
     * 1801：
     * 1. 1801@taylorbutchery.com.tw
     * 2. IT Group
     */
    const recipients = [
      managerEmail,
      storeEmail,
      IT_GROUP_EMAIL
    ].filter(Boolean);

    /*
     * 避免任何信箱重複。
     */
    const uniqueRecipients = [
      ...new Set(recipients)
    ];

    const storeLabel =
      storeCode
        ? `${storeCode} ${storeName}`
        : storeName;

    const subject =
      `⚠️【${groupLabel} ${storeLabel} Google 負評通知】` +
      `一天內新增 ${reviews.length} 筆 1-2 星評論`;

    const html = `
      <div style="font-family: Arial, 'Microsoft JhengHei', sans-serif; line-height: 1.6;">
        <h2 style="color:#b91c1c;">
          ⚠️ ${groupLabel}
          ${escapeHtml(
            storeLabel
          )}
          Google 負評通知
        </h2>

        <p>
          本次偵測到
          <b>${reviews.length}</b>
          筆一天內的 1 星或 2 星負評，
          請優先處理。
        </p>

        ${
          !storeCode
            ? `
              <p
                style="
                  color:#b91c1c;
                  font-weight:bold;
                "
              >
                ⚠️ 找不到此店店號，
                因此本封只寄給 IT Group。
              </p>
            `
            : ''
        }

        ${
          reviews
            .map(
              renderReviewCard
            )
            .join('')
        }
      </div>
    `;

    try {
      await transporter.sendMail({
        from:
          `"Google 評論通知" <${user}>`,

        to:
          uniqueRecipients,

        subject,
        html
      });

      console.log(
        `📧 已寄出 ${groupLabel} ${storeLabel} 負評通知：` +
        `${reviews.length} 筆 → ` +
        `${uniqueRecipients.join(', ')}`
      );
    } catch (error) {
      console.error(
        `❌ ${groupLabel} ${storeLabel} 負評通知寄送失敗：` +
        error.message
      );
    }
  }
}

async function sendNewReviewEmail(
  newReviews
) {
  if (
    !Array.isArray(newReviews) ||
    newReviews.length === 0
  ) {
    return;
  }

  const group =
    getDashboardGroup();

  const groupLabel =
    getGroupLabel(group);

  const to =
    getNotifyTo();

  if (!to) {
    console.warn(
      `⚠️ 未設定 ${groupLabel} 收件人，略過寄信`
    );

    return;
  }

  /*
   * 只寄一天內的評論。
   */
  const reviewsWithinOneDay =
    newReviews.filter(
      isReviewWithinOneDay
    );

  if (
    reviewsWithinOneDay.length === 0
  ) {
    console.log(
      `📭 ${groupLabel} 本次沒有一天內的新評論，略過寄信`
    );

    return;
  }

  const user =
    process.env.O365_SMTP_USER;

  const pass =
    process.env.O365_SMTP_PASS;

  if (
    !user ||
    !pass
  ) {
    console.warn(
      '⚠️ 未設定 O365_SMTP_USER / O365_SMTP_PASS，略過寄信'
    );

    return;
  }

  const negativeReviews =
    reviewsWithinOneDay.filter(
      isNegativeReview
    );

  const hasNegativeReview =
    negativeReviews.length > 0;

  const transporter =
    nodemailer.createTransport({
      host:
        process.env.O365_SMTP_HOST ||
        'smtp.office365.com',

      port: Number(
        process.env.O365_SMTP_PORT ||
        587
      ),

      secure: false,
      requireTLS: true,

      auth: {
        user,
        pass
      }
    });

  /*
   * =========================
   * 第一封信
   * =========================
   *
   * 原本主旨、內容、
   * 收件人邏輯全部維持不變。
   */
  const subject =
    hasNegativeReview
      ? (
        `⚠️【${groupLabel} Google 負評提醒】` +
        `一天內新增 ${reviewsWithinOneDay.length} 筆評論，` +
        `其中 ${negativeReviews.length} 筆 1-2 星`
      )
      : (
        `【${groupLabel} Google 新評論通知】` +
        `一天內新增 ${reviewsWithinOneDay.length} 筆評論`
      );

  const html = `
    <div style="font-family: Arial, 'Microsoft JhengHei', sans-serif; line-height: 1.6;">
      <h2
        style="
          color:${
            hasNegativeReview
              ? '#b91c1c'
              : '#111827'
          };
        "
      >
        ${
          hasNegativeReview
            ? `⚠️ ${groupLabel} Google 新評論通知：含負評`
            : `${groupLabel} Google 新評論通知`
        }
      </h2>

      <p>
        本次偵測到
        <b>
          ${reviewsWithinOneDay.length}
        </b>
        筆一天內的新評論。
      </p>

      ${
        newReviews.length !==
        reviewsWithinOneDay.length
          ? `
            <p style="color:#64748b;">
              已排除
              ${
                newReviews.length -
                reviewsWithinOneDay.length
              }
              筆超過一天的評論。
            </p>
          `
          : ''
      }

      ${
        hasNegativeReview
          ? `
            <p
              style="
                color:#b91c1c;
                font-weight:bold;
              "
            >
              其中有
              ${negativeReviews.length}
              筆 1 星或 2 星負評，
              請優先處理。
            </p>
          `
          : ''
      }

      ${
        reviewsWithinOneDay
          .map(
            renderReviewCard
          )
          .join('')
      }
    </div>
  `;

  await transporter.sendMail({
    from:
      `"Google 評論通知" <${user}>`,

    to,
    subject,
    html
  });

  console.log(
    `📧 已寄出 ${groupLabel} 一天內新評論通知：` +
    `${reviewsWithinOneDay.length} 筆 → ${to}`
  );

  if (
    newReviews.length !==
    reviewsWithinOneDay.length
  ) {
    console.log(
      `📭 ${groupLabel} 已略過超過一天評論：` +
      `${
        newReviews.length -
        reviewsWithinOneDay.length
      } 筆`
    );
  }

  if (
    hasNegativeReview
  ) {
    console.log(
      `⚠️ ${groupLabel} 其中負評 ${negativeReviews.length} 筆`
    );
  }

  /*
   * =========================
   * 第二封信
   * =========================
   *
   * 只寄一天內的 1 星、2 星負評。
   *
   * 一般店：
   * GM + STORE + IT Group
   *
   * 1801：
   * 1801@taylorbutchery.com.tw
   * + IT Group
   */
  await sendStoreNegativeReviewEmails({
    transporter,
    user,
    group,
    groupLabel,
    negativeReviews
  });
}

module.exports = {
  sendNewReviewEmail
};