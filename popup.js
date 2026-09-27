/**
 * BountyRadar Ultra-Pro Controller (v1.2)
 * Manages:
 * - Reactive state & 5-card bento grid
 * - In-app auto-update notifications
 * - Active tab target sniffer (current browsing scope detection)
 * - Multi-tool recon exporters (Burp Suite Target Scope, Nuclei, Subfinder, JSON)
 * - Hunter bookmarks (⭐) and confidential recon notes (📝)
 * - Asset category tags (Web, API, Mobile, Cloud, Crypto, Hardware)
 * - Zero-click autonomous background sync
 */

const state = {
  programs: [],
  bookmarks: [],
  notes: {},
  updateInfo: null,
  activeTabMatch: null,
  lastSync: 0,
  newCount: 0,
  isSyncing: false,
  activeFilter: "all",
  activeCountry: "all",
  searchQuery: ""
};

// UI Elements
const programListEl = document.getElementById("program-list");
const loadingEl = document.getElementById("loading-state");
const emptyEl = document.getElementById("empty-state");
const emptyTitleEl = document.getElementById("empty-title");
const searchInput = document.getElementById("search-input");
const searchClearBtn = document.getElementById("search-clear");
const resultsCountPill = document.getElementById("results-count-pill");
const filterTabs = document.querySelectorAll(".tab-btn");
const chipsBtns = document.querySelectorAll(".chip-btn");
const countryChips = document.querySelectorAll(".country-chip");
const metricCards = document.querySelectorAll(".metric-card");
const syncBtn = document.getElementById("sync-btn");
const syncIcon = document.getElementById("sync-icon");
const syncText = document.getElementById("sync-text");
const exportBtn = document.getElementById("export-btn");
const exportMenu = document.getElementById("export-menu");
const exportOptBtns = document.querySelectorAll(".export-opt-btn");
const markReadBtn = document.getElementById("mark-read-btn");
const lastSyncLabel = document.getElementById("last-sync-label");
const toastEl = document.getElementById("toast-notify");
const toastMsg = document.getElementById("toast-msg");
const toastIcon = document.getElementById("toast-icon");

// Update Banner Elements
const updateBanner = document.getElementById("update-banner");
const updateTitle = document.getElementById("update-title");
const updateDesc = document.getElementById("update-desc");
const updateDownloadBtn = document.getElementById("update-download-btn");
const updateReleaseBtn = document.getElementById("update-release-btn");
const updateDismissBtn = document.getElementById("update-dismiss-btn");

// Active Tab Sniffer Elements
const activeTabBanner = document.getElementById("active-tab-banner");
const activeTabName = document.getElementById("active-tab-name");
const activeTabReward = document.getElementById("active-tab-reward");
const activeTabDomains = document.getElementById("active-tab-domains");
const activeTabCopyBtn = document.getElementById("active-tab-copy-btn");
const activeTabPolicyLink = document.getElementById("active-tab-policy-link");

// Settings & Webhooks Modal Elements
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const settingsCloseBtn = document.getElementById("settings-close-btn");
const settingsCancelBtn = document.getElementById("settings-cancel-btn");
const settingsSaveBtn = document.getElementById("settings-save-btn");
const settingTgEnabled = document.getElementById("setting-tg-enabled");
const settingTgToken = document.getElementById("setting-tg-token");
const settingTgChatId = document.getElementById("setting-tg-chatid");
const tgToggleVisibility = document.getElementById("tg-toggle-visibility");
const btnTestTelegram = document.getElementById("btn-test-telegram");
const tgTestStatus = document.getElementById("tg-test-status");
const tgFieldsGroup = document.getElementById("tg-fields-group");
const settingEmailEnabled = document.getElementById("setting-email-enabled");
const settingEmailKey = document.getElementById("setting-email-key");
const settingEmailTo = document.getElementById("setting-email-to");
const emailToggleVisibility = document.getElementById("email-toggle-visibility");
const btnTestEmail = document.getElementById("btn-test-email");
const emailTestStatus = document.getElementById("email-test-status");
const emailFieldsGroup = document.getElementById("email-fields-group");

let currentSettings = {
  syncIntervalMinutes: 360,
  notifications: true,
  telegram: { enabled: false, botToken: "", chatId: "" },
  email: { enabled: false, apiKey: "", toEmail: "" }
};

// Metrics Counters
const statTotalEl = document.getElementById("stat-total");
const statTargetsEl = document.getElementById("stat-targets");
const statFreshEl = document.getElementById("stat-fresh");
const statSelfHostedEl = document.getElementById("stat-selfhosted");
const statPrivateEl = document.getElementById("stat-private");

let toastTimer = null;
function showToast(message, icon = "✓") {
  if (toastTimer) clearTimeout(toastTimer);
  toastMsg.textContent = message;
  toastIcon.textContent = icon;
  toastEl.classList.remove("hidden");
  toastTimer = setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 2200);
}

