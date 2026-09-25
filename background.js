/**
 * BountyRadar Background Service Worker / Script
 * Handles:
 * - Periodic autonomous feed syncing & diff tracking
 * - In-app auto-update checking against GitHub releases
 * - Active tab target sniffer (instant scope detection)
 * - Hunter bookmarks & private recon notes persistence
 * - Desktop notifications & toolbar badge management
 */

if (typeof importScripts === "function") {
  importScripts("feeds.js");
}

const STORAGE_KEYS = {
  PROGRAMS: "BOUNTYRADAR_PROGRAMS",
  KNOWN_IDS: "BOUNTYRADAR_KNOWN_IDS",
  LAST_SYNC: "BOUNTYRADAR_LAST_SYNC",
  NEW_COUNT: "BOUNTYRADAR_NEW_COUNT",
  SETTINGS: "BOUNTYRADAR_SETTINGS",
  BOOKMARKS: "BOUNTYRADAR_BOOKMARKS",
  NOTES: "BOUNTYRADAR_NOTES",
  UPDATE_INFO: "BOUNTYRADAR_UPDATE_INFO"
};

const UPDATE_CHECK_URL = "https://raw.githubusercontent.com/tejassroot/BountyRadar/main/version.json";
const ALARM_NAME = "bountyradar_periodic_sync";
const UPDATE_ALARM_NAME = "bountyradar_check_update";

let isSyncing = false;
let activeTabMatch = null;

async function getStorageData() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.PROGRAMS,
    STORAGE_KEYS.KNOWN_IDS,
    STORAGE_KEYS.LAST_SYNC,
    STORAGE_KEYS.NEW_COUNT,
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.BOOKMARKS,
    STORAGE_KEYS.NOTES,
    STORAGE_KEYS.UPDATE_INFO
  ]);

  return {
    programs: Array.isArray(data[STORAGE_KEYS.PROGRAMS]) ? data[STORAGE_KEYS.PROGRAMS] : [],
    knownIds: Array.isArray(data[STORAGE_KEYS.KNOWN_IDS]) ? new Set(data[STORAGE_KEYS.KNOWN_IDS]) : new Set(),
    lastSync: data[STORAGE_KEYS.LAST_SYNC] || 0,
    newCount: data[STORAGE_KEYS.NEW_COUNT] || 0,
    settings: data[STORAGE_KEYS.SETTINGS] || { syncIntervalMinutes: 360, notifications: true },
    bookmarks: Array.isArray(data[STORAGE_KEYS.BOOKMARKS]) ? data[STORAGE_KEYS.BOOKMARKS] : [],
    notes: data[STORAGE_KEYS.NOTES] || {},
    updateInfo: data[STORAGE_KEYS.UPDATE_INFO] || null,
    activeTabMatch
  };
}

async function updateBadge(count) {
  if (activeTabMatch) {
    // If currently browsing an active in-scope target, keep target icon
    return;
  }
  try {
    if (count > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });
      await chrome.action.setBadgeText({ text: String(count) });
    } else {
      await chrome.action.setBadgeText({ text: "" });
    }
  } catch (err) {
    console.debug("Badge update skipped:", err);
  }
}

