const DASHBOARD_TEMPLATE = window.DASHBOARD_CONFIG || {
  defaultTitle: '評論分析儀表板',
  stores: []
};

let sidebarCollapsed = false;

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeUpper(value) {
  return normalizeText(value).toUpperCase();
}

function escapeTemplateHTML(value) {
  if (typeof escapeHTML === 'function') {
    return escapeHTML(value);
  }

  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getBrandCandidates(brandGroup) {
  return [
    brandGroup.brand,
    brandGroup.brandLabel,
    ...(Array.isArray(brandGroup.aliases) ? brandGroup.aliases : [])
  ]
    .map(normalizeText)
    .filter(Boolean);
}

function getStoreCandidates(storeItem) {
  return [
    storeItem.store,
    storeItem.label,
    ...(Array.isArray(storeItem.aliases) ? storeItem.aliases : [])
  ]
    .map(normalizeText)
    .filter(Boolean)
    .flatMap(value => {
      const withoutStoreText = value
        .replace(/\s*店$/g, '')
        .trim();

      return withoutStoreText && withoutStoreText !== value
        ? [value, withoutStoreText]
        : [value];
    });
}

function normalizeBrand(value) {
  const raw = normalizeText(value);
  const upper = normalizeUpper(value);

  if (!raw) {
    return '';
  }

  for (const brandGroup of DASHBOARD_TEMPLATE.stores) {
    const candidates = getBrandCandidates(brandGroup);

    const matched = candidates.some(candidate => {
      const candidateUpper = normalizeUpper(candidate);

      return (
        upper === candidateUpper ||
        upper.includes(candidateUpper) ||
        candidateUpper.includes(upper)
      );
    });

    if (matched) {
      return brandGroup.brand;
    }
  }

  return raw;
}

function getCommentBrand(c) {
  return normalizeBrand(c.brand || c.branch || c.brandName || '');
}

function getBrandGroupByBrand(brand) {
  return DASHBOARD_TEMPLATE.stores.find(group => {
    return group.brand === brand;
  }) || null;
}

function getCommentStore(c) {
  const brand = getCommentBrand(c);
  const rawStore = normalizeText(
    c.store ||
    c.storeName ||
    c.location ||
    c.shop ||
    c.branchStore ||
    ''
  );

  const brandGroup = getBrandGroupByBrand(brand);

  if (!brandGroup) {
    return rawStore;
  }

  if (rawStore) {
    for (const storeItem of brandGroup.stores) {
      const candidates = getStoreCandidates(storeItem);

      const matched = candidates.some(candidate => {
        return (
          rawStore === candidate ||
          rawStore.includes(candidate) ||
          candidate.includes(rawStore)
        );
      });

      if (matched) {
        return storeItem.store;
      }
    }

    return rawStore;
  }

  if (brandGroup.stores.length === 1) {
    return brandGroup.stores[0].store;
  }

  return '';
}

function getDisplayBrand(c) {
  const brand = getCommentBrand(c);
  return brand || '未知';
}

function getDisplayStore(c) {
  const store = getCommentStore(c);
  return store || '未知';
}

function isStoreInCurrentDashboard(c) {
  if (!DASHBOARD_TEMPLATE.stores.length) {
    return true;
  }

  const brand = getCommentBrand(c);
  const store = getCommentStore(c);

  return DASHBOARD_TEMPLATE.stores.some(brandGroup => {
    if (brandGroup.brand !== brand) {
      return false;
    }

    if (!Array.isArray(brandGroup.stores)) {
      return false;
    }

    return brandGroup.stores.some(storeItem => {
      return storeItem.store === store;
    });
  });
}

function getStoreAverageRatingFromData(brand, store) {
  if (typeof rawData === 'undefined' || !Array.isArray(rawData)) {
    return '';
  }

  const matched = rawData.find(c => {
    if (!c) return false;

    if (!isStoreInCurrentDashboard(c)) {
      return false;
    }

    const commentBrand = getCommentBrand(c);
    const commentStore = getCommentStore(c);

    const sameBrand =
      brand === 'all' ||
      commentBrand === brand;

    const sameStore =
      store === 'all' ||
      commentStore === store;

    return sameBrand && sameStore && (
      c.storeRating ||
      c.averageRating ||
      c.googleRating ||
      c.placeRating
    );
  });

  if (!matched) {
    return '';
  }

  return String(
    matched.storeRating ||
    matched.averageRating ||
    matched.googleRating ||
    matched.placeRating ||
    ''
  ).trim();
}

function renderStoreButtonContent(label, brand, store) {
  const rating = getStoreAverageRatingFromData(brand, store);

  return `
    <div class="flex items-center justify-between gap-2">
      <span>${escapeTemplateHTML(label)}</span>
      ${
        rating
          ? `<span class="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">${escapeTemplateHTML(rating)} ★</span>`
          : ''
      }
    </div>
  `;
}

function getDashboardTitle() {
  if (currentBrandFilter === 'all') {
    return DASHBOARD_TEMPLATE.defaultTitle;
  }

  for (const brandGroup of DASHBOARD_TEMPLATE.stores) {
    if (brandGroup.brand !== currentBrandFilter) continue;

    const storeItem = brandGroup.stores.find(item => item.store === currentStoreFilter);

    if (storeItem) {
      return storeItem.title;
    }

    return `${brandGroup.brandLabel || brandGroup.brand} 評論分析儀表板`;
  }

  return '評論分析儀表板';
}

function updateDashboardTitle() {
  const titleEl = document.getElementById('dashboardTitle');

  if (!titleEl) return;

  titleEl.textContent = getDashboardTitle();
}

function getStoreButtonId(brand, store) {
  return 'store-' + String(brand + '-' + store)
    .toLowerCase()
    .replaceAll('&', 'and')
    .replaceAll(' ', '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '');
}

function escapeJS(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'");
}

function getDashboardGroup() {
  const configGroup = window.DASHBOARD_CONFIG && window.DASHBOARD_CONFIG.groupId;

  if (configGroup) {
    return configGroup;
  }

  const path = String(location.pathname || '').toUpperCase();

  if (path.includes('/TGIF/')) {
    return 'TGIF';
  }

  if (path.includes('/TXRH/')) {
    return 'TXRH';
  }

  return 'new-brand';
}

function getCurrentSyncTarget() {
  const brand =
    typeof currentBrandFilter === 'undefined'
      ? 'all'
      : currentBrandFilter || 'all';

  const store =
    typeof currentStoreFilter === 'undefined'
      ? 'all'
      : currentStoreFilter || 'all';

  return {
    brand,
    store
  };
}

function getSyncTargetLabel(brand, store) {
  if (brand === 'all' && store === 'all') {
    return '全部店別';
  }

  if (brand !== 'all' && store === 'all') {
    return `${brand} 全部店別`;
  }

  return `${brand} ${store}`;
}

function setSyncStatus(message) {
  const status = document.getElementById('status');

  if (status) {
    status.textContent = message;
  }
}

function findTopSyncButton() {
  const byId = document.getElementById('syncButton');

  if (byId) {
    return byId;
  }

  const buttons = Array.from(document.querySelectorAll('button'));

  const target = buttons.find(button => {
    const text = normalizeText(button.textContent);
    const onclick = String(button.getAttribute('onclick') || '');

    return (
      onclick.includes('openManualSync') ||
      text.includes('重新整理資料') ||
      text.includes('手動同步') ||
      text.includes('同步全部店別') ||
      text.includes('同步此店')
    );
  });

  if (target) {
    target.id = 'syncButton';
    return target;
  }

  return null;
}

function ensureFullSyncButton() {
  let fullSyncButton = document.getElementById('fullSyncButton');

  if (fullSyncButton) {
    return fullSyncButton;
  }

  const syncButton = findTopSyncButton();

  if (!syncButton || !syncButton.parentElement) {
    return null;
  }

  fullSyncButton = document.createElement('button');
  fullSyncButton.id = 'fullSyncButton';
  fullSyncButton.type = 'button';
  fullSyncButton.className = 'border p-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 ml-2';
  fullSyncButton.onclick = openFullManualSync;

  syncButton.insertAdjacentElement('afterend', fullSyncButton);

  return fullSyncButton;
}

function applyTopSyncButtons() {
  const syncButton = findTopSyncButton();
  const fullSyncButton = ensureFullSyncButton();

  if (!syncButton) {
    return;
  }

  const { brand, store } = getCurrentSyncTarget();
  const isSingleStore = brand !== 'all' && store !== 'all';

  syncButton.style.display = '';
  syncButton.onclick = openManualSync;
  syncButton.className = 'border p-2 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60';

  if (fullSyncButton) {
    fullSyncButton.style.display = '';
    fullSyncButton.onclick = openFullManualSync;
    fullSyncButton.className = 'border p-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 ml-2';
  }

  if (isSingleStore) {
    syncButton.textContent = '手動同步此店';

    if (fullSyncButton) {
      fullSyncButton.textContent = '完整同步此店';
    }

    return;
  }

  syncButton.textContent = '手動同步全部店別';

  if (fullSyncButton) {
    fullSyncButton.textContent = '完整同步全部店別';
  }
}

function updateSyncButtonVisibility() {
  applyTopSyncButtons();
}

async function triggerDashboardSync(scrapeRounds, buttonId, originalText) {
  const button = document.getElementById(buttonId);
  const { brand, store } = getCurrentSyncTarget();

  const dashboardGroup = getDashboardGroup();
  const targetLabel = getSyncTargetLabel(brand, store);
  const isFullSync = Number(scrapeRounds) >= 999;

  if (!button) {
    setSyncStatus('找不到同步按鈕，已取消同步。');
    return;
  }

  button.disabled = true;
  button.textContent = isFullSync ? '完整同步啟動中...' : '同步啟動中...';

  setSyncStatus(
    isFullSync
      ? `正在觸發完整同步：${targetLabel}`
      : `正在觸發手動同步：${targetLabel}`
  );

  try {
    const res = await fetch(SYNC_WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Secret': SYNC_SECRET
      },
      body: JSON.stringify({
        source: 'review-dashboard',

        group: dashboardGroup,
        dashboardGroup: dashboardGroup,
        dashboard_group: dashboardGroup,

        scrapeRounds: scrapeRounds,
        scrape_rounds: String(scrapeRounds),

        brand: brand,
        store: store
      })
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.message || '同步觸發失敗');
    }

    setSyncStatus(
      isFullSync
        ? `已觸發完整同步：${targetLabel}`
        : `已觸發手動同步：${targetLabel}`
    );

    if (typeof startFastReviewWatcher === 'function') {
      startFastReviewWatcher();
    }
  } catch (err) {
    console.error(err);
    setSyncStatus(`同步觸發失敗：${err.message}`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
    applyTopSyncButtons();
  }
}

async function openManualSync() {
  const { brand, store } = getCurrentSyncTarget();
  const isSingleStore = brand !== 'all' && store !== 'all';

  await triggerDashboardSync(
    5,
    'syncButton',
    isSingleStore ? '手動同步此店' : '手動同步全部店別'
  );
}

async function openFullManualSync() {
  const { brand, store } = getCurrentSyncTarget();
  const isSingleStore = brand !== 'all' && store !== 'all';

  await triggerDashboardSync(
    999,
    'fullSyncButton',
    isSingleStore ? '完整同步此店' : '完整同步全部店別'
  );
}

function loadSidebarState() {
  sidebarCollapsed = localStorage.getItem('review_sidebar_collapsed_v1') === '1';
}

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  localStorage.setItem('review_sidebar_collapsed_v1', sidebarCollapsed ? '1' : '0');
  renderSidebar();
}