function timeAgo(timestamp) {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function updateMetrics() {
  statTotalEl.textContent = state.programs.length.toLocaleString();

  const totalTargets = state.programs.reduce((acc, p) => acc + (p.domains ? p.domains.length : 0), 0);
  if (statTargetsEl) statTargetsEl.textContent = totalTargets.toLocaleString();

  const freshCount = state.programs.filter((p) => p.isNew).length;
  statFreshEl.textContent = freshCount.toLocaleString();

  const selfHostedCount = state.programs.filter((p) => p.isSelfHosted).length;
  statSelfHostedEl.textContent = selfHostedCount.toLocaleString();

  const privateCount = state.programs.filter((p) => p.isPrivate).length;
  if (statPrivateEl) statPrivateEl.textContent = privateCount.toLocaleString();

  lastSyncLabel.textContent = `Last synced: ${timeAgo(state.lastSync)}`;
}

// Category matcher helper for asset types
function checkCategory(p, cat) {
  const domainsStr = Array.isArray(p.domains) ? p.domains.join(" ").toLowerCase() : "";
  const tagsStr = Array.isArray(p.tags) ? p.tags.join(" ").toLowerCase() : "";
  const corpus = `${p.name || ""} ${p.url || ""} ${domainsStr} ${tagsStr}`.toLowerCase();

  switch (cat) {
    case "api":
      return corpus.includes("api") || domainsStr.includes("api.") || domainsStr.includes("graphql");
    case "mobile":
      return corpus.includes("mobile") || corpus.includes("android") || corpus.includes("ios") || corpus.includes("apk");
    case "cloud":
      return corpus.includes("cloud") || corpus.includes("aws") || corpus.includes("azure") || corpus.includes("gcp") || corpus.includes("s3");
    case "crypto":
      return corpus.includes("crypto") || corpus.includes("blockchain") || corpus.includes("wallet") || corpus.includes("token") || corpus.includes("defi");
    case "hardware":
      return corpus.includes("hardware") || corpus.includes("iot") || corpus.includes("device") || corpus.includes("firmware");
    case "web":
    default:
      return Boolean(p.domains && p.domains.length > 0);
  }
}

function matchesFilter(p) {
  if (state.activeCountry !== "all") {
    const pCode = (p.country && p.country.code) || "GL";
    if (state.activeCountry === "GL") {
      if (pCode !== "GL") return false;
    } else if (pCode !== state.activeCountry) {
      return false;
    }
  }

  if (state.activeFilter === "bookmarks") return state.bookmarks.includes(p.id);
  if (state.activeFilter === "wildcards") return Boolean(p.isWildcard);
  if (state.activeFilter === "fresh") return p.isNew;
  if (state.activeFilter === "private") return p.isPrivate;
  if (state.activeFilter === "selfhosted") return p.isSelfHosted;
  if (state.activeFilter === "bugcrowd") return p.platform === "Bugcrowd";
  if (state.activeFilter === "hackerone") return p.platform === "HackerOne";
  if (state.activeFilter === "bounty") return p.hasBounty;
  if (state.activeFilter === "vdp") return !p.hasBounty;

  // Asset category filters
  if (["web", "api", "mobile", "cloud", "crypto", "hardware"].includes(state.activeFilter)) {
    return checkCategory(p, state.activeFilter);
  }

  return true;
}

function matchesSearch(p, query) {
  if (!query) return true;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const domainsStr = Array.isArray(p.domains) ? p.domains.join(" ") : "";
  const tagsStr = Array.isArray(p.tags) ? p.tags.join(" ") : "";
  const userNote = state.notes[p.id] || "";
  const corpus = `${p.name || ""} ${p.url || ""} ${p.platform || ""} ${domainsStr} ${tagsStr} ${userNote} ${p.isWildcard ? "wildcard *. " : ""} ${p.isPrivate ? "private nda unlisted" : ""} ${p.isSelfHosted ? "self-hosted selfhosted independent" : ""} ${p.hasBounty ? "bounty cash paid reward money" : "vdp hall of fame hof free"} ${p.isNew ? "new fresh" : ""}`.toLowerCase();

  return terms.every((term) => {
    if (term === "wildcard" || term === "*") return Boolean(p.isWildcard);
    if (term === "bc") return corpus.includes("bugcrowd");
    if (term === "h1") return corpus.includes("hackerone");
    if (term === "ywh") return corpus.includes("yeswehack");
    if (term === "hof") return corpus.includes("hall of fame") || corpus.includes("hall-of-fame") || corpus.includes("hof");
    if (term === "fresh") return p.isNew || corpus.includes("fresh") || corpus.includes("new");
    if (term === "private") return p.isPrivate || corpus.includes("private") || corpus.includes("nda");
    if (term === "self-hosted" || term === "selfhosted") return p.isSelfHosted || corpus.includes("self-hosted");
    if (term === "bookmarked" || term === "bookmark") return state.bookmarks.includes(p.id);
    if (term === "note" || term === "notes") return Boolean(state.notes[p.id]);
    return corpus.includes(term);
  });
}

const PLATFORM_HOSTS = new Set([
  "hackerone.com", "bugcrowd.com", "intigriti.com", "yeswehack.com",
  "hackenproof.com", "bugbounty.ch", "openbugbounty.org", "federacy.com"
]);

// Active Tab Domain Matcher
function matchDomainAgainstPrograms(host, programs) {
  if (!host || !programs || programs.length === 0) return null;
  const cleanHost = host.toLowerCase().trim();

  for (const prog of programs) {
    if (!prog) continue;

    // Only match prog.url if self-hosted (avoid matching shared bounty platform domains)
    if (prog.isSelfHosted || prog.platform === "Self-Hosted") {
      try {
        const uHost = new URL(prog.url).hostname.replace(/^www\./, "").toLowerCase();
        if (uHost && !PLATFORM_HOSTS.has(uHost)) {
          if (cleanHost === uHost || cleanHost.endsWith("." + uHost)) return prog;
        }
      } catch (_) {}
    }

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

// Bulletproof Cross-Platform Link Opener for Chrome Extension Popups
function openExternalUrl(url) {
  if (!url || url === "#" || url.toLowerCase() === "null") {
    showToast("No policy URL available for this target", "⚠️");
    return;
  }
  let finalUrl = String(url).trim();
  if (!/^https?:\/\//i.test(finalUrl)) {
    finalUrl = "https://" + finalUrl;
  }
  try {
    new URL(finalUrl);
  } catch (_) {
    showToast("Invalid URL destination", "⚠️");
    return;
  }
  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url: finalUrl, active: true });
  } else {
    window.open(finalUrl, "_blank", "noopener,noreferrer");
  }
}

