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
      <span>${escapeHTML(label)}</span>
      ${
        rating
          ? `<span class="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">${escapeHTML(rating)} ★</span>`
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
            ${escapeHTML(brandGroup.brandLabel || brandGroup.brand)}
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
}

function setStoreFilter(brand, store) {
  currentBrandFilter = brand;
  currentStoreFilter = store;

  updateStoreFilterButtons();
  updateDashboardTitle();

  if (typeof updateSyncButtonVisibility === 'function') {
    updateSyncButtonVisibility();
  }

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