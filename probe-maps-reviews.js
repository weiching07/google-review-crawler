
'use strict';

// Zero-cost, single-request feasibility check for the public-facing Google Maps
// review data endpoint. This DOES NOT use Google login, proxies or paid APIs.
// It does not persist reviews or alter any existing project files.
// Usage: node probe-maps-reviews.js

const featureId = process.env.MAPS_FEATURE_ID ||
  '0x3442abba4f6df625:0xa61c4b36aa0bf63e'; // TXRH 松高

function signed64Hex(hex) {
  if (!/^0x[0-9a-f]{1,16}$/i.test(hex)) {
    throw new Error('Invalid hexadecimal half of the Google Maps feature ID');
  }
  return BigInt.asIntN(64, BigInt(hex)).toString();
}

function buildRequestUrl(id, offset = 0) {
  if (!/^0x[0-9a-f]{1,16}:0x[0-9a-f]{1,16}$/i.test(id)) {
    throw new Error('Invalid Google Maps feature ID');
  }

  const [first, second] = id.split(':');

  const pb = [
    `!1m2!1y${signed64Hex(first)}!2y${signed64Hex(second)}`,
    `!2m1!2i${offset}`,
    '!3e2', // newest first (observed internal parameter, not an official API)
    '!4m5!3b1!4b1!5b1!6b1!7b1',
    `!5m2!1s${id}!7e81`
  ].join('');

  const url = new URL(
    'https://www.google.com/maps/preview/review/listentitiesreviews'
  );

  url.searchParams.set('authuser', '0');
  url.searchParams.set('hl', 'zh-TW');
  url.searchParams.set('gl', 'tw');
  url.searchParams.set('pb', pb);

  return url.toString();
}

function parseResponse(raw) {
  // Google often adds an anti-XSSI prefix: )]}' followed by a newline.
  const body = raw.replace(/^\s*\)\]\}'[^\n]*\n/, '').trim();

  if (!body.startsWith('[')) {
    const looksLikeHtml =
      /<html|<!doctype|sign in|登入|unusual traffic|captcha|\/sorry\//i.test(body);

    throw new Error(
      looksLikeHtml
        ? 'Google returned a sign-in, block or HTML page instead of review JSON.'
        : 'Google did not return the expected review JSON format.'
    );
  }

  const data = JSON.parse(body);

  if (!Array.isArray(data) || !Array.isArray(data[2])) {
    throw new Error(
      'Response is JSON but the expected reviews array data[2] is unavailable.'
    );
  }

  return data;
}

async function main() {
  const target = buildRequestUrl(featureId, 0);

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 20000);

  console.log(
    'Testing Google Maps review data without Google account, API key or paid service.'
  );

  console.log('Feature ID:', featureId);
  console.log('Offset: 0 | sort: newest | requests: 1');

  try {
    const response = await fetch(target, {
      signal: abort.signal,
      redirect: 'follow',
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.google.com/maps/',
      }
    });

    console.log('HTTP status:', response.status);

    console.log(
      'Final hostname:',
      new URL(response.url).hostname
    );

    console.log(
      'Content type:',
      response.headers.get('content-type') || '(not supplied)'
    );

    const raw = await response.text();

    if (!response.ok) {
      throw new Error(`Google HTTP ${response.status}`);
    }

    const data = parseResponse(raw);
    const reviews = data[2];

    console.log('✅ Review rows received:', reviews.length);

    if (reviews.length) {
      const first = reviews[0];

      console.log(
        'First row structural check:',
        JSON.stringify({
          nestedArray: Array.isArray(first),
          authorPresent: typeof first?.[0]?.[1] === 'string',
          datePresent: typeof first?.[1] === 'string',
          textLength:
            typeof first?.[3] === 'string'
              ? first[3].length
              : 0,
          stars:
            typeof first?.[4] === 'number'
              ? first[4]
              : null,
        })
      );
    }

    if (!reviews.length) {
      console.log(
        '⚠️ Structured response succeeded but no reviews returned. This does not prove pagination works.'
      );

      process.exitCode = 2;
    }

  } catch (error) {
    console.error(
      '❌ Free endpoint test failed:',
      error.message
    );

    console.error(
      'This method may be unavailable from this network or require an authenticated session.'
    );

    process.exitCode = 1;

  } finally {
    clearTimeout(timer);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildRequestUrl,
  parseResponse
};
