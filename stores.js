/**
 * 既有系統用的 group / brand / store / storeCode / branch 全部保留。
 * BOQ 比對若遇 Google 另一種英文商家名稱，只新增 maps* 欄位；
 * 不要改 store，否則會影響既有評論 JSON 與儀表板查詢。
 */
function googleMapsSearch(keyword) {
  return `https://www.google.com/maps/search/${encodeURIComponent(keyword)}`;
}

module.exports = [
  // =========================
  // new-brand
  // =========================
  {
    group: "new-brand",
    brand: "LILLA",
    store: "DREAM PLAZA",
    storeCode: "9002",
    branch: "LILLA",
    keyword: "LillA 台北",
    mapsExpectedName: "LillA",
    mapsAddressHints: ["Songgao Rd 11號", "松高路11號", "DREAM PLAZA"],
    fallbackUrl: googleMapsSearch("LillA 台北")
  },
  {
    group: "new-brand",
    brand: "SALT&STONE",
    store: "南港",
    storeCode: "6602",
    branch: "SALT&STONE",
    keyword: "SALT&STONE 南港店",
    fallbackUrl: googleMapsSearch("SALT&STONE 南港店")
  },
  {
    group: "new-brand",
    brand: "SALT&STONE",
    store: "101",
    storeCode: "6601",
    branch: "SALT&STONE",
    keyword: "SALT&STONE 101店",
    fallbackUrl: googleMapsSearch("SALT&STONE 101店")
  },
  {
    group: "new-brand",
    brand: "SALT&STONE",
    store: "大巨蛋",
    storeCode: "6603",
    branch: "SALT&STONE",
    keyword: "SALT&STONE 大巨蛋店",
    mapsExpectedName: "SALT & STONE Far Eastern Garden City Branch",
    mapsAddressHints: ["Zhongxiao E Rd 505號", "忠孝東路四段505號", "Far Eastern Garden City"],
    fallbackUrl: googleMapsSearch("SALT&STONE 大巨蛋店")
  },
  {
    group: "new-brand",
    brand: "泰勒肉舖",
    store: "台北",
    storeCode: "1801",
    branch: "泰勒肉舖",
    keyword: "泰勒肉舖 Taylor Butchery",
    fallbackUrl: googleMapsSearch("泰勒肉舖 Taylor Butchery")
  },
  {
    group: "new-brand",
    brand: "囕盈豚",
    store: "大巨蛋",
    storeCode: "1601",
    branch: "囕盈豚",
    keyword: "囕盈豚 NYD Taipei 遠東GARDEN CITY 大巨蛋店",
    mapsNameAliases: ["NYD Taipei", "NYD"],
    mapsBrandAliases: ["盈豚"],
    mapsPlaceAliases: ["Far Eastern Garden City", "遠東Garden City"],
    fallbackUrl: googleMapsSearch("囕盈豚 NYD Taipei 遠東GARDEN CITY 大巨蛋店")
  },
  // =========================
  // TGIF
  // =========================
  {
    group: "TGIF",
    brand: "TGIF",
    store: "美麗華",
    storeCode: "5511",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 美麗華餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 美麗華餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "西門",
    storeCode: "5512",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 西門餐廳",
    // Google Maps 顯示「TGI Fridays」，需以門牌識別西門店（武昌街二段 72 號 2 樓）
    mapsPlaceAliases: ["Wuchang St 72號", "武昌街二段72號"],
    mapsAddressHints: ["Wuchang St 72號", "武昌街二段72號"],
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 西門餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "古亭",
    storeCode: "5520",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 古亭餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 古亭餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "信義",
    storeCode: "5521",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 信義餐廳 忠孝",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 信義餐廳 忠孝")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "林森",
    storeCode: "5523",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 林森餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 林森餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "松高",
    storeCode: "5527",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 松高餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 松高餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "環球",
    storeCode: "5516",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 環球餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 環球餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "裕隆城",
    storeCode: "5529",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 裕隆城餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 裕隆城餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "中壢",
    storeCode: "5509",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 中壢餐廳 中園路",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 中壢餐廳 中園路")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "華泰",
    storeCode: "5522",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 華泰餐廳",
    // Google Maps 顯示「TGI FRIDAYS Gloria Outlet Restaurant」
    mapsPlaceAliases: ["Gloria Outlet", "Chunde Rd 189號", "189號, Chunde Rd", "春德路189號"],
    mapsAddressHints: ["Chunde Rd 189號", "189號, Chunde Rd", "春德路189號"],
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 華泰餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "台茂",
    storeCode: "5526",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 台茂餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 台茂餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "竹北",
    storeCode: "5530",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 竹北餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 竹北餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "崇德",
    storeCode: "5532",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 崇德餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 崇德餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "新天地",
    storeCode: "5525",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 台南新天地餐廳",
    // Google Maps 顯示「TGI Fridays」，需以門牌識別新天地店（西門路一段 658 號 6 樓）
    mapsPlaceAliases: ["Ximen Rd 658號", "西門路一段658號"],
    mapsAddressHints: ["Ximen Rd 658號", "西門路一段658號"],
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 台南新天地餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "夢時代",
    storeCode: "5518",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 高雄夢時代餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 高雄夢時代餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "草衙",
    storeCode: "5528",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS SKM Park餐廳",
    mapsPlaceAliases: ["SKM Park", "草衙道"],
    fallbackUrl: googleMapsSearch("TGI FRIDAYS SKM Park餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "宏匯",
    storeCode: "5531",
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 宏匯廣場餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 宏匯廣場餐廳")
  },
  // =========================
  // TXRH
  // =========================
  {
    group: "TXRH",
    brand: "TXRH",
    store: "松高",
    storeCode: "8001",
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 松高店",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 松高店")
  },
  {
    group: "TXRH",
    brand: "TXRH",
    store: "民生",
    storeCode: "8002",
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 民生店",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 民生店")
  },
  {
    group: "TXRH",
    brand: "TXRH",
    store: "台中",
    storeCode: "8005",
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 台中店",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 台中店")
  },
  {
    group: "TXRH",
    brand: "TXRH",
    store: "新光",
    storeCode: "8006",
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 新光店",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 新光店")
  },
  {
    group: "TXRH",
    brand: "TXRH",
    store: "竹北",
    storeCode: "8008",
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 竹北店",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 竹北店")
  },
  {
    group: "TXRH",
    brand: "TXRH",
    store: "復興",
    storeCode: "8009",
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 復興店",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 復興店")
  },
  {
    group: "TXRH",
    brand: "TXRH",
    store: "大巨蛋",
    storeCode: "8010",
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 大巨蛋店",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 大巨蛋店")
  }
];