// Version comparison utility
function compareVersions(v1, v2) {
  const p1 = (v1 || "0").split(".").map(Number);
  const p2 = (v2 || "0").split(".").map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

// In-app Auto-Update Checker against GitHub
async function checkExtensionUpdate() {
  try {
    const res = await fetch(`${UPDATE_CHECK_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const remote = await res.json();
    const manifest = chrome.runtime.getManifest();
    const localVersion = manifest.version;

    if (remote && remote.version && compareVersions(remote.version, localVersion) > 0) {
      const updateData = {
        hasUpdate: true,
        currentVersion: localVersion,
        newVersion: remote.version,
        name: remote.name || `BountyRadar v${remote.version}`,
        downloadUrl: remote.downloadUrl || "https://github.com/tejassroot/BountyRadar/releases/latest",
        zipUrl: remote.zipUrl || "https://raw.githubusercontent.com/tejassroot/BountyRadar/main/dist/bountyradar-latest.zip",
        changelog: remote.changelog || [],
        checkedAt: Date.now()
      };
      await chrome.storage.local.set({ [STORAGE_KEYS.UPDATE_INFO]: updateData });

      if (chrome.notifications) {
        chrome.notifications.create("bountyradar_new_release", {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "BountyRadar Update Available! 🚀",
          message: `Version ${remote.version} is available on GitHub with fresh features!`
        });
      }
      return updateData;
    } else {
      await chrome.storage.local.remove(STORAGE_KEYS.UPDATE_INFO);
      return { hasUpdate: false, currentVersion: localVersion };
    }
  } catch (err) {
    console.debug("Update check skipped:", err);
    return null;
  }
}

// Active Tab Target Sniffer (Evaluates if current browser tab is in-scope)
function matchDomainAgainstPrograms(host, programs) {
  if (!host || !programs || programs.length === 0) return null;
  const cleanHost = host.toLowerCase().trim();

  for (const prog of programs) {
    if (!prog) continue;

    // Check program URL hostname
    try {
      if (new URL(prog.url).hostname.toLowerCase() === cleanHost) return prog;
    } catch (_) {}

    // Check domains list (exact + wildcard)
    if (Array.isArray(prog.domains)) {
      for (const d of prog.domains) {
        const cleanD = d.toLowerCase().trim();
        if (cleanD === cleanHost) return prog;

        if (cleanD.startsWith("*.")) {
          const root = cleanD.slice(2);
          if (cleanHost === root || cleanHost.endsWith("." + root)) {
            return prog;
          }
        }
      }
    }
  }
  return null;
}

async function evaluateTab(tabId, url) {
  if (!url || !url.startsWith("http")) {
    activeTabMatch = null;
    const { newCount } = await getStorageData();
    updateBadge(newCount);
    try {
      chrome.action.setTitle({ title: "BountyRadar" });
    } catch (_) {}
    return;
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const { programs, newCount } = await getStorageData();
    const matched = matchDomainAgainstPrograms(host, programs);

    if (matched) {
      activeTabMatch = {
        host,
        program: matched,
        matchedAt: Date.now()
      };
      await chrome.action.setBadgeBackgroundColor({ color: matched.hasBounty ? "#10b981" : "#06b6d4" });
      await chrome.action.setBadgeText({ text: matched.hasBounty ? "💰" : "🎯" });
      chrome.action.setTitle({
        title: `BountyRadar: 🎯 In-Scope [${matched.name}] (${matched.hasBounty ? "Bounty" : "VDP"})`
      });
    } else {
      activeTabMatch = null;
      updateBadge(newCount);
      chrome.action.setTitle({ title: "BountyRadar" });
    }
  } catch (err) {
    console.debug("evaluateTab error:", err);
  }
}

// Listen to tab events for Active Tab Sniffer
chrome.tabs?.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      evaluateTab(activeInfo.tabId, tab.url);
    }
  } catch (_) {}
});

chrome.tabs?.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active && tab.url) {
    evaluateTab(tabId, tab.url);
  }
});

async function syncFeeds(isPeriodic = false) {
  if (isSyncing) return { status: "already_syncing" };
  isSyncing = true;

  try {
    const { programs: currentPrograms, knownIds, settings } = await getStorageData();
    const fetched = await fetchAllFeeds();
    if (!fetched || fetched.length === 0) {
      isSyncing = false;
      return { status: "empty_or_failed" };
    }

    const now = Date.now();
    const isFirstRun = knownIds.size === 0;
    const updatedPrograms = [];
    const updatedKnownIds = new Set(knownIds);
    let newlyFoundCount = 0;
    let newSelfHostedCount = 0;

    const currentMap = new Map();
    for (const p of currentPrograms) {
      currentMap.set(p.id.toLowerCase(), p);
    }

    for (const item of fetched) {
      const key = item.id.toLowerCase();
      const existing = currentMap.get(key);

      if (!existing && !isFirstRun) {
        newlyFoundCount++;
        if (item.isSelfHosted) newSelfHostedCount++;
        updatedKnownIds.add(key);
        updatedPrograms.push({
          ...item,
          firstSeen: now,
          isNew: true
        });
      } else if (existing) {
        // Check if bounty escalated
        const wasVdpOnly = !existing.hasBounty && item.hasBounty;
        updatedPrograms.push({
          ...item,
          firstSeen: existing.firstSeen || now,
          isNew: existing.isNew || wasVdpOnly,
          isEscalated: wasVdpOnly
        });
      } else {
        const isFreshSeed = updatedPrograms.filter((p) => p.isNew).length < 15;
        if (isFreshSeed) {
          newlyFoundCount++;
          if (item.isSelfHosted) newSelfHostedCount++;
        }
        updatedKnownIds.add(key);
        updatedPrograms.push({
          ...item,
          firstSeen: now - Math.floor(Math.random() * 86400000 * 3),
          isNew: isFreshSeed
        });
      }
    }

    updatedPrograms.sort((a, b) => {
      if (a.isNew && !b.isNew) return -1;
      if (!a.isNew && b.isNew) return 1;
      return a.name.localeCompare(b.name);
    });

    const totalNewCount = newlyFoundCount;

    await chrome.storage.local.set({
      [STORAGE_KEYS.PROGRAMS]: updatedPrograms,
      [STORAGE_KEYS.KNOWN_IDS]: Array.from(updatedKnownIds),
      [STORAGE_KEYS.LAST_SYNC]: now,
      [STORAGE_KEYS.NEW_COUNT]: totalNewCount
    });

    await updateBadge(totalNewCount);

    if (totalNewCount > 0 && settings.notifications && chrome.notifications) {
      const msg = newSelfHostedCount > 0
        ? `Found ${totalNewCount} new bug bounty programs (${newSelfHostedCount} self-hosted)!`
        : `Found ${totalNewCount} new bug bounty programs!`;

      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: "BountyRadar Discovery",
        message: msg
      });
    }

    // Also run auto-update check during periodic sync
    checkExtensionUpdate();

    return {
      status: "success",
      total: updatedPrograms.length,
      newCount: totalNewCount,
      lastSync: now
    };
  } catch (err) {
    console.error("Error during feed sync:", err);
    return { status: "error", error: String(err) };
  } finally {
    isSyncing = false;
  }
}

async function markAllAsRead() {
  const { programs } = await getStorageData();
  const cleaned = programs.map((p) => ({ ...p, isNew: false, isEscalated: false }));
  await chrome.storage.local.set({
    [STORAGE_KEYS.PROGRAMS]: cleaned,
    [STORAGE_KEYS.NEW_COUNT]: 0
  });
  await updateBadge(0);
}

// Alarm initialization
async function setupAlarms() {
  const { settings } = await getStorageData();
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: settings.syncIntervalMinutes || 360
  });
  // Check updates every 12 hours
  chrome.alarms.create(UPDATE_ALARM_NAME, {
    periodInMinutes: 720
  });
}

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    syncFeeds(true);
  } else if (alarm.name === UPDATE_ALARM_NAME) {
    checkExtensionUpdate();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  setupAlarms();
  syncFeeds(false);
  checkExtensionUpdate();
});

chrome.runtime.onStartup.addListener(async () => {
  const { lastSync, programs } = await getStorageData();
  const oneHour = 60 * 60 * 1000;
  if (!lastSync || programs.length === 0 || Date.now() - lastSync > oneHour) {
    syncFeeds(true);
  }
  checkExtensionUpdate();
});

// Messaging interface
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "BOUNTYRADAR_GET_STATE") {
    getStorageData().then((state) => {
      sendResponse({
        ok: true,
        ...state,
        isSyncing
      });
    });
    return true;
  }

  if (msg.type === "BOUNTYRADAR_FORCE_SYNC") {
    syncFeeds(false).then((res) => {
      sendResponse({ ok: true, ...res });
    });
    return true;
  }

  if (msg.type === "BOUNTYRADAR_CHECK_UPDATE") {
    checkExtensionUpdate().then((updateInfo) => {
      sendResponse({ ok: true, updateInfo });
    });
    return true;
  }

  if (msg.type === "BOUNTYRADAR_MARK_READ") {
    markAllAsRead().then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "BOUNTYRADAR_TOGGLE_BOOKMARK") {
    getStorageData().then(async ({ bookmarks }) => {
      const id = msg.id;
      let updated = [];
      if (bookmarks.includes(id)) {
        updated = bookmarks.filter((b) => b !== id);
      } else {
        updated = [...bookmarks, id];
      }
      await chrome.storage.local.set({ [STORAGE_KEYS.BOOKMARKS]: updated });
      sendResponse({ ok: true, bookmarks: updated, isBookmarked: updated.includes(id) });
    });
    return true;
  }

  if (msg.type === "BOUNTYRADAR_SAVE_NOTE") {
    getStorageData().then(async ({ notes }) => {
      const updated = { ...notes };
      const noteContent = (msg.note || "").trim();
      if (noteContent) {
        updated[msg.id] = noteContent;
      } else {
        delete updated[msg.id];
      }
      await chrome.storage.local.set({ [STORAGE_KEYS.NOTES]: updated });
      sendResponse({ ok: true, notes: updated });
    });
    return true;
  }

  return false;
});
