import { deduplicateTabs, loadSettings } from "./scripts/tabTools.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "deduplicate-tabs") return;

  try {
    const settings = await loadSettings();
    const { removed } = await deduplicateTabs(settings);
    const badgeText = removed ? `-${removed}` : "";
    chrome.action.setBadgeText({ text: badgeText });
    if (removed) {
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
      }, 4000);
    }
  } catch (error) {
    console.error("Simple Tab Deduplicate command failed", error);
  }
});
