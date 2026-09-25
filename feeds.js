/**
 * BountyRadar Feeds Aggregator & Normalizer
 * Ingests public, autonomous bug bounty feeds (ProjectDiscovery, Arkadiyt feeds)
 * without requiring the user to visit websites.
 */

function detectPlatform(url) {
  if (!url) return "Self-Hosted";
  const u = url.toLowerCase();
  if (u.includes("hackerone.com")) return "HackerOne";
  if (u.includes("bugcrowd.com")) return "Bugcrowd";
  if (u.includes("intigriti.com")) return "Intigriti";
  if (u.includes("yeswehack.com")) return "YesWeHack";
  if (u.includes("hackenproof.com")) return "HackenProof";
  if (u.includes("bugbounty.ch")) return "BugBounty.ch";
  if (u.includes("openbugbounty.org")) return "OpenBugBounty";
  if (u.includes("federacy.com")) return "Federacy";
  return "Self-Hosted";
}

function normalizeUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.hash = "";
    if (u.pathname.endsWith("/") && u.pathname.length > 1) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href;
  } catch (_) {
    return url.trim();
  }
}

function getFavicon(url, size = 32) {
  if (!url) return "";
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
  } catch (_) {
    return "";
  }
}

const FEED_SOURCES = {
  projectdiscovery: "https://raw.githubusercontent.com/projectdiscovery/public-bugbounty-programs/main/dist/data.json",
  intigriti: "https://raw.githubusercontent.com/arkadiyt/bounty-targets-data/master/data/intigriti_data.json",
  yeswehack: "https://raw.githubusercontent.com/arkadiyt/bounty-targets-data/master/data/yeswehack_data.json",
  bugcrowd: "https://raw.githubusercontent.com/arkadiyt/bounty-targets-data/master/data/bugcrowd_data.json"
};

async function fetchProjectDiscovery() {
  try {
    const res = await fetch(FEED_SOURCES.projectdiscovery, { cache: "no-cache" });
    if (!res.ok) return [];
    const json = await res.json();
    const list = Array.isArray(json.programs) ? json.programs : [];

    return list.map((p) => {
      const normUrl = normalizeUrl(p.url);
      const plat = detectPlatform(normUrl);
      return {
        id: normUrl || p.name,
        name: p.name || "Unknown Program",
        url: normUrl,
        platform: plat,
        isSelfHosted: plat === "Self-Hosted",
        hasBounty: Boolean(p.bounty),
        hasSwag: Boolean(p.swag),
        maxReward: null,
        domains: Array.isArray(p.domains) ? p.domains : [],
        favicon: getFavicon(normUrl)
      };
    });
  } catch (err) {
    console.warn("Failed to fetch ProjectDiscovery feed:", err);
    return [];
  }
}

async function fetchIntigriti() {
  try {
    const res = await fetch(FEED_SOURCES.intigriti, { cache: "no-cache" });
    if (!res.ok) return [];
    const list = await res.json();
    if (!Array.isArray(list)) return [];

    return list.map((p) => {
      const normUrl = normalizeUrl(p.url);
      const domains = [];
      if (p.targets && Array.isArray(p.targets.in_scope)) {
        for (const t of p.targets.in_scope) {
          if (t.endpoint && t.endpoint !== "all") domains.push(t.endpoint);
        }
      }
      const maxVal = p.max_bounty?.value;
      const hasBounty = typeof maxVal === "number" && maxVal > 0;
      return {
        id: normUrl || p.name,
        name: p.name,
        url: normUrl,
        platform: "Intigriti",
        isSelfHosted: false,
        hasBounty,
        hasSwag: false,
        maxReward: hasBounty ? `${maxVal} ${p.max_bounty?.currency || "EUR"}` : null,
        domains,
        favicon: getFavicon(normUrl)
      };
    });
  } catch (err) {
    console.warn("Failed to fetch Intigriti feed:", err);
    return [];
  }
}

async function fetchBugcrowd() {
  try {
    const res = await fetch(FEED_SOURCES.bugcrowd, { cache: "no-cache" });
    if (!res.ok) return [];
    const list = await res.json();
    if (!Array.isArray(list)) return [];

    return list.map((p) => {
      const normUrl = normalizeUrl(p.url);
      const domains = [];
      if (p.targets && Array.isArray(p.targets.in_scope)) {
        for (const t of p.targets.in_scope) {
          if (t.target) domains.push(t.target);
          else if (t.uri) domains.push(t.uri);
        }
      }
      const hasBounty = typeof p.max_payout === "number" && p.max_payout > 0;
      return {
        id: normUrl || p.name,
        name: p.name?.trim(),
        url: normUrl,
        platform: "Bugcrowd",
        isSelfHosted: false,
        hasBounty,
        hasSwag: false,
        maxReward: hasBounty ? `$${p.max_payout}` : null,
        domains,
        favicon: getFavicon(normUrl)
      };
    });
  } catch (err) {
    console.warn("Failed to fetch Bugcrowd feed:", err);
    return [];
  }
}

async function fetchYesWeHack() {
  try {
    const res = await fetch(FEED_SOURCES.yeswehack, { cache: "no-cache" });
    if (!res.ok) return [];
    const list = await res.json();
    if (!Array.isArray(list)) return [];

    return list.map((p) => {
      const normUrl = normalizeUrl(p.url || `https://yeswehack.com/programs/${p.id}`);
      const domains = [];
      if (p.targets && Array.isArray(p.targets.in_scope)) {
        for (const t of p.targets.in_scope) {
          if (t.target && !t.target.includes(" ")) domains.push(t.target);
        }
      }
      const hasBounty = typeof p.max_bounty === "number" && p.max_bounty > 0;
      return {
        id: normUrl || p.name,
        name: p.name,
        url: normUrl,
        platform: "YesWeHack",
        isSelfHosted: false,
        hasBounty,
        hasSwag: false,
        maxReward: hasBounty ? `€${p.max_bounty}` : null,
        domains,
        favicon: getFavicon(normUrl)
      };
    });
  } catch (err) {
    console.warn("Failed to fetch YesWeHack feed:", err);
    return [];
  }
}

async function fetchAllFeeds() {
  const results = await Promise.allSettled([
    fetchProjectDiscovery(),
    fetchIntigriti(),
    fetchBugcrowd(),
    fetchYesWeHack()
  ]);

  const map = new Map();

  for (const res of results) {
    if (res.status === "fulfilled" && Array.isArray(res.value)) {
      for (const item of res.value) {
        if (!item.url && !item.name) continue;
        const key = (item.url || item.name).toLowerCase();
        if (!map.has(key)) {
          map.set(key, item);
        } else {
          // Merge details if already present
          const existing = map.get(key);
          if (!existing.maxReward && item.maxReward) existing.maxReward = item.maxReward;
          if (!existing.hasBounty && item.hasBounty) existing.hasBounty = true;
          if (item.domains && item.domains.length > existing.domains.length) {
            existing.domains = item.domains;
          }
        }
      }
    }
  }

  return Array.from(map.values());
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    detectPlatform,
    normalizeUrl,
    getFavicon,
    fetchAllFeeds
  };
}
