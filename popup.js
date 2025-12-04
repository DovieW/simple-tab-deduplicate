import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  computeDuplicateSummary,
  deduplicateTabs,
  selectTabsToClose,
  closeSpecificTabs,
  determineKeeper
} from "./scripts/tabTools.js";

const form = document.getElementById("controls-form");
const refreshButton = document.getElementById("refresh-button");
const dedupeButton = document.getElementById("dedupe-button");
const statusText = document.getElementById("status-text");
const groupList = document.getElementById("group-list");
const emptyState = document.getElementById("empty-state");
const groupsNote = document.querySelector('[data-field="groups-note"]');
const statFields = document.querySelectorAll("[data-field]");

const state = {
  settings: { ...DEFAULT_SETTINGS },
  summary: null,
  refreshToken: 0,
  messageTimer: null
};

init();

async function init() {
  try {
    setProcessing(true);
    state.settings = await loadSettings();
    hydrateForm(state.settings);
    attachListeners();
    await refreshSummary();
    showStatus("Ready.");
  } catch (error) {
    console.error("Simple Tab Deduplicate init failed", error);
    showStatus("Failed to load tabs.", "error");
  } finally {
    setProcessing(false);
  }
}

function attachListeners() {
  form.addEventListener("change", handleSettingChange);
  refreshButton.addEventListener("click", () => refreshSummary());
  form.addEventListener("submit", handleSubmit);
}

function handleSettingChange(event) {
  const { name, type, value, checked } = event.target;
  if (!name) return;
  const nextValue = type === "checkbox" ? checked : value;
  state.settings = { ...state.settings, [name]: nextValue };
  saveSettings(state.settings).catch((error) => console.warn("Failed to save settings", error));
  refreshSummary();
}

async function handleSubmit(event) {
  event.preventDefault();
  setProcessing(true);
  try {
    await saveSettings(state.settings);
    const { removed } = await deduplicateTabs(state.settings);
    if (removed) {
      showStatus(`Closed ${removed} duplicate ${removed === 1 ? "tab" : "tabs"}.`, "success");
    } else {
      showStatus("No duplicates to close.");
    }
    await refreshSummary();
  } catch (error) {
    console.error("Deduplication failed", error);
    showStatus("Deduplication failed.", "error");
  } finally {
    setProcessing(false);
  }
}

async function refreshSummary() {
  const runId = ++state.refreshToken;
  indicateLoading(true);
  try {
    const { summary } = await computeDuplicateSummary(state.settings);
    if (runId !== state.refreshToken) return;
    state.summary = summary;
    updateStats(summary);
    renderGroups(summary.duplicateSets);
  } catch (error) {
    console.error("Unable to compute duplicate summary", error);
    showStatus("Unable to refresh tabs.", "error");
  } finally {
    if (runId === state.refreshToken) {
      indicateLoading(false);
    }
  }
}

function updateStats(summary) {
  statFields.forEach((node) => {
    const field = node.dataset.field;
    if (!field) return;
    if (field === "groups-note") return;
    let value = summary[field];
    if (field === "duplicateSets") {
      value = summary.duplicateSets.length;
    }
    node.textContent = formatNumber(value ?? 0);
  });

  if (groupsNote) {
    const count = summary.duplicateSets.length;
    const closable = summary.possibleClosures;
    groupsNote.textContent = count
      ? `${count} ${count === 1 ? "set" : "sets"} • ${closable} closable`
      : "No duplicates detected";
  }
}

function renderGroups(groups) {
  groupList.innerHTML = "";
  if (!groups.length) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  groups.forEach((group) => {
    const keeper = determineKeeper(group.tabs, state.settings.strategy);
    const li = document.createElement("li");
    li.className = "group-card";

    const header = document.createElement("div");
    header.className = "group-header";

    const title = document.createElement("div");
    title.className = "group-title";
    title.textContent = group.hostname || group.normalizedUrl;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = `${group.tabs.length} tabs`;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "ghost";
    closeBtn.textContent = "Close extras";
    closeBtn.addEventListener("click", () => closeGroup(group, closeBtn));

    header.append(title, badge, closeBtn);

    const tabList = document.createElement("ul");
    tabList.className = "tab-list";

    group.tabs.forEach((tab) => {
      const row = document.createElement("li");
      row.className = "tab-row";
      if (keeper && tab.id === keeper.id) {
        row.classList.add("keep");
      }

      const info = document.createElement("div");
      info.className = "tab-info";
      info.style.cursor = "pointer";
      info.addEventListener("click", () => focusTab(tab));

      const tabTitle = document.createElement("p");
      tabTitle.textContent = tab.title || "(Untitled tab)";
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = `last active ${formatRelativeTime(tab.lastAccessed)}`;
      info.append(tabTitle, meta);

      const flags = document.createElement("div");
      flags.className = "flags";
      generateFlags(tab).forEach((flag) => {
        const span = document.createElement("span");
        span.className = "flag";
        span.textContent = flag;
        flags.append(span);
      });

      row.append(info, flags);
      tabList.append(row);
    });

    li.append(header, tabList);
    groupList.append(li);
  });
}

async function closeGroup(group, button) {
  const ids = selectTabsToClose([group], state.settings.strategy);
  if (!ids.length) {
    showStatus("Nothing to close for this set.");
    return;
  }
  button.disabled = true;
  try {
    await closeSpecificTabs(ids);
    showStatus(`Closed ${ids.length} ${ids.length === 1 ? "tab" : "tabs"}.`, "success");
    await refreshSummary();
  } catch (error) {
    console.error("Failed to close tabs", error);
    showStatus("Close request failed.", "error");
  } finally {
    button.disabled = false;
  }
}

function hydrateForm(settings) {
  const controls = form.querySelectorAll("input[name]");
  controls.forEach((control) => {
    const { name, type, value } = control;
    if (type === "radio") {
      control.checked = settings[name] === value;
    } else if (type === "checkbox") {
      control.checked = Boolean(settings[name]);
    }
  });
}

function setProcessing(isProcessing) {
  document.body.dataset.busy = isProcessing ? "true" : "false";
  dedupeButton.disabled = isProcessing;
  refreshButton.disabled = isProcessing;
}

function indicateLoading(isLoading) {
  if (!groupsNote) return;
  groupsNote.textContent = isLoading ? "Refreshing…" : groupsNote.textContent;
}

function showStatus(message, variant = "info") {
  statusText.dataset.variant = variant;
  statusText.textContent = message;
  if (state.messageTimer) {
    clearTimeout(state.messageTimer);
  }
  if (variant !== "error") {
    state.messageTimer = setTimeout(() => {
      statusText.textContent = "";
    }, 3500);
  }
}

function generateFlags(tab) {
  const flags = [];
  if (tab.active) flags.push("Active");
  if (tab.pinned) flags.push("Pinned");
  if (tab.audible) flags.push("Audio");
  if (tab.discarded) flags.push("Sleeping");
  return flags;
}

function focusTab(tab) {
  chrome.tabs.update(tab.id, { active: true }, () => {
    chrome.windows.update(tab.windowId, { focused: true });
  });
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "unknown";
  const diff = Date.now() - timestamp;
  if (diff < 1000) return "just now";
  const units = [
    { label: "d", ms: 86_400_000 },
    { label: "h", ms: 3_600_000 },
    { label: "m", ms: 60_000 }
  ];
  for (const unit of units) {
    if (diff >= unit.ms) {
      const value = Math.floor(diff / unit.ms);
      return `${value}${unit.label} ago`;
    }
  }
  return `${Math.floor(diff / 1000)}s ago`;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}
