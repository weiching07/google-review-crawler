import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBOQRawReview, parseBOQRawRows, extractRawCommentText, isLocaleOnly } from './boq-raw-parser.mjs';

function example(fields = {}) {
  const r = Array(22).fill(null);
  r[1] = fields.rating ?? 5;
  r[2] = [null, null, 1792893600];
  r[3] = [fields.author ?? '你爹', '', 'https://www.google.com/maps/contrib/1234567890/reviews'];
  r[5] = fields.id ?? 'stable-google-review-id';
  r[6] = fields.lang ?? 'zh-Hant';
  r[7] = fields.first ?? 'Chinese';
  r[8] = fields.second ?? 'Alan服務態度很不錯 給到夯';
  r[9] = fields.nested ?? null;
  r[10] = [[['Question ID']]]; // actual upstream QA-anchor pattern
  r[19] = ['Google', '', 0, 'google', 5];
  return r;
}

test('source locale field replaced by REAL review body across all stores', () => {
  const raw = example();
  const parsed = parseBOQRawReview(raw);
  assert.equal(parsed.review.text, 'Alan服務態度很不錯 給到夯');
  assert.equal(parsed.review.rating, 5);
  assert.equal(parsed.author.name, '你爹');
  assert.equal(parsed.review_id, 'stable-google-review-id');
  assert.equal(parsed.time.published, 1792893600000);
});
test('English locale labels never become review contents', () => {
  assert.ok(isLocaleOnly('zh-Hant'));
  assert.ok(isLocaleOnly('Chinese'));
  assert.equal(extractRawCommentText(example({first:'zh-Hant',second:'Great service'})), 'Great service');
});
test('works with full text in other adjacent slot', () => {
  assert.equal(extractRawCommentText(example({first:'很好吃！',second:'zh-Hant'})), '很好吃！');
});
test('extract from structured text object if language has occupied plain field', () => {
  const r = example({first:'Chinese',second:'zh-Hant',nested:[['牛排非常好吃',null,[0,6]]]});
  assert.equal(extractRawCommentText(r), '牛排非常好吃');
});
test('pure-star rating stays empty instead of getting Chinese as content', () => {
  const r = example({first:'Chinese',second:'zh-Hant',nested:null});
  assert.equal(extractRawCommentText(r), '');
  assert.equal(parseBOQRawReview(r).review.rating, 5);
});
test('all stores use same parser and review IDs stay unique', () => {
  const first = example({id:'id1'});
  const second = example({id:'id2',author:'豆芽林',second:'第一次來用餐，非常滿意'});
  const res = parseBOQRawRows([first,second]);
  assert.equal(res.rows.length,2);
  assert.equal(res.rows[1].review.text,'第一次來用餐，非常滿意');
  assert.deepEqual(res.rows.map(r=>r.review_id), ['id1','id2']);
});

test('when both short and full review are present, keep untruncated text', () => {
  const r=example({ first:'牛排非常好吃，服務非常親切，',second:'牛排非常好吃，' });
  assert.equal(extractRawCommentText(r), '牛排非常好吃，服務非常親切，');
});
