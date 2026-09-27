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

  const defaultSettings = {
    syncIntervalMinutes: 360,
    notifications: true,
    telegram: { enabled: false, botToken: "", chatId: "" },
    email: { enabled: false, apiKey: "", toEmail: "" }
  };
  const storedSettings = data[STORAGE_KEYS.SETTINGS] || {};
  const settings = {
    ...defaultSettings,
    ...storedSettings,
    telegram: { ...defaultSettings.telegram, ...(storedSettings.telegram || {}) },
    email: { ...defaultSettings.email, ...(storedSettings.email || {}) }
  };

  return {
    programs: Array.isArray(data[STORAGE_KEYS.PROGRAMS]) ? data[STORAGE_KEYS.PROGRAMS] : [],
    knownIds: Array.isArray(data[STORAGE_KEYS.KNOWN_IDS]) ? new Set(data[STORAGE_KEYS.KNOWN_IDS]) : new Set(),
    lastSync: data[STORAGE_KEYS.LAST_SYNC] || 0,
    newCount: data[STORAGE_KEYS.NEW_COUNT] || 0,
    settings,
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

const PLATFORM_HOSTS = new Set([
  "hackerone.com", "bugcrowd.com", "intigriti.com", "yeswehack.com",
  "hackenproof.com", "bugbounty.ch", "openbugbounty.org", "federacy.com"
]);

// Active Tab Target Sniffer (Evaluates if current browser tab is in-scope)
function matchDomainAgainstPrograms(host, programs) {
  if (!host || !programs || programs.length === 0) return null;
  const cleanHost = host.toLowerCase().trim();

  for (const prog of programs) {
    if (!prog) continue;

    // Check program URL hostname ONLY if self-hosted (avoid matching shared platforms like hackerone.com)
    if (prog.isSelfHosted || prog.platform === "Self-Hosted") {
      try {
        const uHost = new URL(prog.url).hostname.replace(/^www\./, "").toLowerCase();
        if (uHost && !PLATFORM_HOSTS.has(uHost)) {
          if (cleanHost === uHost || cleanHost.endsWith("." + uHost)) return prog;
        }
      } catch (_) {}
    }

    // Check domains list (exact + wildcard + subdomains)
    if (Array.isArray(prog.domains)) {
      for (const d of prog.domains) {
        const cleanD = d.toLowerCase().trim();
        if (cleanD === cleanHost) return prog;

        if (cleanD.startsWith("*.")) {
          const root = cleanD.slice(2);
          if (cleanHost === root || cleanHost.endsWith("." + root)) {
            return prog;
          }
        } else if (cleanD.includes(".") && !cleanD.startsWith(".") && cleanHost.endsWith("." + cleanD)) {
          return prog;
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

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendTelegramAlert(botToken, chatId, programs, isTest = false) {
  if (!botToken || !chatId) {
    return { ok: false, error: "Bot token or Chat ID is missing." };
  }

  let text = "";
  if (isTest) {
    text = `📡 <b>BountyRadar Connected!</b>\n\n` +
      `Your Telegram alert webhook integration is working properly.\n` +
      `You will receive immediate alerts whenever newly launched bug bounty programs or updated scopes are detected.`;
  } else {
    if (!programs || programs.length === 0) return { ok: true };
    const count = programs.length;
    text = `🚨 <b>BountyRadar Discovery Alert</b>\n` +
      `Found <b>${count}</b> newly discovered bug bounty program${count > 1 ? "s" : ""}!\n\n`;

    const sample = programs.slice(0, 5);
    sample.forEach((p, idx) => {
      const type = p.hasBounty ? "💰 Bounty" : "🎯 VDP";
      const host = p.isSelfHosted ? "🌐 Self-Hosted" : `🏢 ${escapeHtml(p.platform)}`;
      const name = escapeHtml(p.name || "Unknown");
      const url = escapeHtml(p.url || "#");
      text += `${idx + 1}. <b><a href="${url}">${name}</a></b>\n`;
      text += `• Type: ${type} | ${host}\n`;
      if (p.domains && p.domains.length > 0) {
        const topDomains = escapeHtml(p.domains.slice(0, 3).join(", "));
        text += `• In-Scope: <code>${topDomains}</code>\n`;
      }
      text += `\n`;
    });

    if (count > 5) {
      text += `<i>...and ${count - 5} more programs available in BountyRadar.</i>`;
    }
  }

  // Ensure message stays safely within Telegram's 4096 character limit
  if (text.length > 4000) {
    text = text.slice(0, 3950) + "...\n<i>(truncated)</i>";
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || !result.ok) {
      const errMsg = result.description || `HTTP ${res.status}`;
      console.warn("Telegram alert failed:", errMsg);
      return { ok: false, error: errMsg };
    }
    return { ok: true };
  } catch (err) {
    console.error("Error sending Telegram alert:", err);
    return { ok: false, error: String(err.message || err) };
  }
}

async function sendEmailAlert(apiKey, toEmail, programs, isTest = false) {
  if (!apiKey || !toEmail) {
    return { ok: false, error: "Resend API key or recipient email is missing." };
  }

  let subject = "";
  let html = "";

  if (isTest) {
    subject = "[BountyRadar] 📡 Alert Notification Test";
    html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; padding: 24px; background: #0b1120; color: #e2e8f0; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.3);">
        <h2 style="color: #38bdf8; margin-top: 0;">📡 BountyRadar Connected!</h2>
        <p>Your email notification integration via Resend is working properly.</p>
        <p style="color: #94a3b8;">You will receive automated digest alerts whenever fresh bug bounty targets and newly published VDP scopes are detected.</p>
        <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;" />
        <small style="color: #64748b;">BountyRadar Autonomous Discovery Engine</small>
      </div>
    `;
  } else {
    if (!programs || programs.length === 0) return { ok: true };
    const count = programs.length;
    subject = `[BountyRadar] 🔥 ${count} New Bug Bounty Programs Discovered`;
    let itemsHtml = "";
    programs.slice(0, 8).forEach((p) => {
      const type = p.hasBounty ? "💰 Bounty" : "🎯 VDP";
      const host = p.isSelfHosted ? "🌐 Self-Hosted" : escapeHtml(p.platform);
      const name = escapeHtml(p.name || "Unknown");
      const url = escapeHtml(p.url || "#");
      const domains = p.domains && p.domains.length > 0 ? escapeHtml(p.domains.slice(0, 3).join(", ")) : "Listed in policy";
      itemsHtml += `
        <li style="margin-bottom: 14px; background: #131b2e; padding: 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
          <strong style="font-size: 15px;"><a href="${url}" style="color: #38bdf8; text-decoration: none;">${name}</a></strong>
          <span style="color: #94a3b8; font-size: 12px; margin-left: 8px;">(${host})</span><br/>
          <span style="display: inline-block; margin-top: 4px; font-size: 12px; color: #10b981;">${type}</span><br/>
          <code style="background: rgba(0,0,0,0.3); color: #cbd5e1; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${domains}</code>
        </li>
      `;
    });

    html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; padding: 24px; background: #0b1120; color: #e2e8f0; border-radius: 8px;">
        <h2 style="color: #38bdf8; margin-top: 0;">🚨 Fresh Bug Bounty Targets Found</h2>
        <p>BountyRadar detected <strong>${count}</strong> newly added or escalated programs:</p>
        <ul style="list-style: none; padding-left: 0;">
          ${itemsHtml}
        </ul>
        ${count > 8 ? `<p style="color: #94a3b8;"><em>...plus ${count - 8} more programs available in the BountyRadar extension.</em></p>` : ""}
        <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 20px 0;" />
        <small style="color: #64748b;">BountyRadar Autonomous Discovery Engine</small>
      </div>
    `;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "BountyRadar Alerts <onboarding@resend.dev>",
        to: [toEmail],
        subject: subject,
        html: html
      })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = result.message || `HTTP ${res.status}`;
      console.warn("Resend email alert failed:", errMsg);
      return { ok: false, error: errMsg };
    }
    return { ok: true };
  } catch (err) {
    console.error("Error sending email alert:", err);
    return { ok: false, error: String(err.message || err) };
  }
}

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

    if (totalNewCount > 0) {
      if (settings.notifications && chrome.notifications) {
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

      // External Push Alerts (Telegram & Email)
      if (!isFirstRun) {
        const freshList = updatedPrograms.filter((p) => p.isNew);
        if (settings.telegram?.enabled && settings.telegram?.botToken && settings.telegram?.chatId) {
          sendTelegramAlert(settings.telegram.botToken, settings.telegram.chatId, freshList).catch((err) => {
            console.debug("Background Telegram alert failed:", err);
          });
        }
        if (settings.email?.enabled && settings.email?.apiKey && settings.email?.toEmail) {
          sendEmailAlert(settings.email.apiKey, settings.email.toEmail, freshList).catch((err) => {
            console.debug("Background Email alert failed:", err);
          });
        }
      }
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

  if (msg.type === "BOUNTYRADAR_SAVE_SETTINGS") {
    getStorageData().then(async ({ settings: currentSettings }) => {
      const newSettings = {
        ...currentSettings,
        ...(msg.settings || {})
      };
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: newSettings });
      sendResponse({ ok: true, settings: newSettings });
    });
    return true;
  }

  if (msg.type === "BOUNTYRADAR_TEST_TELEGRAM") {
    sendTelegramAlert(msg.botToken, msg.chatId, null, true).then((res) => {
      sendResponse(res);
    });
    return true;
  }

  if (msg.type === "BOUNTYRADAR_TEST_EMAIL") {
    sendEmailAlert(msg.apiKey, msg.toEmail, null, true).then((res) => {
      sendResponse(res);
    });
    return true;
  }

  return false;
});