function renderActiveTabBanner(host, prog) {
  if (!prog || !activeTabBanner) return;
  activeTabBanner.classList.remove("hidden");
  activeTabName.textContent = prog.name;
  activeTabReward.textContent = prog.hasBounty ? (prog.maxReward || "Bounty") : "VDP";
  activeTabReward.className = `badge ${prog.hasBounty ? "badge-bounty" : "badge-vdp"}`;

  activeTabPolicyLink.href = prog.url || "#";
  activeTabPolicyLink.title = `Open ${prog.name} rules & policy`;
  activeTabPolicyLink.onclick = (e) => {
    e.preventDefault();
    if (prog.url) {
      openExternalUrl(prog.url);
    } else {
      showToast("No policy URL found for active tab", "⚠️");
    }
  };

  activeTabDomains.replaceChildren();
  if (Array.isArray(prog.domains)) {
    for (const d of prog.domains.slice(0, 4)) {
      const code = document.createElement("code");
      code.textContent = d;
      activeTabDomains.appendChild(code);
    }
    if (prog.domains.length > 4) {
      const more = document.createElement("span");
      more.textContent = `+${prog.domains.length - 4} more`;
      more.style.color = "var(--text-muted)";
      activeTabDomains.appendChild(more);
    }
  }

  activeTabCopyBtn.onclick = () => {
    navigator.clipboard.writeText((prog.domains || []).join("\n")).then(() => {
      showToast(`Copied ${prog.domains.length} in-scope domains!`, "📋");
    });
  };
}

function renderUpdateBanner() {
  if (!updateBanner) return;
  if (state.updateInfo && state.updateInfo.hasUpdate) {
    updateBanner.classList.remove("hidden");
    if (updateTitle) updateTitle.textContent = `🚀 Update v${state.updateInfo.newVersion} Available!`;
    if (updateDesc) updateDesc.textContent = `Current v${state.updateInfo.currentVersion} • Ready to download`;
    const zip = state.updateInfo.zipUrl || "https://github.com/tejassroot/BountyRadar/releases";
    const rel = state.updateInfo.downloadUrl || "https://github.com/tejassroot/BountyRadar/releases";
    if (updateDownloadBtn) {
      updateDownloadBtn.href = zip;
      updateDownloadBtn.onclick = (e) => {
        e.preventDefault();
        openExternalUrl(zip);
      };
    }
    if (updateReleaseBtn) {
      updateReleaseBtn.href = rel;
      updateReleaseBtn.onclick = (e) => {
        e.preventDefault();
        openExternalUrl(rel);
      };
    }
  } else {
    updateBanner.classList.add("hidden");
  }
}

if (updateDismissBtn) {
  updateDismissBtn.addEventListener("click", () => {
    updateBanner.classList.add("hidden");
  });
}

