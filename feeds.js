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

function extractProgramTags(name, url, platform, domains, extra = {}) {
  const tags = new Set();
  const text = `${name || ""} ${url || ""} ${platform || ""} ${(domains || []).join(" ")} ${JSON.stringify(extra)}`.toLowerCase();

  if (extra.isSelfHosted || platform === "Self-Hosted") tags.add("self-hosted");
  if (extra.hasBounty) tags.add("bounty");
  if (extra.hasSwag) tags.add("swag");
  if (extra.isPrivate) tags.add("private");
  if (extra.hasSafeHarbor) tags.add("safe-harbor");
  if (extra.hasHallOfFame) tags.add("hall-of-fame");
  if (extra.hasSecurityTxt) tags.add("security.txt");

  if (text.includes("api") || text.includes("rest") || text.includes("graphql")) tags.add("api");
  if (text.includes("crypto") || text.includes("web3") || text.includes("token") || text.includes("blockchain") || text.includes("contract") || text.includes("wallet")) tags.add("crypto");
  if (text.includes("mobile") || text.includes("android") || text.includes("ios") || text.includes("apk")) tags.add("mobile");
  if (text.includes("cloud") || text.includes("aws") || text.includes("azure") || text.includes("gcp")) tags.add("cloud");
  if (text.includes("finance") || text.includes("bank") || text.includes("pay") || text.includes("fintech")) tags.add("fintech");
  if (text.includes("shop") || text.includes("store") || text.includes("ecommerce") || text.includes("retail")) tags.add("ecommerce");

  return Array.from(tags);
}

const FEED_SOURCES = {
  diodb: "https://raw.githubusercontent.com/disclose/diodb/master/program-list.json",
  hackerone: "https://raw.githubusercontent.com/arkadiyt/bounty-targets-data/master/data/hackerone_data.json",
  projectdiscovery: "https://raw.githubusercontent.com/projectdiscovery/public-bugbounty-programs/main/dist/data.json",
  intigriti: "https://raw.githubusercontent.com/arkadiyt/bounty-targets-data/master/data/intigriti_data.json",
  yeswehack: "https://raw.githubusercontent.com/arkadiyt/bounty-targets-data/master/data/yeswehack_data.json",
  bugcrowd: "https://raw.githubusercontent.com/arkadiyt/bounty-targets-data/master/data/bugcrowd_data.json"
};

async function fetchDiscloseIO() {
  try {
    const res = await fetch(FEED_SOURCES.diodb, { cache: "no-cache" });
    if (!res.ok) return [];
    const list = await res.json();
    if (!Array.isArray(list)) return [];

    return list.map((p) => {
      const normUrl = normalizeUrl(p.policy_url);
      const plat = detectPlatform(normUrl);
      const offersBounty = String(p.offers_bounty || "").toLowerCase() === "yes" || p.offers_bounty === true;
      const pd = String(p.public_disclosure || "").toLowerCase();
      const isPrivate = pd === "nda" || pd === "no" || pd === "discretionary" ||
        (p.program_name || "").toLowerCase().includes("private") ||
        (normUrl || "").toLowerCase().includes("private");
      const hasSafeHarbor = ["full", "partial", "yes"].includes(String(p.safe_harbor || "").toLowerCase());
      const hasHallOfFame = Boolean(p.hall_of_fame);
      const hasSecurityTxt = Boolean(p.securitytxt_url);
      const domains = [];
      if (normUrl) {
        try {
          const host = new URL(normUrl).hostname;
          if (host) domains.push(host);
        } catch (_) {}
      }

      const tags = extractProgramTags(p.program_name, normUrl, plat, domains, {
        isSelfHosted: plat === "Self-Hosted",
        hasBounty: offersBounty,
        hasSwag: Boolean(p.offers_swag),
        isPrivate,
        hasSafeHarbor,
        hasHallOfFame,
        hasSecurityTxt
      });

      return {
        id: normUrl || p.program_name,
        name: p.program_name || "Unknown Program",
        url: normUrl,
        platform: plat,
        isSelfHosted: plat === "Self-Hosted",
        hasBounty: offersBounty,
        hasSwag: Boolean(p.offers_swag),
        isPrivate,
        hasSafeHarbor,
        hasHallOfFame,
        hasSecurityTxt,
        tags,
        maxReward: null,
        domains,
        favicon: getFavicon(normUrl)
      };
    });
  } catch (err) {
    console.warn("Failed to fetch Disclose.io feed:", err);
    return [];
  }
}

