const DASHBOARD_TEMPLATE = {
  defaultTitle: '全部品牌 評論分析儀表板',

  stores: [
    {
      brand: 'LILLA',
      brandLabel: 'LILLA',
      stores: [
        {
          store: '台北',
          label: '台北',
          title: 'LillA 台北店 評論分析儀表板'
        }
      ]
    },
    {
      brand: 'SALT&STONE',
      brandLabel: 'SALT&STONE',
      stores: [
        {
          store: '南港',
          label: '南港',
          title: 'SALT&STONE 南港店 評論分析儀表板'
        },
        {
          store: '101',
          label: '101 店',
          title: 'SALT&STONE 101店 評論分析儀表板'
        }
      ]
    }
  ]
};

let sidebarCollapsed = false;

function normalizeBrand(value) {
  const raw = String(value || '').trim().toUpperCase();

  if (
    raw === 'LILLA' ||
    raw === 'LILLA 台北' ||
    raw === 'LILLA_TAIPEI'
  ) {
    return 'LILLA';
  }

  if (
    raw === 'SALT&STONE' ||
    raw === 'SALT & STONE' ||
    raw === 'SALTSTONE' ||
    raw === 'SALT_STONE'
  ) {
    return 'SALT&STONE';
  }

  return raw;
}

function getCommentBrand(c) {
  return normalizeBrand(c.brand || c.branch || c.brandName || '');
}

function getCommentStore(c) {
  const brand = getCommentBrand(c);
  const rawStore = String(c.store || c.storeName || c.location || c.shop || c.branchStore || '').trim();

  if (rawStore) {
    if (rawStore.includes('南港')) return '南港';
    if (rawStore.includes('101')) return '101';
    if (rawStore.includes('台北')) return '台北';
    return rawStore;
  }

  if (brand === 'LILLA') {
    return '台北';
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

    return `${brandGroup.brandLabel} 評論分析儀表板`;
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

  const brandBlocks = sidebarCollapsed
    ? ''
    : DASHBOARD_TEMPLATE.stores.map(brandGroup => {
        const storeButtons = brandGroup.stores.map(storeItem => {
          const id = getStoreButtonId(brandGroup.brand, storeItem.store);

          return `
            <button
              onclick="setStoreFilter('${escapeJS(brandGroup.brand)}', '${escapeJS(storeItem.store)}')"
              id="${id}"
              class="w-full text-left px-4 py-2 rounded bg-white hover:bg-slate-100 border mb-2"
            >
              ${escapeHTML(storeItem.label)}
            </button>
          `;
        }).join('');

        return `
          <div>
            <div class="text-sm font-bold text-slate-500 mb-2">
              ${escapeHTML(brandGroup.brandLabel)}
            </div>

            ${storeButtons}
          </div>
        `;
      }).join('');

  sidebarMount.innerHTML = `
    <aside class="${sidebarWidthClass} shrink-0 bg-white rounded shadow p-4 h-fit sticky top-8 transition-all duration-200">
      <div class="flex items-center justify-center mb-4">
        <button
          onclick="toggleSidebar()"
          class="border rounded px-3 py-2 text-slate-600 hover:bg-slate-100"
          title="${sidebarCollapsed ? '展開側邊欄' : '收合側邊欄'}"
        >
          ${toggleIcon}
        </button>
      </div>

      ${
        sidebarCollapsed
          ? ''
          : `
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
          `
      }
    </aside>
  `;

  updateStoreFilterButtons();
}

function setStoreFilter(brand, store) {
  currentBrandFilter = brand;
  currentStoreFilter = store;

  updateStoreFilterButtons();
  updateDashboardTitle();
  render();
}

function updateStoreFilterButtons() {
  if (sidebarCollapsed) return;

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
    });
  });
}