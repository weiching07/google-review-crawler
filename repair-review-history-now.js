const fs = require('fs');

const commentsPath = 'public/comments.json';
const versionsPath = 'public/review-versions.json';
const indexPath = 'public/index.html';

function readJson(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

const comments = readJson(commentsPath);

const cleanedComments = comments.map(c => {
  const next = { ...c };

  // 清掉之前誤判的編輯 / 舊版本欄位
  delete next.isEdited;
  delete next.editedText;
  delete next.hasVersions;
  delete next.versionsCount;
  delete next.googleIsEdited;
  delete next.googleEditedText;

  return next;
});

// 目前 review-versions.json 裡面這批是「... 展開全文」造成的假紀錄，直接清空
writeJson(commentsPath, cleanedComments);
writeJson(versionsPath, []);

console.log(`✅ comments.json 處理 ${comments.length} 筆`);
console.log('✅ review-versions.json 已清空');

if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');

  html = html.replace(
/function isEditedReview\(c\) \{[\s\S]*?\n    \}/,
`function isEditedReview(c) {
      return Boolean(c.googleIsEdited);
    }`
  );

  html = html.replace(
/function hasVersions\(c\) \{[\s\S]*?\n    \}/,
`function hasVersions(c) {
      if (!isEditedReview(c)) {
        return false;
      }

      const key = getReviewKey(c);
      return getVersionListByKey(key).length > 0;
    }`
  );

  html = html.replace(
/rawData = rawData\.map\(\(item, idx\) => \(\{[\s\S]*?hasVersions: getVersionListByKey\(getReviewKey\(item\)\)\.length > 0[\s\S]*?\}\)\);/,
`rawData = rawData.map((item, idx) => ({
          ...item,
          sortIndex: idx,
          versionsCount: isEditedReview(item) ? getVersionListByKey(getReviewKey(item)).length : 0,
          hasVersions: isEditedReview(item) && getVersionListByKey(getReviewKey(item)).length > 0
        }));`
  );

  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('✅ index.html 已改成不再相信舊 isEdited / hasVersions');
}

console.log('✅ 修復完成');
