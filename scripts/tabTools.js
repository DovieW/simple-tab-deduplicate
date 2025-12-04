const STORAGE_KEY = "simpleTabDeduplicate.preferences";

export const DEFAULT_SETTINGS = {
  scope: "all-windows",
  strategy: "keep-oldest",
  includePinned: false,
  ignoreQuery: false
};

const SPECIAL_PROTOCOLS = ["chrome:", "chrome-extension:", "edge:", "devtools:", "about:"];

export async function loadSettings() {
  const stored = await new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        console.warn("Simple Tab Deduplicate: storage get failed", chrome.runtime.lastError);
        resolve({});
      } else {
        resolve(result[STORAGE_KEY] || {});
      }
    });
  });
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(nextSettings) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: nextSettings }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

export async function computeDuplicateSummary(options = {}) {
  const tabs = await queryTabs(buildScopeQuery(options.scope));
  const summary = groupTabsByDuplicate(tabs, options);
  return { tabs, summary };
}

export async function deduplicateTabs(options = {}) {
  const { summary } = await computeDuplicateSummary(options);
  const tabIds = selectTabsToClose(summary.duplicateSets, options.strategy || DEFAULT_SETTINGS.strategy);
  if (!tabIds.length) {
    return { removed: 0, summary };
  }
  await removeTabs(tabIds);
  return { removed: tabIds.length, summary };
}

export function closeSpecificTabs(tabIds) {
  if (!tabIds || !tabIds.length) return Promise.resolve();
  return removeTabs(tabIds);
}

export function groupTabsByDuplicate(tabs, options = {}) {
  const includePinned = Boolean(options.includePinned);
  const ignoreQuery = Boolean(options.ignoreQuery);
  const eligibleTabs = tabs.filter((tab) => {
    if (!tab.url) return false;
    if (!includePinned && tab.pinned) return false;
    if (shouldSkipUrl(tab.url)) return false;
    return true;
  });

  const tokenToGroup = new Map();
  for (const tab of eligibleTabs) {
    const token = buildComparisonToken(tab.url, ignoreQuery);
    const normalized = normalizeUrl(tab.url, ignoreQuery);
    let group = tokenToGroup.get(token);
    if (!group) {
      group = {
        token,
        normalizedUrl: normalized,
        hostname: hostnameFromUrl(tab.url),
        tabs: []
      };
      tokenToGroup.set(token, group);
    }
    group.tabs.push(minifyTab(tab));
  }

  const duplicateSets = Array.from(tokenToGroup.values())
    .filter((group) => group.tabs.length > 1)
    .map((group) => ({
      ...group,
      tabs: [...group.tabs].sort((a, b) => a.lastAccessed - b.lastAccessed)
    }))
    .sort((a, b) => b.tabs.length - a.tabs.length || a.hostname.localeCompare(b.hostname));

  const possibleClosures = duplicateSets.reduce((total, group) => total + (group.tabs.length - 1), 0);

  return {
    totalTabs: tabs.length,
    eligibleTabs: eligibleTabs.length,
    duplicateSets,
    possibleClosures
  };
}

export function selectTabsToClose(duplicateSets, strategy = DEFAULT_SETTINGS.strategy) {
  const ids = [];
  duplicateSets.forEach((group) => {
    if (group.tabs.length < 2) return;
    const keeper = pickKeeper(group.tabs, strategy);
    group.tabs.forEach((tab) => {
      if (tab.id !== keeper.id) {
        ids.push(tab.id);
      }
    });
  });
  return ids;
}

export function determineKeeper(tabs, strategy = DEFAULT_SETTINGS.strategy) {
  return pickKeeper(tabs, strategy);
}

function pickKeeper(tabs, strategy) {
  if (strategy === "keep-newest") {
    return tabs.reduce((latest, tab) => {
      if (!latest) return tab;
      if ((tab.lastAccessed || 0) === (latest.lastAccessed || 0)) {
        return tab.id > latest.id ? tab : latest;
      }
      return (tab.lastAccessed || 0) > (latest.lastAccessed || 0) ? tab : latest;
    }, tabs[0]);
  }
  // Default: keep oldest
  return tabs.reduce((oldest, tab) => {
    if (!oldest) return tab;
    if ((tab.lastAccessed || 0) === (oldest.lastAccessed || 0)) {
      return tab.id < oldest.id ? tab : oldest;
    }
    return (tab.lastAccessed || 0) < (oldest.lastAccessed || 0) ? tab : oldest;
  }, tabs[0]);
}

function buildScopeQuery(scope) {
  if (scope === "current-window") {
    return { currentWindow: true };
  }
  return {};
}

function buildComparisonToken(rawUrl, ignoreQuery) {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl);
    const pathname = trimTrailingSlash(parsed.pathname);
    const search = ignoreQuery ? "" : parsed.search;
    return `${parsed.protocol}//${parsed.host}${pathname}${search}`;
  } catch (error) {
    return rawUrl;
  }
}

export function normalizeUrl(rawUrl, ignoreQuery = false) {
  return buildComparisonToken(rawUrl, ignoreQuery);
}

function hostnameFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, "");
  } catch (error) {
    return rawUrl;
  }
}

function trimTrailingSlash(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function shouldSkipUrl(url) {
  try {
    const parsed = new URL(url);
    return SPECIAL_PROTOCOLS.includes(parsed.protocol);
  } catch (error) {
    // If it's not a valid URL, we skip deduping it to be safe
    return true;
  }
}

function minifyTab(tab) {
  return {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    windowId: tab.windowId,
    index: tab.index,
    active: tab.active,
    pinned: tab.pinned,
    discarded: tab.discarded,
    audible: tab.audible,
    lastAccessed: tab.lastAccessed || 0
  };
}

function queryTabs(queryInfo = {}) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(tabs);
      }
    });
  });
}

function removeTabs(tabIds) {
  return new Promise((resolve, reject) => {
    chrome.tabs.remove(tabIds, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}
