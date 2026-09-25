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

// Active Tab Domain Matcher
function matchDomainAgainstPrograms(host, programs) {
  if (!host || !programs || programs.length === 0) return null;
  const cleanHost = host.toLowerCase().trim();

  for (const prog of programs) {
    if (!prog) continue;
    try {
      if (new URL(prog.url).hostname.toLowerCase() === cleanHost) return prog;
    } catch (_) {}

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

function renderActiveTabBanner(host, prog) {
  if (!prog || !activeTabBanner) return;
  activeTabBanner.classList.remove("hidden");
  activeTabName.textContent = prog.name;
  activeTabReward.textContent = prog.hasBounty ? (prog.maxReward || "Bounty") : "VDP";
  activeTabReward.className = `badge ${prog.hasBounty ? "badge-bounty" : "badge-vdp"}`;

  activeTabPolicyLink.href = prog.url;
  activeTabPolicyLink.title = `Open ${prog.name} rules & policy`;

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
    if (updateDownloadBtn) updateDownloadBtn.href = state.updateInfo.zipUrl || "https://github.com/tejassroot/BountyRadar/releases";
    if (updateReleaseBtn) updateReleaseBtn.href = state.updateInfo.downloadUrl || "https://github.com/tejassroot/BountyRadar/releases";
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
    link.href = prog.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = prog.name;
    link.title = `Open ${prog.name} program policy`;

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
    urlA.href = prog.url;
    urlA.target = "_blank";
    urlA.rel = "noopener noreferrer";
    urlA.textContent = prog.url.replace(/^https?:\/\//, "");
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
  a.click();
  URL.revokeObjectURL(url);
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
        const hostRegex = isWild ? `^.*\\.${root.replace(/\./g, "\\.")}$` : `^${root.replace(/\./g, "\\.")}$`;
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

// Initial boot
refreshState();
