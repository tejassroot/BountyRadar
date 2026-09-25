/**
 * BountyRadar Popup Controller
 * Manages state, instant filtering, searching, and exporting.
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
const syncBtn = document.getElementById("sync-btn");
const syncIcon = document.getElementById("sync-icon");
const syncText = document.getElementById("sync-text");
const exportBtn = document.getElementById("export-btn");
const markReadBtn = document.getElementById("mark-read-btn");
const lastSyncLabel = document.getElementById("last-sync-label");

const statTotalEl = document.getElementById("stat-total");
const statSelfHostedEl = document.getElementById("stat-selfhosted");
const statFreshEl = document.getElementById("stat-fresh");

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
  const selfHostedCount = state.programs.filter((p) => p.isSelfHosted).length;
  statSelfHostedEl.textContent = selfHostedCount.toLocaleString();

  const freshCount = state.programs.filter((p) => p.isNew).length;
  statFreshEl.textContent = freshCount.toLocaleString();

  lastSyncLabel.textContent = `Last synced: ${timeAgo(state.lastSync)}`;
}

function matchesFilter(p) {
  if (state.activeFilter === "fresh") return p.isNew;
  if (state.activeFilter === "selfhosted") return p.isSelfHosted;
  if (state.activeFilter === "bounty") return p.hasBounty;
  if (state.activeFilter === "vdp") return !p.hasBounty;
  return true;
}

function matchesSearch(p, q) {
  if (!q) return true;
  if (p.name.toLowerCase().includes(q)) return true;
  if (p.url.toLowerCase().includes(q)) return true;
  if (p.platform.toLowerCase().includes(q)) return true;
  if (Array.isArray(p.domains)) {
    return p.domains.some((d) => d.toLowerCase().includes(q));
  }
  return false;
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

    const platBadge = document.createElement("span");
    platBadge.className = `badge ${prog.isSelfHosted ? "badge-selfhosted" : "badge-platform"}`;
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

filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    filterTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.activeFilter = tab.getAttribute("data-filter");
    renderList();
  });
});

syncBtn.addEventListener("click", async () => {
  if (state.isSyncing) return;
  state.isSyncing = true;
  syncIcon.classList.add("spinning");
  syncText.textContent = "Syncing…";

  try {
    const res = await chrome.runtime.sendMessage({ type: "BOUNTYRADAR_FORCE_SYNC" });
    if (res && res.ok) {
      syncText.textContent = "Synced!";
      setTimeout(() => {
        syncText.textContent = "Sync Feeds";
      }, 1500);
    }
  } catch (err) {
    syncText.textContent = "Failed";
  } finally {
    state.isSyncing = false;
    syncIcon.classList.remove("spinning");
    await refreshState();
  }
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