function renderSidebar() {
  const sidebarMount = document.getElementById('sidebarMount');

  if (!sidebarMount) return;

  const sidebarWidthClass = sidebarCollapsed ? 'w-16' : 'w-64';
  const toggleIcon = sidebarCollapsed ? '›' : '‹';

  let sidebarContent = '';

  if (!sidebarCollapsed) {
    const brandBlocks = DASHBOARD_TEMPLATE.stores.map(brandGroup => {
      const storeButtons = brandGroup.stores.map(storeItem => {
        const id = getStoreButtonId(brandGroup.brand, storeItem.store);

        return `
          <button
            onclick="setStoreFilter('${escapeJS(brandGroup.brand)}', '${escapeJS(storeItem.store)}')"
            id="${id}"
            class="w-full text-left px-4 py-2 rounded bg-white hover:bg-slate-100 border mb-2"
          >
            ${renderStoreButtonContent(storeItem.label, brandGroup.brand, storeItem.store)}
          </button>
        `;
      }).join('');

      return `
        <div>
          <div class="text-sm font-bold text-slate-500 mb-2">
            ${escapeTemplateHTML(brandGroup.brandLabel || brandGroup.brand)}
          </div>

          ${storeButtons}
        </div>
      `;
    }).join('');

    sidebarContent = `
      <h2 class="font-bold text-lg text-slate-800 mb-4">
        品牌 / 店別
      </h2>

      <div class="space-y-4">
        <button
          onclick="setStoreFilter('all', 'all')"
          id="store-all"
          class="w-full text-left px-4 py-2 rounded bg-slate-800 text-white"
        >
          全部品牌
        </button>

        ${brandBlocks}
      </div>
    `;
  }

  sidebarMount.innerHTML = `
    <aside class="${sidebarWidthClass} shrink-0 bg-white rounded shadow p-4 h-fit sticky top-8 transition-all duration-200">
      <div class="flex items-center justify-center ${sidebarCollapsed ? '' : 'mb-4'}">
        <button
          onclick="toggleSidebar()"
          class="border rounded px-3 py-2 text-slate-600 hover:bg-slate-100"
          title="${sidebarCollapsed ? '展開側邊欄' : '收合側邊欄'}"
        >
          ${toggleIcon}
        </button>
      </div>

      ${sidebarContent}
    </aside>
  `;

  updateStoreFilterButtons();
  applyTopSyncButtons();
}

