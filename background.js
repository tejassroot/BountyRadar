/**
 * BountyRadar Background Service Worker / Script
 * Handles periodic autonomous feed syncing, diff tracking, and desktop notifications.
 */

if (typeof importScripts === "function") {
  importScripts("feeds.js");
}

const STORAGE_KEYS = {
  PROGRAMS: "BOUNTYRADAR_PROGRAMS",
  KNOWN_IDS: "BOUNTYRADAR_KNOWN_IDS",
  LAST_SYNC: "BOUNTYRADAR_LAST_SYNC",
  NEW_COUNT: "BOUNTYRADAR_NEW_COUNT",
  SETTINGS: "BOUNTYRADAR_SETTINGS"
};

const ALARM_NAME = "bountyradar_periodic_sync";
let isSyncing = false;

async function getStorageData() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.PROGRAMS,
    STORAGE_KEYS.KNOWN_IDS,
    STORAGE_KEYS.LAST_SYNC,
    STORAGE_KEYS.NEW_COUNT,
    STORAGE_KEYS.SETTINGS
  ]);

  return {
    programs: Array.isArray(data[STORAGE_KEYS.PROGRAMS]) ? data[STORAGE_KEYS.PROGRAMS] : [],
    knownIds: Array.isArray(data[STORAGE_KEYS.KNOWN_IDS]) ? new Set(data[STORAGE_KEYS.KNOWN_IDS]) : new Set(),
    lastSync: data[STORAGE_KEYS.LAST_SYNC] || 0,
    newCount: data[STORAGE_KEYS.NEW_COUNT] || 0,
    settings: data[STORAGE_KEYS.SETTINGS] || { syncIntervalMinutes: 360, notifications: true }
  };
}

async function updateBadge(count) {
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

async function syncFeeds(isPeriodic = false) {
  if (isSyncing) return { status: "already_syncing" };
  isSyncing = true;

  try {
    const { programs: currentPrograms, knownIds, lastSync, settings } = await getStorageData();
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

    // Existing program lookup by ID/URL
    const currentMap = new Map();
    for (const p of currentPrograms) {
      currentMap.set(p.id.toLowerCase(), p);
    }

    for (const item of fetched) {
      const key = item.id.toLowerCase();
      const existing = currentMap.get(key);

      if (!existing && !isFirstRun) {
        // Discovered as brand new!
        newlyFoundCount++;
        if (item.isSelfHosted) newSelfHostedCount++;
        updatedKnownIds.add(key);
        updatedPrograms.push({
          ...item,
          firstSeen: now,
          isNew: true
        });
      } else if (existing) {
        // Retain existing firstSeen and isNew flags
        updatedPrograms.push({
          ...item,
          firstSeen: existing.firstSeen || now,
          isNew: existing.isNew || false
        });
      } else {
        // First run initialization: seed top 15 programs as fresh discoveries
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

    // Sort: Fresh/New first, then by name
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
  const cleaned = programs.map((p) => ({ ...p, isNew: false }));
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
}

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    syncFeeds(true);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  setupAlarms();
  syncFeeds(false);
});

chrome.runtime.onStartup.addListener(async () => {
  const { lastSync, programs } = await getStorageData();
  const oneHour = 60 * 60 * 1000;
  if (!lastSync || programs.length === 0 || Date.now() - lastSync > oneHour) {
    syncFeeds(true);
  }
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

  if (msg.type === "BOUNTYRADAR_MARK_READ") {
    markAllAsRead().then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});
