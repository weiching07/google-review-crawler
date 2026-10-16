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
    address: "台北市信義區松高路11號1樓",
    mapsPlaceAliases: ["松高路11號", "Songgao Rd 11號", "Songgao Rd"],
    mapsAddressHints: ["Songgao Rd 11號", "松高路11號", "DREAM PLAZA", "Songgao Rd"],
    branch: "LILLA",
    keyword: "LillA 台北",
    mapsExpectedName: "LillA",
    fallbackUrl: googleMapsSearch("LillA 台北")
  },
  {
    group: "new-brand",
    brand: "SALT&STONE",
    store: "南港",
    storeCode: "6602",
    address: "台北市南港區經貿二路131號1樓",
    mapsPlaceAliases: ["經貿二路131號", "Jingmao 2nd Rd 131號", "Jingmao 2nd Rd"],
    mapsAddressHints: ["經貿二路131號", "Jingmao 2nd Rd 131號", "Jingmao 2nd Rd", "LaLaport"],
    branch: "SALT&STONE",
    keyword: "SALT&STONE 南港店",
    fallbackUrl: googleMapsSearch("SALT&STONE 南港店")
  },
  {
    group: "new-brand",
    brand: "SALT&STONE",
    store: "101",
    storeCode: "6601",
    address: "台北市信義區市府路45號4樓",
    mapsPlaceAliases: ["市府路45號", "Shifu Rd 45號", "Shifu Rd", "City Hall Rd 45號"],
    mapsAddressHints: ["市府路45號", "Shifu Rd 45號", "Shifu Rd", "City Hall Rd 45號"],
    branch: "SALT&STONE",
    keyword: "SALT&STONE 101店",
    fallbackUrl: googleMapsSearch("SALT&STONE 101店")
  },
  {
    group: "new-brand",
    brand: "SALT&STONE",
    store: "大巨蛋",
    storeCode: "6603",
    address: "台北市信義區忠孝東路四段505號7樓",
    mapsPlaceAliases: ["忠孝東路四段505號", "Zhongxiao E Rd 505號", "Zhongxiao E Rd"],
    mapsAddressHints: ["Zhongxiao E Rd 505號", "忠孝東路四段505號", "Far Eastern Garden City", "Zhongxiao E Rd"],
    branch: "SALT&STONE",
    keyword: "SALT&STONE 大巨蛋店",
    mapsExpectedName: "SALT & STONE Far Eastern Garden City Branch",
    fallbackUrl: googleMapsSearch("SALT&STONE 大巨蛋店")
  },
  {
    group: "new-brand",
    brand: "泰勒肉舖",
    store: "台北",
    storeCode: "1801",
    address: "台北市大安區仁愛路四段50-1號",
    mapsPlaceAliases: ["仁愛路四段50", "Renai Rd", "Ren'ai Rd"],
    mapsAddressHints: ["仁愛路四段50", "Renai Rd", "Ren'ai Rd", "Renai Road"],
    branch: "泰勒肉舖",
    keyword: "泰勒肉舖 Taylor Butchery",
    fallbackUrl: googleMapsSearch("泰勒肉舖 Taylor Butchery")
  },
  {
    group: "new-brand",
    brand: "囕盈豚",
    store: "大巨蛋",
    storeCode: "1601",
    address: "台北市信義區忠孝東路四段517號1樓",
    mapsPlaceAliases: ["Far Eastern Garden City", "遠東Garden City", "忠孝東路四段517號", "Zhongxiao E Rd 517號", "Zhongxiao E Rd"],
    mapsAddressHints: ["忠孝東路四段517號", "Zhongxiao E Rd 517號", "Zhongxiao E Rd", "517號1樓"],
    branch: "囕盈豚",
    keyword: "囕盈豚 NYD Taipei 遠東GARDEN CITY 大巨蛋店",
    mapsNameAliases: ["NYD Taipei", "NYD"],
    mapsBrandAliases: ["盈豚"],
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
    address: "台北市中山區敬業三路22號2樓",
    mapsPlaceAliases: ["敬業三路22號", "Jingye 3rd Rd 22號", "Jingye 3rd Rd"],
    mapsAddressHints: ["敬業三路22號", "Jingye 3rd Rd 22號", "Jingye 3rd Rd"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 美麗華餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 美麗華餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "西門",
    storeCode: "5512",
    address: "台北市萬華區武昌街二段72號2樓",
    mapsPlaceAliases: ["Wuchang St 72號", "武昌街二段72號", "Wuchang St"],
    mapsAddressHints: ["Wuchang St 72號", "武昌街二段72號", "Wuchang St"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 西門餐廳",
    // Google Maps 顯示「TGI Fridays」，需以門牌識別西門店（武昌街二段 72 號 2 樓）
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 西門餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "古亭",
    storeCode: "5520",
    address: "台北市中正區羅斯福路二段60號",
    mapsPlaceAliases: ["羅斯福路二段60號", "Roosevelt Rd 60號", "Roosevelt Rd"],
    mapsAddressHints: ["羅斯福路二段60號", "Roosevelt Rd 60號", "Roosevelt Rd"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 古亭餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 古亭餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "信義",
    storeCode: "5521",
    address: "台北市信義區忠孝東路五段8號2樓",
    mapsPlaceAliases: ["忠孝東路五段8號", "Zhongxiao E Rd 8號", "Zhongxiao E Rd"],
    mapsAddressHints: ["忠孝東路五段8號", "Zhongxiao E Rd 8號", "Zhongxiao E Rd", "Uni-President"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 信義餐廳 忠孝",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 信義餐廳 忠孝")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "林森",
    storeCode: "5523",
    address: "台北市中山區林森北路247號1樓",
    mapsPlaceAliases: ["林森北路247號", "Linsen N Rd 247號", "Linsen N Rd"],
    mapsAddressHints: ["林森北路247號", "Linsen N Rd 247號", "Linsen N Rd"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 林森餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 林森餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "松高",
    storeCode: "5527",
    address: "台北市信義區松高路16號3樓",
    mapsPlaceAliases: ["松高路16號", "Songgao Rd 16號", "Songgao Rd"],
    mapsAddressHints: ["松高路16號", "Songgao Rd 16號", "Songgao Rd", "Breeze Songgao"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 松高餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 松高餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "環球",
    storeCode: "5516",
    address: "新北市中和區中山路三段122號4樓",
    mapsPlaceAliases: ["中山路三段122號", "Zhongshan Rd 122號", "Zhongshan Rd"],
    mapsAddressHints: ["中山路三段122號", "Zhongshan Rd 122號", "Zhongshan Rd", "Global Mall"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 環球餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 環球餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "裕隆城",
    storeCode: "5529",
    address: "新北市新店區中興路三段70號4樓",
    mapsPlaceAliases: ["中興路三段70號", "Zhongxing Rd 70號", "Zhongxing Rd"],
    mapsAddressHints: ["中興路三段70號", "Zhongxing Rd 70號", "Zhongxing Rd", "Yulon City"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 裕隆城餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 裕隆城餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "中壢",
    storeCode: "5509",
    address: "桃園市中壢區中園路二段501號4樓",
    mapsPlaceAliases: ["中園路二段501號", "Zhongyuan Rd 501號", "Zhongyuan Rd"],
    mapsAddressHints: ["中園路二段501號", "Zhongyuan Rd 501號", "Zhongyuan Rd", "MetroWalk"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 中壢餐廳 中園路",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 中壢餐廳 中園路")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "華泰",
    storeCode: "5522",
    address: "桃園市中壢區春德路189號",
    mapsPlaceAliases: ["Gloria Outlet", "Chunde Rd 189號", "189號, Chunde Rd", "春德路189號", "189號 Chunde Rd", "Chunde Rd"],
    mapsAddressHints: ["Chunde Rd 189號", "189號, Chunde Rd", "春德路189號", "189號 Chunde Rd", "Chunde Rd", "Gloria Outlet"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 華泰餐廳",
    // Google Maps 顯示「TGI FRIDAYS Gloria Outlet Restaurant」
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 華泰餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "台茂",
    storeCode: "5526",
    address: "桃園市蘆竹區南崁路一段112號1樓",
    mapsPlaceAliases: ["南崁路一段112號", "Nankan Rd 112號", "Nankan Rd"],
    mapsAddressHints: ["南崁路一段112號", "Nankan Rd 112號", "Nankan Rd", "TaiMall"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 台茂餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 台茂餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "竹北",
    storeCode: "5530",
    address: "新竹縣竹北市莊敬南路29號",
    mapsPlaceAliases: ["莊敬南路29號", "Zhuangjing S Rd 29號", "Zhuangjing S Rd"],
    mapsAddressHints: ["莊敬南路29號", "Zhuangjing S Rd 29號", "Zhuangjing S Rd"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 竹北餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 竹北餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "崇德",
    storeCode: "5532",
    address: "台中市北屯區崇德路二段63號",
    mapsPlaceAliases: ["崇德路二段63號", "Chongde Rd 63號", "Chongde Rd"],
    mapsAddressHints: ["崇德路二段63號", "Chongde Rd 63號", "Chongde Rd"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 崇德餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 崇德餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "新天地",
    storeCode: "5525",
    address: "台南市中西區西門路一段658號6樓",
    mapsPlaceAliases: ["Ximen Rd 658號", "西門路一段658號", "Ximen Rd"],
    mapsAddressHints: ["Ximen Rd 658號", "西門路一段658號", "Ximen Rd"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 台南新天地餐廳",
    // Google Maps 顯示「TGI Fridays」，需以門牌識別新天地店（西門路一段 658 號 6 樓）
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 台南新天地餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "夢時代",
    storeCode: "5518",
    address: "高雄市前鎮區中華五路789號3樓",
    mapsPlaceAliases: ["中華五路789號", "Zhonghua 5th Rd 789號", "Zhonghua 5th Rd"],
    mapsAddressHints: ["中華五路789號", "Zhonghua 5th Rd 789號", "Zhonghua 5th Rd", "Dream Mall"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS 高雄夢時代餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS 高雄夢時代餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "草衙",
    storeCode: "5528",
    address: "高雄市前鎮區中安路1-1號3樓",
    mapsPlaceAliases: ["SKM Park", "草衙道", "中安路1-1號", "Zhongan Rd 1-1號", "Zhongan Rd"],
    mapsAddressHints: ["中安路1-1號", "Zhongan Rd 1-1號", "Zhongan Rd", "SKM Park"],
    branch: "FRIDAYS",
    keyword: "TGI FRIDAYS SKM Park餐廳",
    fallbackUrl: googleMapsSearch("TGI FRIDAYS SKM Park餐廳")
  },
  {
    group: "TGIF",
    brand: "TGIF",
    store: "宏匯",
    storeCode: "5531",
    address: "新北市新莊區新北大道四段3號B2樓",
    mapsPlaceAliases: ["新北大道四段3號", "New Taipei Blvd 3號", "New Taipei Blvd"],
    mapsAddressHints: ["新北大道四段3號", "New Taipei Blvd 3號", "New Taipei Blvd", "Honhui Plaza"],
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
    address: "台北市信義區松高路16號3樓",
    mapsPlaceAliases: ["松高路16號", "Songgao Rd 16號", "Songgao Rd"],
    mapsAddressHints: ["松高路16號", "Songgao Rd 16號", "Songgao Rd"],
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 松高店",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 松高店")
  },
  {
    group: "TXRH",
    brand: "TXRH",
    store: "民生",
    storeCode: "8002",
    address: "台北市松山區民生東路三段156號1樓",
    mapsPlaceAliases: ["民生東路三段156號", "Minsheng E Rd 156號", "Minsheng E Rd"],
    mapsAddressHints: ["民生東路三段156號", "Minsheng E Rd 156號", "Minsheng E Rd"],
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 民生店",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 民生店")
  },
  {
    group: "TXRH",
    brand: "TXRH",
    store: "台中",
    storeCode: "8005",
    address: "台中市西屯區市政路581號之6",
    mapsPlaceAliases: ["Taichung", "台中店", "Shizheng Rd 581", "市政路581", "市政路581號", "Shizheng Rd 581號", "Shizheng Rd"],
    mapsAddressHints: ["Shizheng Rd", "市政路", "市政路581號", "Shizheng Rd 581號"],
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 台中店",
    // 固定商家 ID：避免 Google Maps 搜尋停在搜尋結果頁而抓不到 ID。
    mapsReviewUrl: "https://www.google.com/maps/place//data=!4m4!3m3!1s0x34693dee5ae7c311:0x5a6f24b86e03d95d!9m1!1b1?hl=zh-TW&gl=TW",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 台中店")
  },
  {
    group: "TXRH",
    brand: "TXRH",
    store: "新光",
    storeCode: "8006",
    address: "桃園市中壢區春德路107號2樓",
    mapsPlaceAliases: ["新光影城", "Shin Kong", "Shin Kong Cinemas", "Chunde Rd 107", "春德路107", "春德路107號", "Chunde Rd 107號", "Chunde Rd"],
    mapsAddressHints: ["Chunde Rd 107", "春德路107", "春德路107號", "Chunde Rd 107號", "Chunde Rd", "Shin Kong Cinemas"],
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 新光店",
    // 官方新光影城門店，固定 ID 避免僅顯示 Texas Roadhouse 時名稱比對失敗。
    mapsReviewUrl: "https://www.google.com/maps/place//data=!4m4!3m3!1s0x346821d37732c231:0x604d07bcc04e91f4!9m1!1b1?hl=zh-TW&gl=TW",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 新光店")
  },
  {
    group: "TXRH",
    brand: "TXRH",
    store: "竹北",
    storeCode: "8008",
    address: "新竹縣竹北市莊敬南路27號1樓",
    mapsPlaceAliases: ["莊敬南路27號", "Zhuangjing S Rd 27號", "Zhuangjing S Rd"],
    mapsAddressHints: ["莊敬南路27號", "Zhuangjing S Rd 27號", "Zhuangjing S Rd"],
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 竹北店",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 竹北店")
  },
  {
    group: "TXRH",
    brand: "TXRH",
    store: "復興",
    storeCode: "8009",
    address: "台北市大安區復興南路一段219-2號1樓",
    mapsPlaceAliases: ["復興南路一段219", "Fuxing S Rd 219", "Fuxing S Rd"],
    mapsAddressHints: ["復興南路一段219", "Fuxing S Rd 219", "Fuxing S Rd"],
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 復興店",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 復興店")
  },
  {
    group: "TXRH",
    brand: "TXRH",
    store: "大巨蛋",
    storeCode: "8010",
    address: "台北市信義區忠孝東路四段505號4樓",
    mapsPlaceAliases: ["忠孝東路四段505號", "Zhongxiao E Rd 505號", "Zhongxiao E Rd"],
    mapsAddressHints: ["忠孝東路四段505號", "Zhongxiao E Rd 505號", "Zhongxiao E Rd", "Far Eastern Garden City"],
    branch: "ROADHOUSE",
    keyword: "Texas Roadhouse 大巨蛋店",
    fallbackUrl: googleMapsSearch("Texas Roadhouse 大巨蛋店")
  }
];
