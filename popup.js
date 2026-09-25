/**
 * BountyRadar Popup Controller
 * Manages state, instant multi-word filtering, common word tags, and zero-click auto-syncing.
 */

const state = {
  programs: [],
  lastSync: 0,
  newCount: 0,
  isSyncing: false,
  activeFilter: "all",
  searchQuery: ""
};

// Elements
const programListEl = document.getElementById("program-list");
const loadingEl = document.getElementById("loading-state");
const emptyEl = document.getElementById("empty-state");
const emptyTitleEl = document.getElementById("empty-title");
const searchInput = document.getElementById("search-input");
const searchClearBtn = document.getElementById("search-clear");
const filterTabs = document.querySelectorAll(".tab-btn");
const chipsBtns = document.querySelectorAll(".chip-btn");
const syncBtn = document.getElementById("sync-btn");
const syncIcon = document.getElementById("sync-icon");
const syncText = document.getElementById("sync-text");
const exportBtn = document.getElementById("export-btn");
const markReadBtn = document.getElementById("mark-read-btn");
const lastSyncLabel = document.getElementById("last-sync-label");

const statTotalEl = document.getElementById("stat-total");
const statFreshEl = document.getElementById("stat-fresh");
const statSelfHostedEl = document.getElementById("stat-selfhosted");
const statPrivateEl = document.getElementById("stat-private");

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

  const freshCount = state.programs.filter((p) => p.isNew).length;
  statFreshEl.textContent = freshCount.toLocaleString();

  const selfHostedCount = state.programs.filter((p) => p.isSelfHosted).length;
  statSelfHostedEl.textContent = selfHostedCount.toLocaleString();

  const privateCount = state.programs.filter((p) => p.isPrivate).length;
  if (statPrivateEl) statPrivateEl.textContent = privateCount.toLocaleString();

  lastSyncLabel.textContent = `Last synced: ${timeAgo(state.lastSync)}`;
}

function matchesFilter(p) {
  if (state.activeFilter === "fresh") return p.isNew;
  if (state.activeFilter === "private") return p.isPrivate;
  if (state.activeFilter === "selfhosted") return p.isSelfHosted;
  if (state.activeFilter === "bugcrowd") return p.platform === "Bugcrowd";
  if (state.activeFilter === "hackerone") return p.platform === "HackerOne";
  if (state.activeFilter === "bounty") return p.hasBounty;
  if (state.activeFilter === "vdp") return !p.hasBounty;
  return true;
}

function matchesSearch(p, query) {
  if (!query) return true;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const domainsStr = Array.isArray(p.domains) ? p.domains.join(" ") : "";
  const tagsStr = Array.isArray(p.tags) ? p.tags.join(" ") : "";
  const corpus = `${p.name || ""} ${p.url || ""} ${p.platform || ""} ${domainsStr} ${tagsStr} ${p.isPrivate ? "private nda unlisted" : ""} ${p.isSelfHosted ? "self-hosted selfhosted independent" : ""} ${p.hasBounty ? "bounty cash paid money reward" : "vdp hall of fame hof free"} ${p.isNew ? "new fresh" : ""}`.toLowerCase();

  return terms.every((term) => {
    if (term === "bc") return corpus.includes("bugcrowd");
    if (term === "h1") return corpus.includes("hackerone");
    if (term === "ywh") return corpus.includes("yeswehack");
    if (term === "hof") return corpus.includes("hall of fame") || corpus.includes("hall-of-fame") || corpus.includes("hof");
    if (term === "fresh") return p.isNew || corpus.includes("fresh") || corpus.includes("new");
    if (term === "private") return p.isPrivate || corpus.includes("private") || corpus.includes("nda");
    if (term === "self-hosted" || term === "selfhosted") return p.isSelfHosted || corpus.includes("self-hosted");
    return corpus.includes(term);
  });
}