function setStoreFilter(brand, store) {
  currentBrandFilter = brand;
  currentStoreFilter = store;

  updateStoreFilterButtons();
  updateDashboardTitle();
  applyTopSyncButtons();

  render();
}

function updateStoreFilterButtons() {
  if (sidebarCollapsed) {
    return;
  }

  const allButton = document.getElementById('store-all');

  if (allButton) {
    allButton.className = currentBrandFilter === 'all'
      ? 'w-full text-left px-4 py-2 rounded bg-slate-800 text-white'
      : 'w-full text-left px-4 py-2 rounded bg-white hover:bg-slate-100 border';
  }

  DASHBOARD_TEMPLATE.stores.forEach(brandGroup => {
    brandGroup.stores.forEach(storeItem => {
      const btn = document.getElementById(getStoreButtonId(brandGroup.brand, storeItem.store));

      if (!btn) return;

      const active =
        currentBrandFilter === brandGroup.brand &&
        currentStoreFilter === storeItem.store;

      btn.className = active
        ? 'w-full text-left px-4 py-2 rounded bg-slate-800 text-white mb-2'
        : 'w-full text-left px-4 py-2 rounded bg-white hover:bg-slate-100 border mb-2';

      btn.innerHTML = renderStoreButtonContent(
        storeItem.label,
        brandGroup.brand,
        storeItem.store
      );
    });
  });
}

window.getDashboardGroup = getDashboardGroup;
window.updateSyncButtonVisibility = updateSyncButtonVisibility;
window.openManualSync = openManualSync;
window.openFullManualSync = openFullManualSync;
window.applyTopSyncButtons = applyTopSyncButtons;

window.addEventListener('DOMContentLoaded', () => {
  applyTopSyncButtons();
});

window.addEventListener('load', () => {
  applyTopSyncButtons();
});