async function fetchHackerOne() {
  try {
    const res = await fetch(FEED_SOURCES.hackerone, { cache: "no-cache" });
    if (!res.ok) return [];
    const list = await res.json();
    if (!Array.isArray(list)) return [];

    return list.map((p) => {
      const handle = p.handle || "";
      const normUrl = normalizeUrl(p.url || (handle ? `https://hackerone.com/${handle}` : ""));
      const domains = [];
      if (p.targets && Array.isArray(p.targets.in_scope)) {
        for (const t of p.targets.in_scope) {
          if (t.asset_identifier && !t.asset_identifier.includes(" ")) {
            domains.push(t.asset_identifier);
          }
        }
      }
      const isPrivate = (p.name || "").toLowerCase().includes("private") ||
        (handle || "").toLowerCase().includes("private") ||
        normUrl.toLowerCase().includes("private");
      const hasBounty = Boolean(p.offers_bounties);
      const hasSwag = Boolean(p.offers_swag);
      const tags = extractProgramTags(p.name || handle, normUrl, "HackerOne", domains, {
        isSelfHosted: false,
        hasBounty,
        hasSwag,
        isPrivate
      });

      return {
        id: normUrl || p.name,
        name: p.name || handle,
        url: normUrl,
        platform: "HackerOne",
        isSelfHosted: false,
        hasBounty,
        hasSwag,
        isPrivate,
        tags,
        maxReward: null,
        domains: domains.slice(0, 10),
        favicon: getFavicon(normUrl)
      };
    });
  } catch (err) {
    console.warn("Failed to fetch HackerOne feed:", err);
    return [];
  }
}

async function fetchProjectDiscovery() {
  try {
    const res = await fetch(FEED_SOURCES.projectdiscovery, { cache: "no-cache" });
    if (!res.ok) return [];
    const json = await res.json();
    const list = Array.isArray(json.programs) ? json.programs : [];

    return list.map((p) => {
      const normUrl = normalizeUrl(p.url);
      const plat = detectPlatform(normUrl);
      const isPrivate = (p.name || "").toLowerCase().includes("private") || normUrl.toLowerCase().includes("private");
      const hasBounty = Boolean(p.bounty);
      const hasSwag = Boolean(p.swag);
      const domains = Array.isArray(p.domains) ? p.domains : [];
      const tags = extractProgramTags(p.name, normUrl, plat, domains, {
        isSelfHosted: plat === "Self-Hosted",
        hasBounty,
        hasSwag,
        isPrivate
      });

      return {
        id: normUrl || p.name,
        name: p.name || "Unknown Program",
        url: normUrl,
        platform: plat,
        isSelfHosted: plat === "Self-Hosted",
        hasBounty,
        hasSwag,
        isPrivate,
        tags,
        maxReward: null,
        domains,
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
      const isPrivate = (p.name || "").toLowerCase().includes("private") || normUrl.toLowerCase().includes("private");
      const tags = extractProgramTags(p.name, normUrl, "Intigriti", domains, {
        isSelfHosted: false,
        hasBounty,
        hasSwag: false,
        isPrivate
      });

      return {
        id: normUrl || p.name,
        name: p.name,
        url: normUrl,
        platform: "Intigriti",
        isSelfHosted: false,
        hasBounty,
        hasSwag: false,
        isPrivate,
        tags,
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
      const isPrivate = (p.name || "").toLowerCase().includes("private") || normUrl.toLowerCase().includes("private");
      const tags = extractProgramTags(p.name, normUrl, "Bugcrowd", domains, {
        isSelfHosted: false,
        hasBounty,
        hasSwag: false,
        isPrivate
      });

      return {
        id: normUrl || p.name,
        name: p.name?.trim(),
        url: normUrl,
        platform: "Bugcrowd",
        isSelfHosted: false,
        hasBounty,
        hasSwag: false,
        isPrivate,
        tags,
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
      const hasSwag = false;
      const isPrivate = (p.name || "").toLowerCase().includes("private") || normUrl.toLowerCase().includes("private");
      const tags = extractProgramTags(p.name, normUrl, "YesWeHack", domains, {
        isSelfHosted: false,
        hasBounty,
        hasSwag,
        isPrivate
      });

      return {
        id: normUrl || p.name,
        name: p.name,
        url: normUrl,
        platform: "YesWeHack",
        isSelfHosted: false,
        hasBounty,
        hasSwag,
        isPrivate,
        tags,
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
    fetchDiscloseIO(),
    fetchProjectDiscovery(),
    fetchHackerOne(),
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
          const existing = map.get(key);
          if (!existing.maxReward && item.maxReward) existing.maxReward = item.maxReward;
          if (!existing.hasBounty && item.hasBounty) existing.hasBounty = true;
          if (item.isPrivate) existing.isPrivate = true;
          if (item.hasSafeHarbor) existing.hasSafeHarbor = true;
          if (item.hasHallOfFame) existing.hasHallOfFame = true;
          if (item.hasSecurityTxt) existing.hasSecurityTxt = true;
          if (Array.isArray(item.tags) && Array.isArray(existing.tags)) {
            existing.tags = Array.from(new Set([...existing.tags, ...item.tags]));
          }
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