function renderList() {
  programListEl.replaceChildren();
  const q = state.searchQuery.trim().toLowerCase();

  const filtered = state.programs.filter((p) => matchesFilter(p) && matchesSearch(p, q));

  if (resultsCountPill) {
    resultsCountPill.textContent = `${filtered.length.toLocaleString()} targets`;
  }

  if (state.isSyncing && state.programs.length === 0) {
    loadingEl.classList.remove("hidden");
    emptyEl.classList.add("hidden");
    return;
  }
  loadingEl.classList.add("hidden");

  if (filtered.length === 0) {
    emptyEl.classList.remove("hidden");
    if (q) {
      emptyTitleEl.textContent = `No programs match "${state.searchQuery}"`;
    } else if (state.activeFilter === "bookmarks") {
      emptyTitleEl.textContent = "No bookmarked programs yet";
    } else if (state.activeFilter === "fresh") {
      emptyTitleEl.textContent = "No fresh programs discovered yet";
    } else {
      emptyTitleEl.textContent = "No programs in this category";
    }
    return;
  }
  emptyEl.classList.add("hidden");

  const displaySlice = filtered.slice(0, 120);
  const fragment = document.createDocumentFragment();

  for (const prog of displaySlice) {
    const isBookmarked = state.bookmarks.includes(prog.id);
    const existingNote = state.notes[prog.id] || "";

    const card = document.createElement("div");
    card.className = `program-card ${prog.isNew ? "is-new-card" : ""}`;

    // Top Row
    const top = document.createElement("div");
    top.className = "card-top";

    const ident = document.createElement("div");
    ident.className = "card-identity";

    const img = document.createElement("img");
    img.className = "card-favicon";
    img.src = prog.favicon || "icons/icon16.png";
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.src = "icons/icon16.png";
    });

    const link = document.createElement("a");
    link.className = "card-name";
    link.href = prog.url || "#";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = prog.name;
    link.title = prog.isTargetAsset ? `Open ${prog.name} asset website` : `Open ${prog.name} program policy`;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openExternalUrl(prog.url);
    });

    ident.appendChild(img);
    ident.appendChild(link);

    const badges = document.createElement("div");
    badges.className = "card-badges";

    if (prog.isNew) {
      const newBadge = document.createElement("span");
      newBadge.className = "badge badge-new";
      newBadge.textContent = "🔥 NEW";
      badges.appendChild(newBadge);
    }

    if (prog.isPrivate) {
      const privBadge = document.createElement("span");
      privBadge.className = "badge badge-private";
      privBadge.textContent = "🔒 Private";
      badges.appendChild(privBadge);
    }

    const platBadge = document.createElement("span");
    let platClass = "badge-platform";
    if (prog.isSelfHosted) platClass = "badge-selfhosted";
    else if (prog.platform === "Bugcrowd") platClass = "badge-bugcrowd";
    else if (prog.platform === "HackerOne") platClass = "badge-hackerone";
    platBadge.className = `badge ${platClass}`;
    platBadge.textContent = prog.platform;
    badges.appendChild(platBadge);

    const typeBadge = document.createElement("span");
    typeBadge.className = `badge ${prog.hasBounty ? "badge-bounty" : "badge-vdp"}`;
    typeBadge.textContent = prog.hasBounty ? "Bounty" : "VDP";
    badges.appendChild(typeBadge);

    if (prog.country && prog.country.code) {
      const countryBadge = document.createElement("span");
      countryBadge.className = "badge badge-country";
      countryBadge.textContent = `${prog.country.flag} ${prog.country.code}`;
      countryBadge.title = `Region: ${prog.country.name}`;
      badges.appendChild(countryBadge);
    }

    if (prog.isWildcard) {
      const wildBadge = document.createElement("span");
      wildBadge.className = "badge badge-wildcard";
      wildBadge.textContent = "🎯 Wildcard";
      badges.appendChild(wildBadge);
    }

    // Hunter Tools: Bookmark ⭐ & Recon Note 📝
    const tools = document.createElement("div");
    tools.className = "card-tools";

    const starBtn = document.createElement("button");
    starBtn.className = `tool-btn btn-bookmark ${isBookmarked ? "is-bookmarked" : ""}`;
    starBtn.textContent = isBookmarked ? "★" : "☆";
    starBtn.title = isBookmarked ? "Remove from bookmarks" : "Bookmark this program";
    starBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const res = await chrome.runtime.sendMessage({
        type: "BOUNTYRADAR_TOGGLE_BOOKMARK",
        id: prog.id
      });
      if (res && res.ok) {
        state.bookmarks = res.bookmarks;
        starBtn.className = `tool-btn btn-bookmark ${res.isBookmarked ? "is-bookmarked" : ""}`;
        starBtn.textContent = res.isBookmarked ? "★" : "☆";
        showToast(res.isBookmarked ? `Bookmarked ${prog.name}` : `Removed bookmark`, "⭐");
        if (state.activeFilter === "bookmarks") renderList();
      }
    });

    const noteBtn = document.createElement("button");
    noteBtn.className = `tool-btn btn-note ${existingNote ? "has-notes" : ""}`;
    noteBtn.textContent = "📝";
    noteBtn.title = existingNote ? "View / Edit Recon Notes" : "Add Private Recon Note";

    tools.appendChild(starBtn);
    tools.appendChild(noteBtn);

    top.appendChild(ident);
    top.appendChild(badges);
    top.appendChild(tools);
    card.appendChild(top);

    // Domains Scope Preview with 1-Click Copy
    if (Array.isArray(prog.domains) && prog.domains.length > 0) {
      const scopeRow = document.createElement("div");
      scopeRow.className = "card-scope-row";

      const domText = document.createElement("span");
      domText.className = "card-domains-text";
      domText.textContent = `🎯 ${prog.domains.slice(0, 3).join(", ")}${prog.domains.length > 3 ? ` +${prog.domains.length - 3} more` : ""}`;
      domText.title = prog.domains.join("\n");

      const copyBtn = document.createElement("button");
      copyBtn.className = "btn-copy-scope";
      copyBtn.textContent = "📋 Copy Scope";
      copyBtn.title = "Copy in-scope domains to clipboard for recon tools";
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(prog.domains.join("\n")).then(() => {
          showToast(`Copied ${prog.domains.length} targets!`, "📋");
        }).catch(() => {
          showToast("Failed to copy", "⚠️");
        });
      });

      scopeRow.appendChild(domText);
      scopeRow.appendChild(copyBtn);
      card.appendChild(scopeRow);
    }

    // Display Saved Recon Note if exists
    if (existingNote) {
      const noteDisplay = document.createElement("div");
      noteDisplay.className = "display-saved-note";
      noteDisplay.textContent = `📝 Note: ${existingNote}`;
      card.appendChild(noteDisplay);
    }

    // Notes Drawer (Expandable)
    const notesDrawer = document.createElement("div");
    notesDrawer.className = "notes-drawer hidden";

    const textarea = document.createElement("textarea");
    textarea.className = "notes-textarea";
    textarea.placeholder = "Confidential hunter notes (e.g. found open redirect, staging endpoints, tested CVEs)...";
    textarea.value = existingNote;

    const notesActions = document.createElement("div");
    notesActions.className = "notes-actions";

    const saveNoteBtn = document.createElement("button");
    saveNoteBtn.className = "btn-note-action btn-note-save";
    saveNoteBtn.textContent = "Save Note";

    const delNoteBtn = document.createElement("button");
    delNoteBtn.className = "btn-note-action btn-note-delete";
    delNoteBtn.textContent = "Clear";

    const cancelNoteBtn = document.createElement("button");
    cancelNoteBtn.className = "btn-note-action btn-note-cancel";
    cancelNoteBtn.textContent = "Cancel";

    saveNoteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const val = textarea.value.trim();
      const res = await chrome.runtime.sendMessage({
        type: "BOUNTYRADAR_SAVE_NOTE",
        id: prog.id,
        note: val
      });
      if (res && res.ok) {
        state.notes = res.notes;
        showToast("Recon note saved!", "📝");
        renderList();
      }
    });

    delNoteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const res = await chrome.runtime.sendMessage({
        type: "BOUNTYRADAR_SAVE_NOTE",
        id: prog.id,
        note: ""
      });
      if (res && res.ok) {
        state.notes = res.notes;
        showToast("Note cleared", "🗑️");
        renderList();
      }
    });

    cancelNoteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      notesDrawer.classList.add("hidden");
    });

    noteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      notesDrawer.classList.toggle("hidden");
      if (!notesDrawer.classList.contains("hidden")) {
        textarea.focus();
      }
    });

    notesActions.appendChild(delNoteBtn);
    notesActions.appendChild(cancelNoteBtn);
    notesActions.appendChild(saveNoteBtn);
    notesDrawer.appendChild(textarea);
    notesDrawer.appendChild(notesActions);
    card.appendChild(notesDrawer);

    // Footer
    const footer = document.createElement("div");
    footer.className = "card-footer";

    const urlA = document.createElement("a");
    urlA.className = "card-url-link";
    urlA.href = prog.url || "#";
    urlA.target = "_blank";
    urlA.rel = "noopener noreferrer";
    urlA.textContent = (prog.url || "").replace(/^https?:\/\//, "");
    urlA.title = prog.isTargetAsset ? `Asset Domain: ${prog.url}` : `Policy URL: ${prog.url}`;
    urlA.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openExternalUrl(prog.url);
    });
    footer.appendChild(urlA);

    if (prog.maxReward) {
      const rew = document.createElement("span");
      rew.className = "card-reward";
      rew.textContent = `Max: ${prog.maxReward}`;
      footer.appendChild(rew);
    }

    card.appendChild(footer);
    fragment.appendChild(card);
  }

  programListEl.appendChild(fragment);
}

