function googleMapsSearch(keyword) {
  return `https://www.google.com/maps/search/${encodeURIComponent(keyword)}`;
}

module.exports = [
  // =========================
  // new-brand
  // LILLA / SALT&STONE / 泰勒肉舖
  // =========================
  {
    group: 'new-brand',
    brand: 'LILLA',
    store: 'DREAM PLAZA',
    branch: 'LILLA',
    keyword: 'LillA 台北',
    fallbackUrl: googleMapsSearch('LillA DREAM PLAZA')
  },
  {
    group: 'new-brand',
    brand: 'SALT&STONE',
    store: '南港',
    branch: 'SALT&STONE',
    keyword: 'SALT&STONE 南港店',
    fallbackUrl: googleMapsSearch('SALT&STONE 南港店')
  },
  {
    group: 'new-brand',
    brand: 'SALT&STONE',
    store: '101',
    branch: 'SALT&STONE',
    keyword: 'SALT&STONE 101店',
    fallbackUrl: googleMapsSearch('SALT&STONE 101店')
  },
  {
    group: 'new-brand',
    brand: '泰勒肉舖',
    store: '台北',
    branch: '泰勒肉舖',
    keyword: '泰勒肉舖 Taylor Butchery',
    fallbackUrl: googleMapsSearch('泰勒肉舖 Taylor Butchery')
  },

  // =========================
  // TGIF / FRIDAYS
  // =========================
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '美麗華',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 美麗華餐廳',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 美麗華餐廳')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '西門',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 西門餐廳',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 西門餐廳')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '古亭',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 古亭餐廳',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 古亭餐廳')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '信義',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 信義餐廳 忠孝',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 信義餐廳 忠孝')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '林森',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 林森餐廳',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 林森餐廳')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '松高',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 松高餐廳',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 松高餐廳')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '環球',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 環球餐廳',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 環球餐廳')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '裕隆城',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 裕隆城餐廳',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 裕隆城餐廳')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '中壢',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 中壢餐廳 中園路',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 中壢餐廳 中園路')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '華泰',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 華泰餐廳',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 華泰餐廳')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '台茂',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 台茂餐廳',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 台茂餐廳')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '竹北',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 竹北餐廳',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 竹北餐廳')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '崇德',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 崇德餐廳',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 崇德餐廳')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '新天地',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 台南新天地餐廳',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 台南新天地餐廳')
  },
  {
    group: 'TGIF',
    brand: 'TGIF',
    store: '夢時代',
    branch: 'FRIDAYS',
    keyword: 'TGI FRIDAYS 高雄夢時代餐廳',
    fallbackUrl: googleMapsSearch('TGI FRIDAYS 高雄夢時代餐廳')
  },

  // =========================
  // TXRH / ROADHOUSE
  // =========================
  {
    group: 'TXRH',
    brand: 'TXRH',
    store: '松高',
    branch: 'ROADHOUSE',
    keyword: 'Texas Roadhouse 松高店',
    fallbackUrl: googleMapsSearch('Texas Roadhouse 松高店')
  },
  {
    group: 'TXRH',
    brand: 'TXRH',
    store: '民生',
    branch: 'ROADHOUSE',
    keyword: 'Texas Roadhouse 民生店',
    fallbackUrl: googleMapsSearch('Texas Roadhouse 民生店')
  },
  {
    group: 'TXRH',
    brand: 'TXRH',
    store: '台中',
    branch: 'ROADHOUSE',
    keyword: 'Texas Roadhouse 台中店',
    fallbackUrl: googleMapsSearch('Texas Roadhouse 台中店')
  },
  {
    group: 'TXRH',
    brand: 'TXRH',
    store: '新光',
    branch: 'ROADHOUSE',
    keyword: 'Texas Roadhouse 新光店',
    fallbackUrl: googleMapsSearch('Texas Roadhouse 新光店')
  },
  {
    group: 'TXRH',
    brand: 'TXRH',
    store: '竹北',
    branch: 'ROADHOUSE',
    keyword: 'Texas Roadhouse 竹北店',
    fallbackUrl: googleMapsSearch('Texas Roadhouse 竹北店')
  },
  {
    group: 'TXRH',
    brand: 'TXRH',
    store: '復興',
    branch: 'ROADHOUSE',
    keyword: 'Texas Roadhouse 復興店',
    fallbackUrl: googleMapsSearch('Texas Roadhouse 復興店')
  }
];