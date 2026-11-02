import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBOQRawReview, extractRawCommentText } from './boq-raw-parser.mjs';
function raw(fields = {}) {
  const r = Array(24).fill(null);
  r[1] = fields.rating ?? 1;
  r[2] = [null, null, 1792893600];
  r[3] = [fields.author ?? 'ShihBang Chan', '', 'https://www.google.com/maps/contrib/1234567890/reviews'];
  r[5] = fields.id ?? 'same-id';
  r[6] = fields.lang ?? 'zh-Hant';
  r[7] = fields.original ?? 'Chinese';
  r[8] = fields.secondary ?? '評論文字';
  r[9] = fields.detail ?? null;
  r[10] = [[['Question ID']]];
  r[19] = ['Google', '', 0, 'google', 5];
  return r;
}
const first = '中午12點剛過就進入餐廳，當時客人還不多，餐點遲遲沒有送上，也沒有說明出餐進度。';
const full = first + '\n\n由於一點還須返回辦公室，一直到12:40幾分仍無法正常用餐。\n\n結帳時有向店員反映問題。\n\n這次的經驗顯然很不好。';

test('long original in structured field beats the first-paragraph preview, translation ignored', () => {
 const r = raw({original:first+' ...', secondary:"We waited for a long time before our food arrived.",detail:[['ignore',null,[0,6]],[[full,null,[0,full.length]]]]});
 assert.equal(extractRawCommentText(r),full);
});
test('full original hidden in unusual nested shape is preferred', () => {
 const r = raw({original:first, secondary:'We waited for a long time',detail:[[['other'],[[['not text',full]]]]]});
 assert.equal(extractRawCommentText(r),full);
});
test('translated English longer than Chinese original never replaces original', () => {
 const r = raw({original:first,secondary:'We waited for thirty minutes, and no one told us about the wait at the restaurant.'});
 assert.equal(extractRawCommentText(r),first);
});
test('locale marker skipped and real text recovered', () => {
 const r = raw({original:'Chinese',secondary:'Alan服務態度很不錯 給到夯'});
 assert.equal(extractRawCommentText(r),'Alan服務態度很不錯 給到夯');
});
test('if Google only provided excerpt, never fabricate the missing paragraphs', () => {
 const r = raw({original:first+' ...',secondary:'Wait was terrible.'});
 assert.equal(extractRawCommentText(r),first+' ...');
});
test('original long text preserved even when secondary short shares beginning',()=>{
 const r = raw({original:full,secondary:first});
 assert.equal(extractRawCommentText(r),full);
});
test('no review text gives empty content',()=>{
 const r = raw({original:'zh-Hant',secondary:'Chinese'});
 assert.equal(extractRawCommentText(r),'');
});
test('review ID, author, date remain unchanged',()=>{
 const r = raw({id:'id-999',author:'某顧客',original:full,secondary:'Translated'});
 const row = parseBOQRawReview(r);
 assert.equal(row.review_id,'id-999');
 assert.equal(row.author.name,'某顧客');
 assert.equal(row.review.text,full);
 assert.equal(row.time.published,1792893600000);
});