// Recon Tool File Download Helper
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Multi-Tool Export Handlers
function exportForNuclei(filteredPrograms) {
  const urlSet = new Set();
  for (const p of filteredPrograms) {
    if (Array.isArray(p.domains)) {
      for (const d of p.domains) {
        const clean = d.replace(/^\*\.?/, "").trim();
        if (clean) {
          urlSet.add(`https://${clean}`);
          urlSet.add(`http://${clean}`);
        }
      }
    }
  }
  const data = Array.from(urlSet).join("\n");
  downloadFile(data, `bountyradar-nuclei-targets-${Date.now()}.txt`, "text/plain");
  showToast(`Exported ${urlSet.size} targets for Nuclei!`, "⚡");
}

function exportForBurpScope(filteredPrograms) {
  const includeRules = [];
  for (const p of filteredPrograms) {
    if (Array.isArray(p.domains)) {
      for (const d of p.domains) {
        const isWild = d.startsWith("*.");
        const root = isWild ? d.slice(2).trim() : d.trim();
        // Regex matches both root domain and any subdomain for wildcards
        const hostRegex = isWild ? `^(.*\\.)?${root.replace(/\./g, "\\.")}$` : `^${root.replace(/\./g, "\\.")}$`;
        includeRules.push({
          enabled: true,
          host: hostRegex,
          protocol: "any"
        });
      }
    }
  }
  const burpScope = {
    target: {
      scope: {
        advanced_mode: true,
        include: includeRules
      }
    }
  };
  downloadFile(JSON.stringify(burpScope, null, 2), `bountyradar-burp-scope-${Date.now()}.json`, "application/json");
  showToast(`Exported ${includeRules.length} Burp Scope rules!`, "🎯");
}