function renderList() {
  programListEl.innerHTML = "";
  const q = state.searchQuery.trim().toLowerCase();

  const filtered = state.programs.filter((p) => matchesFilter(p) && matchesSearch(p, q));

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
    } else if (state.activeFilter === "fresh") {
      emptyTitleEl.textContent = "No new programs discovered yet";
    } else {
      emptyTitleEl.textContent = "No programs in this category";
    }
    return;
  }
  emptyEl.classList.add("hidden");

  // Virtual slice: render up to 100 for instant UI responsiveness
  const displaySlice = filtered.slice(0, 100);

  const fragment = document.createDocumentFragment();

  for (const prog of displaySlice) {
    const card = document.createElement("div");
    card.className = `program-card ${prog.isNew ? "is-new-card" : ""}`;

    // Top row
    const top = document.createElement("div");
    top.className = "card-top";

    const ident = document.createElement("div");
    ident.className = "card-identity";

    const img = document.createElement("img");
    img.className = "card-favicon";
    img.src = prog.favicon || "icons/icon16.png";
    img.alt = "";
    img.addEventListener("error", () => {
      img.src = "icons/icon16.png";
    });

    const link = document.createElement("a");
    link.className = "card-name";
    link.href = prog.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = prog.name;

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

    top.appendChild(ident);
    top.appendChild(badges);
    card.appendChild(top);

    // Domains preview if available
    if (Array.isArray(prog.domains) && prog.domains.length > 0) {
      const dom = document.createElement("div");
      dom.className = "card-domains";
      dom.textContent = `🎯 ${prog.domains.slice(0, 3).join(", ")}${prog.domains.length > 3 ? ` +${prog.domains.length - 3} more` : ""}`;
      card.appendChild(dom);
    }

    // Footer
    const footer = document.createElement("div");
    footer.className = "card-footer";

    const urlA = document.createElement("a");
    urlA.className = "card-url-link";
    urlA.href = prog.url;
    urlA.target = "_blank";
    urlA.rel = "noopener noreferrer";
    urlA.textContent = prog.url;
    footer.appendChild(urlA);

    if (prog.maxReward) {
      const rew = document.createElement("span");
      rew.className = "card-reward";
      rew.textContent = `Up to ${prog.maxReward}`;
      footer.appendChild(rew);
    }

    card.appendChild(footer);
    fragment.appendChild(card);
  }

  programListEl.appendChild(fragment);
}

async function triggerAutoSync() {
  if (state.isSyncing) return;
  state.isSyncing = true;
  if (syncIcon) syncIcon.classList.add("spinning");
  if (syncText) syncText.textContent = "Auto-syncing…";

  try {
    const res = await chrome.runtime.sendMessage({ type: "BOUNTYRADAR_FORCE_SYNC" });
    if (res && res.ok) {
      if (syncText) syncText.textContent = "Synced!";
      setTimeout(() => {
        if (syncText) syncText.textContent = "Sync Feeds";
      }, 1500);
    }
  } catch (_) {
    if (syncText) syncText.textContent = "Sync Feeds";
  } finally {
    state.isSyncing = false;
    if (syncIcon) syncIcon.classList.remove("spinning");
    const updated = await chrome.runtime.sendMessage({ type: "BOUNTYRADAR_GET_STATE" });
    if (updated && updated.ok) {
      state.programs = updated.programs || [];
      state.lastSync = updated.lastSync || 0;
      state.newCount = updated.newCount || 0;
      updateMetrics();
      renderList();
    }
  }
}

async function refreshState() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "BOUNTYRADAR_GET_STATE" });
    if (res && res.ok) {
      state.programs = res.programs || [];
      state.lastSync = res.lastSync || 0;
      state.newCount = res.newCount || 0;
      state.isSyncing = res.isSyncing || false;

      updateMetrics();
      renderList();

      // AUTOMATIC ZERO-CLICK SYNC: If storage is empty or stale (> 2 hours), auto-sync immediately!
      const isStale = !state.lastSync || (Date.now() - state.lastSync > 1000 * 60 * 120);
      if (!state.isSyncing && (state.programs.length === 0 || isStale)) {
        triggerAutoSync();
      }
    }
  } catch (err) {
    console.debug("Background communication error:", err);
  }
}

// Event Listeners
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

chipsBtns.forEach((chip) => {
  chip.addEventListener("click", () => {
    const word = chip.getAttribute("data-word");
    if (!word) return;

    // Check if matching a filter tab
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

filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    filterTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.activeFilter = tab.getAttribute("data-filter");
    renderList();
  });
});

syncBtn.addEventListener("click", async () => {
  triggerAutoSync();
});

markReadBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "BOUNTYRADAR_MARK_READ" });
  await refreshState();
});

exportBtn.addEventListener("click", () => {
  const q = state.searchQuery.trim().toLowerCase();
  const exportData = state.programs.filter((p) => matchesFilter(p) && matchesSearch(p, q));

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bountyradar-${state.activeFilter}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Initial load
refreshState();