function exportForSubfinder(filteredPrograms) {
  const domainSet = new Set();
  for (const p of filteredPrograms) {
    if (Array.isArray(p.domains)) {
      for (const d of p.domains) {
        const clean = d.replace(/^\*\.?/, "").trim().toLowerCase();
        if (clean) domainSet.add(clean);
      }
    }
  }
  const data = Array.from(domainSet).join("\n");
  downloadFile(data, `bountyradar-subfinder-domains-${Date.now()}.txt`, "text/plain");
  showToast(`Exported ${domainSet.size} domains for Subfinder!`, "📡");
}

function exportFullJSON(filteredPrograms) {
  downloadFile(JSON.stringify(filteredPrograms, null, 2), `bountyradar-${state.activeFilter}-${Date.now()}.json`, "application/json");
  showToast(`Exported ${filteredPrograms.length} programs!`, "📥");
}

// Export Menu Toggle
if (exportBtn && exportMenu) {
  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!exportMenu.contains(e.target) && e.target !== exportBtn) {
      exportMenu.classList.add("hidden");
    }
  });

  exportOptBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      exportMenu.classList.add("hidden");
      const exportType = btn.getAttribute("data-export");
      const q = state.searchQuery.trim().toLowerCase();
      const exportData = state.programs.filter((p) => matchesFilter(p) && matchesSearch(p, q));

      switch (exportType) {
        case "nuclei":
          exportForNuclei(exportData);
          break;
        case "burp":
          exportForBurpScope(exportData);
          break;
        case "subfinder":
          exportForSubfinder(exportData);
          break;
        case "json":
        default:
          exportFullJSON(exportData);
          break;
      }
    });
  });
}

async function triggerAutoSync() {
  if (state.isSyncing) return;
  state.isSyncing = true;
  if (syncIcon) syncIcon.classList.add("spinning");
  if (syncText) syncText.textContent = "Syncing…";

  try {
    const res = await chrome.runtime.sendMessage({ type: "BOUNTYRADAR_FORCE_SYNC" });
    if (res && res.ok) {
      if (syncText) syncText.textContent = "Synced!";
      const count = res.total || state.programs.length;
      const totalTargets = state.programs.reduce((acc, p) => acc + (p.domains ? p.domains.length : 0), 0);
      showToast(`Radar Active: ${count.toLocaleString()} Orgs (${totalTargets.toLocaleString()} Targets)!`, "🔄");
      setTimeout(() => {
        if (syncText) syncText.textContent = "Sync";
      }, 1500);
    }
  } catch (_) {
    if (syncText) syncText.textContent = "Sync";
  } finally {
    state.isSyncing = false;
    if (syncIcon) syncIcon.classList.remove("spinning");
    const updated = await chrome.runtime.sendMessage({ type: "BOUNTYRADAR_GET_STATE" });
    if (updated && updated.ok) {
      state.programs = updated.programs || [];
      state.bookmarks = updated.bookmarks || [];
      state.notes = updated.notes || {};
      state.updateInfo = updated.updateInfo || null;
      state.lastSync = updated.lastSync || 0;
      state.newCount = updated.newCount || 0;
      updateMetrics();
      renderUpdateBanner();
      renderList();
    }
  }
}

async function refreshState() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "BOUNTYRADAR_GET_STATE" });
    if (res && res.ok) {
      state.programs = res.programs || [];
      state.bookmarks = res.bookmarks || [];
      state.notes = res.notes || {};
      state.updateInfo = res.updateInfo || null;
      state.lastSync = res.lastSync || 0;
      state.newCount = res.newCount || 0;
      state.isSyncing = res.isSyncing || false;
      if (res.settings) {
        currentSettings = { ...currentSettings, ...res.settings };
      }

      updateMetrics();
      renderUpdateBanner();
      renderList();

      // Active tab detection
      if (chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0] && tabs[0].url) {
            try {
              const host = new URL(tabs[0].url).hostname;
              const matched = matchDomainAgainstPrograms(host, state.programs);
              if (matched) {
                renderActiveTabBanner(host, matched);
              } else if (activeTabBanner) {
                activeTabBanner.classList.add("hidden");
              }
            } catch (_) {}
          }
        });
      }

      // Check for updates if not checked recently
      chrome.runtime.sendMessage({ type: "BOUNTYRADAR_CHECK_UPDATE" }).then((upRes) => {
        if (upRes && upRes.updateInfo) {
          state.updateInfo = upRes.updateInfo;
          renderUpdateBanner();
        }
      }).catch(() => {});

      // AUTOMATIC ZERO-CLICK SYNC: If storage is empty or older than 2 hours, auto-sync immediately!
      const isStale = !state.lastSync || (Date.now() - state.lastSync > 1000 * 60 * 120);
      if (!state.isSyncing && (state.programs.length === 0 || isStale)) {
        triggerAutoSync();
      }
    }
  } catch (err) {
    console.debug("Background communication error:", err);
  }
}

// Search Inputs & Clear
searchInput.addEventListener("input", (e) => {
  state.searchQuery = e.target.value;
  searchClearBtn.classList.toggle("hidden", state.searchQuery === "");
  renderList();
});

searchClearBtn.addEventListener("click", () => {
  searchInput.value = "";
  state.searchQuery = "";
  searchClearBtn.classList.add("hidden");
  renderList();
  searchInput.focus();
});

// Interactive Bento Metric Cards: Click to Filter
metricCards.forEach((card) => {
  card.addEventListener("click", () => {
    const targetFilter = card.getAttribute("data-filter-target");
    if (!targetFilter) return;

    filterTabs.forEach((t) => {
      t.classList.toggle("active", t.getAttribute("data-filter") === targetFilter);
    });
    state.activeFilter = targetFilter;
    state.searchQuery = "";
    searchInput.value = "";
    searchClearBtn.classList.add("hidden");
    renderList();
  });
});

// Quick Tags / Chips (Includes Asset Categories)
chipsBtns.forEach((chip) => {
  chip.addEventListener("click", () => {
    const word = chip.getAttribute("data-word");
    if (!word) return;

    const matchedTab = Array.from(filterTabs).find((t) => t.getAttribute("data-filter") === word);
    if (matchedTab) {
      filterTabs.forEach((t) => t.classList.remove("active"));
      matchedTab.classList.add("active");
      state.activeFilter = word;
      state.searchQuery = "";
      searchInput.value = "";
      searchClearBtn.classList.add("hidden");
    } else {
      searchInput.value = word;
      state.searchQuery = word;
      searchClearBtn.classList.remove("hidden");
    }
    renderList();
  });
});

// Filter Tabs
filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    filterTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.activeFilter = tab.getAttribute("data-filter");
    renderList();
  });
});

// Country & Regional Discovery Chips
countryChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    countryChips.forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.activeCountry = chip.getAttribute("data-country") || "all";
    renderList();
  });
});

// Sync Button
syncBtn.addEventListener("click", () => {
  triggerAutoSync();
});

// Mark Read Button
markReadBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "BOUNTYRADAR_MARK_READ" });
  showToast("All fresh badges cleared", "✓");
  await refreshState();
});

// Global Keyboard Shortcut: '/' to search
window.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// GitHub Footer Link
const ghFooterLink = document.querySelector(".footer-github-link");
if (ghFooterLink) {
  ghFooterLink.addEventListener("click", (e) => {
    e.preventDefault();
    openExternalUrl("https://github.com/tejassroot/BountyRadar");
  });
}

// ==========================================================================
// Settings & Alert Webhooks Management
// ==========================================================================

function maskSecret(val) {
  if (!val || typeof val !== "string") return "";
  if (val.length <= 6) return "••••••";
  return val.slice(0, 4) + "••••••••" + val.slice(-2);
}

function updateSettingsFieldsState() {
  if (!tgFieldsGroup || !emailFieldsGroup) return;
  if (settingTgEnabled && settingTgEnabled.checked) {
    tgFieldsGroup.classList.remove("disabled");
  } else if (tgFieldsGroup) {
    tgFieldsGroup.classList.add("disabled");
  }

  if (settingEmailEnabled && settingEmailEnabled.checked) {
    emailFieldsGroup.classList.remove("disabled");
  } else if (emailFieldsGroup) {
    emailFieldsGroup.classList.add("disabled");
  }
}

function openSettingsModal() {
  if (!settingsModal) return;
  if (settingTgEnabled) settingTgEnabled.checked = Boolean(currentSettings.telegram?.enabled);
  if (settingTgToken) {
    settingTgToken.value = "";
    settingTgToken.placeholder = currentSettings.telegram?.botToken
      ? maskSecret(currentSettings.telegram.botToken)
      : "e.g. 7123456789:AAHfdk_...";
  }
  if (settingTgChatId) settingTgChatId.value = currentSettings.telegram?.chatId || "";

  if (settingEmailEnabled) settingEmailEnabled.checked = Boolean(currentSettings.email?.enabled);
  if (settingEmailKey) {
    settingEmailKey.value = "";
    settingEmailKey.placeholder = currentSettings.email?.apiKey
      ? maskSecret(currentSettings.email.apiKey)
      : "re_12345678_...";
  }
  if (settingEmailTo) settingEmailTo.value = currentSettings.email?.toEmail || "";

  updateSettingsFieldsState();
  if (tgTestStatus) {
    tgTestStatus.textContent = "";
    tgTestStatus.className = "test-status";
  }
  if (emailTestStatus) {
    emailTestStatus.textContent = "";
    emailTestStatus.className = "test-status";
  }
  settingsModal.classList.remove("hidden");
}

function closeSettingsModal() {
  if (settingsModal) settingsModal.classList.add("hidden");
}

if (settingsBtn) {
  settingsBtn.addEventListener("click", () => {
    openSettingsModal();
  });
}

if (settingsCloseBtn) {
  settingsCloseBtn.addEventListener("click", () => {
    closeSettingsModal();
  });
}

if (settingsCancelBtn) {
  settingsCancelBtn.addEventListener("click", () => {
    closeSettingsModal();
  });
}

if (settingsModal) {
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });
}

if (settingTgEnabled) {
  settingTgEnabled.addEventListener("change", () => {
    updateSettingsFieldsState();
  });
}

if (settingEmailEnabled) {
  settingEmailEnabled.addEventListener("change", () => {
    updateSettingsFieldsState();
  });
}

if (tgToggleVisibility && settingTgToken) {
  tgToggleVisibility.addEventListener("click", () => {
    settingTgToken.type = settingTgToken.type === "password" ? "text" : "password";
  });
}

if (emailToggleVisibility && settingEmailKey) {
  emailToggleVisibility.addEventListener("click", () => {
    settingEmailKey.type = settingEmailKey.type === "password" ? "text" : "password";
  });
}

// Save Settings Handler
if (settingsSaveBtn) {
  settingsSaveBtn.addEventListener("click", async () => {
    const enteredTgToken = settingTgToken ? settingTgToken.value.trim() : "";
    const enteredEmailKey = settingEmailKey ? settingEmailKey.value.trim() : "";

    const updatedSettings = {
      ...currentSettings,
      telegram: {
        enabled: settingTgEnabled ? settingTgEnabled.checked : false,
        botToken: enteredTgToken ? enteredTgToken : (currentSettings.telegram?.botToken || ""),
        chatId: settingTgChatId ? settingTgChatId.value.trim() : ""
      },
      email: {
        enabled: settingEmailEnabled ? settingEmailEnabled.checked : false,
        apiKey: enteredEmailKey ? enteredEmailKey : (currentSettings.email?.apiKey || ""),
        toEmail: settingEmailTo ? settingEmailTo.value.trim() : ""
      }
    };

    try {
      const res = await chrome.runtime.sendMessage({
        type: "BOUNTYRADAR_SAVE_SETTINGS",
        settings: updatedSettings
      });

      if (res && res.ok) {
        currentSettings = res.settings;
        showToast("Push alert settings saved successfully!", "✓");
        closeSettingsModal();
      } else {
        showToast("Error saving settings", "✕");
      }
    } catch (err) {
      console.error("Save settings error:", err);
      showToast("Failed to save settings", "✕");
    }
  });
}

// Telegram Test Ping Handler
if (btnTestTelegram) {
  btnTestTelegram.addEventListener("click", async () => {
    const token = (settingTgToken ? settingTgToken.value.trim() : "") || currentSettings.telegram?.botToken;
    const chatId = (settingTgChatId ? settingTgChatId.value.trim() : "") || currentSettings.telegram?.chatId;

    if (!token || !chatId) {
      if (tgTestStatus) {
        tgTestStatus.textContent = "Please provide both Bot Token and Chat ID.";
        tgTestStatus.className = "test-status error";
      }
      return;
    }

    btnTestTelegram.disabled = true;
    if (tgTestStatus) {
      tgTestStatus.textContent = "Sending test ping...";
      tgTestStatus.className = "test-status";
    }

    try {
      const res = await chrome.runtime.sendMessage({
        type: "BOUNTYRADAR_TEST_TELEGRAM",
        botToken: token,
        chatId: chatId
      });

      if (res && res.ok) {
        if (tgTestStatus) {
          tgTestStatus.textContent = "✓ Connected! Message received in Telegram.";
          tgTestStatus.className = "test-status success";
        }
        showToast("Telegram Ping Delivered!", "✈️");
      } else {
        if (tgTestStatus) {
          tgTestStatus.textContent = `✕ Failed: ${res?.error || "Check bot token/chat ID"}`;
          tgTestStatus.className = "test-status error";
        }
      }
    } catch (err) {
      if (tgTestStatus) {
        tgTestStatus.textContent = `✕ Network error: ${err.message || err}`;
        tgTestStatus.className = "test-status error";
      }
    } finally {
      btnTestTelegram.disabled = false;
    }
  });
}

// Email Test Handler
if (btnTestEmail) {
  btnTestEmail.addEventListener("click", async () => {
    const apiKey = (settingEmailKey ? settingEmailKey.value.trim() : "") || currentSettings.email?.apiKey;
    const toEmail = (settingEmailTo ? settingEmailTo.value.trim() : "") || currentSettings.email?.toEmail;

    if (!apiKey || !toEmail) {
      if (emailTestStatus) {
        emailTestStatus.textContent = "Please provide both Resend API Key and Destination Email.";
        emailTestStatus.className = "test-status error";
      }
      return;
    }

    btnTestEmail.disabled = true;
    if (emailTestStatus) {
      emailTestStatus.textContent = "Sending test email...";
      emailTestStatus.className = "test-status";
    }

    try {
      const res = await chrome.runtime.sendMessage({
        type: "BOUNTYRADAR_TEST_EMAIL",
        apiKey: apiKey,
        toEmail: toEmail
      });

      if (res && res.ok) {
        if (emailTestStatus) {
          emailTestStatus.textContent = "✓ Sent! Check your inbox.";
          emailTestStatus.className = "test-status success";
        }
        showToast("Test Email Delivered!", "✉️");
      } else {
        if (emailTestStatus) {
          emailTestStatus.textContent = `✕ Failed: ${res?.error || "Check Resend API key"}`;
          emailTestStatus.className = "test-status error";
        }
      }
    } catch (err) {
      if (emailTestStatus) {
        emailTestStatus.textContent = `✕ Network error: ${err.message || err}`;
        emailTestStatus.className = "test-status error";
      }
    } finally {
      btnTestEmail.disabled = false;
    }
  });
}

// Initial boot
refreshState();
