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

const TLD_COUNTRY_MAP = {
  de: { code: "DE", flag: "🇩🇪", name: "Germany" },
  uk: { code: "UK", flag: "🇬🇧", name: "United Kingdom" },
  "co.uk": { code: "UK", flag: "🇬🇧", name: "United Kingdom" },
  fr: { code: "FR", flag: "🇫🇷", name: "France" },
  nl: { code: "NL", flag: "🇳🇱", name: "Netherlands" },
  "in": { code: "IN", flag: "🇮🇳", name: "India" },
  "co.in": { code: "IN", flag: "🇮🇳", name: "India" },
  ch: { code: "CH", flag: "🇨🇭", name: "Switzerland" },
  jp: { code: "JP", flag: "🇯🇵", name: "Japan" },
  "co.jp": { code: "JP", flag: "🇯🇵", name: "Japan" },
  au: { code: "AU", flag: "🇦🇺", name: "Australia" },
  "com.au": { code: "AU", flag: "🇦🇺", name: "Australia" },
  ca: { code: "CA", flag: "🇨🇦", name: "Canada" },
  br: { code: "BR", flag: "🇧🇷", name: "Brazil" },
  "com.br": { code: "BR", flag: "🇧🇷", name: "Brazil" },
  se: { code: "SE", flag: "🇸🇪", name: "Sweden" },
  no: { code: "NO", flag: "🇳🇴", name: "Norway" },
  fi: { code: "FI", flag: "🇫🇮", name: "Finland" },
  es: { code: "ES", flag: "🇪🇸", name: "Spain" },
  it: { code: "IT", flag: "🇮🇹", name: "Italy" },
  sg: { code: "SG", flag: "🇸🇬", name: "Singapore" },
  nz: { code: "NZ", flag: "🇳🇿", name: "New Zealand" },
  gov: { code: "GOV", flag: "🏛️", name: "Government" },
  edu: { code: "EDU", flag: "🎓", name: "Education" },
  eu: { code: "EU", flag: "🇪🇺", name: "European Union" }
};

const MULTI_PART_TLDS = new Set([
  "com.br", "co.uk", "com.au", "co.in", "co.jp", "com.mx", "co.kr", "co.za",
  "com.cn", "net.cn", "org.cn", "com.tw", "com.sv", "com.hr", "com.do", "co.br",
  "com.kw", "com.qa", "com.sa", "com.bh", "com.sg", "com.my", "com.ar", "com.co",
  "com.pe", "com.pk", "com.ng", "com.eg", "com.tr", "com.pl", "com.ua", "com.ro",
  "gov.uk", "gov.br", "gov.in", "gov.au", "edu.au", "ac.uk", "org.uk", "net.au",
  "co.nz", "com.nz", "org.nz", "govt.nz", "co.id", "com.ph", "co.th", "com.hk"
]);

const MULTI_PART_PREFIXES = new Set([
  "co", "com", "net", "org", "gov", "gob", "edu", "ac", "biz", "info", "me",
  "ltd", "plc", "ne", "or", "go", "asso", "nom", "web", "gen", "mil", "idv", "sch", "k12"
]);

function getRootDomainAndOrg(hostOrWildcard) {
  if (!hostOrWildcard) return null;
  const clean = hostOrWildcard.replace(/^\*\.?/, "").replace(/^https?:\/\//, "").split("/")[0].toLowerCase().trim();
  const parts = clean.split(".").filter(Boolean);
  if (parts.length < 2) return null;

  const secondLast = parts[parts.length - 2];
  const last = parts[parts.length - 1];

  // Prevent bare TLD or bare ccSLD (e.g. co.uk, com.br, biz.pl)
  if (parts.length === 2) {
    if (MULTI_PART_PREFIXES.has(parts[0]) || (last.length === 2 && MULTI_PART_PREFIXES.has(secondLast))) {
      return null;
    }
  }

  if (parts.length >= 3) {
    const last2 = `${secondLast}.${last}`;
    if (MULTI_PART_TLDS.has(last2) || (last.length === 2 && MULTI_PART_PREFIXES.has(secondLast))) {
      const root = `${parts[parts.length - 3]}.${last2}`;
      const rawName = parts[parts.length - 3];
      if (MULTI_PART_PREFIXES.has(rawName)) return null;
      return { root, rawName };
    }
  }

  const root = `${secondLast}.${last}`;
  const rawName = secondLast;

  if (MULTI_PART_PREFIXES.has(rawName) || ["io", "ai", "app", "dev", "int", "arpa"].includes(rawName)) {
    if (parts.length >= 3) {
      const realRaw = parts[parts.length - 3];
      if (MULTI_PART_PREFIXES.has(realRaw)) return null;
      return { root: `${realRaw}.${root}`, rawName: realRaw };
    }
    return null;
  }

  return { root, rawName };
}

function formatOrgName(raw) {
  if (!raw || raw.length < 2) return null;
  if (/^\d+$/.test(raw)) return null;
  const lower = raw.toLowerCase();
  if (MULTI_PART_PREFIXES.has(lower)) return null;
  if (["io", "ai", "app", "dev", "mil", "int", "arpa", "www", "null", "undefined", "localhost"].includes(lower)) return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function detectCountry(url, domains = []) {
  try {
    const list = [url, ...(domains || [])];
    for (const item of list) {
      if (!item) continue;
      let host = "";
      try {
        host = new URL(item).hostname.toLowerCase();
      } catch (_) {
        host = item.toLowerCase();
      }
      const parts = host.split(".");
      if (parts.length >= 2) {
        const tld2 = parts.slice(-2).join(".");
        const tld1 = parts.slice(-1)[0];
        if (TLD_COUNTRY_MAP[tld2]) return TLD_COUNTRY_MAP[tld2];
        if (TLD_COUNTRY_MAP[tld1]) return TLD_COUNTRY_MAP[tld1];
      }
    }
  } catch (_) {}
  return { code: "GL", flag: "🌐", name: "Global / US" };
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
  if (extra.country) {
    tags.add(extra.country.code.toLowerCase());
    tags.add(extra.country.name.toLowerCase());
  }

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
  bugcrowd: "https://raw.githubusercontent.com/arkadiyt/bounty-targets-data/master/data/bugcrowd_data.json",
  wildcards: "https://raw.githubusercontent.com/arkadiyt/bounty-targets-data/master/data/wildcards.txt",
  domains: "https://raw.githubusercontent.com/arkadiyt/bounty-targets-data/master/data/domains.txt"
};

async function fetchLiveFeed(url) {
  const dynamicUrl = `${url}?_cb=${Date.now()}`;
  return fetch(dynamicUrl, { cache: "no-cache" });
}

async function fetchDiscloseIO() {
  try {
    const res = await fetchLiveFeed(FEED_SOURCES.diodb);
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

      const country = detectCountry(normUrl, domains);
      const tags = extractProgramTags(p.program_name, normUrl, plat, domains, {
        isSelfHosted: plat === "Self-Hosted",
        hasBounty: offersBounty,
        hasSwag: Boolean(p.offers_swag),
        isPrivate,
        hasSafeHarbor,
        hasHallOfFame,
        hasSecurityTxt,
        country
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
        country,
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
    const res = await fetchLiveFeed(FEED_SOURCES.hackerone);
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
      const country = detectCountry(normUrl, domains);
      const tags = extractProgramTags(p.name || handle, normUrl, "HackerOne", domains, {
        isSelfHosted: false,
        hasBounty,
        hasSwag,
        isPrivate,
        country
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
        country,
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
    const res = await fetchLiveFeed(FEED_SOURCES.projectdiscovery);
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
      const country = detectCountry(normUrl, domains);
      const tags = extractProgramTags(p.name, normUrl, plat, domains, {
        isSelfHosted: plat === "Self-Hosted",
        hasBounty,
        hasSwag,
        isPrivate,
        country
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
        country,
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
    const res = await fetchLiveFeed(FEED_SOURCES.intigriti);
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
      const country = detectCountry(normUrl, domains);
      const tags = extractProgramTags(p.name, normUrl, "Intigriti", domains, {
        isSelfHosted: false,
        hasBounty,
        hasSwag: false,
        isPrivate,
        country
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
        country,
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
    const res = await fetchLiveFeed(FEED_SOURCES.bugcrowd);
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
      const country = detectCountry(normUrl, domains);
      const tags = extractProgramTags(p.name, normUrl, "Bugcrowd", domains, {
        isSelfHosted: false,
        hasBounty,
        hasSwag: false,
        isPrivate,
        country
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
        country,
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
    const res = await fetchLiveFeed(FEED_SOURCES.yeswehack);
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
      const country = detectCountry(normUrl, domains);
      const tags = extractProgramTags(p.name, normUrl, "YesWeHack", domains, {
        isSelfHosted: false,
        hasBounty,
        hasSwag,
        isPrivate,
        country
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
        country,
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
    fetchYesWeHack(),
    fetchLiveFeed(FEED_SOURCES.wildcards).then(r => r.ok ? r.text() : ""),
    fetchLiveFeed(FEED_SOURCES.domains).then(r => r.ok ? r.text() : "")
  ]);

  const map = new Map();
  const domainIndex = new Map();

  // Ingest base programs (first 6 sources)
  for (let i = 0; i < 6; i++) {
    const res = results[i];
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
          if (item.country && (!existing.country || existing.country.code === "GL")) {
            existing.country = item.country;
          }
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

  // Index base programs by domains and hostnames
  for (const p of map.values()) {
    if (p.domains) {
      for (const d of p.domains) {
        const clean = d.replace(/^\*\.?/, "").toLowerCase();
        domainIndex.set(clean, p);
      }
    }
    if (p.url) {
      try {
        const host = new URL(p.url).hostname.replace(/^www\./, "").toLowerCase();
        domainIndex.set(host, p);
      } catch (_) {}
    }
  }

  // Ingest In-Scope Wildcards (Result #6)
  if (results[6] && results[6].status === "fulfilled" && typeof results[6].value === "string") {
    const wildcards = results[6].value.split("\n").map(s => s.trim()).filter(Boolean);
    for (const w of wildcards) {
      const parsed = getRootDomainAndOrg(w);
      if (!parsed) continue;
      const clean = w.replace(/^\*\.?/, "").toLowerCase();

      const matched = domainIndex.get(clean) || domainIndex.get(parsed.root);
      if (matched) {
        if (!matched.domains.includes(w)) matched.domains.push(w);
        matched.isWildcard = true;
      } else {
        const orgName = formatOrgName(parsed.rawName);
        if (!orgName) continue;
        const progKey = `https://${parsed.root}`;
        if (!map.has(progKey)) {
          const country = detectCountry(progKey, [w]);
          const newProg = {
            id: progKey,
            name: orgName,
            url: progKey,
            platform: "Target Asset",
            isSelfHosted: false,
            hasBounty: true,
            hasSwag: false,
            isPrivate: false,
            isWildcard: true,
            country,
            tags: [country.code.toLowerCase(), country.name.toLowerCase(), "bounty", "wildcard", parsed.rawName],
            maxReward: null,
            domains: [w],
            favicon: getFavicon(progKey)
          };
          map.set(progKey, newProg);
          domainIndex.set(parsed.root, newProg);
        } else {
          const ep = map.get(progKey);
          if (!ep.domains.includes(w)) ep.domains.push(w);
          ep.isWildcard = true;
        }
      }
    }
  }

  // Ingest In-Scope Domains (Result #7)
  if (results[7] && results[7].status === "fulfilled" && typeof results[7].value === "string") {
    const domains = results[7].value.split("\n").map(s => s.trim()).filter(Boolean);
    for (const d of domains) {
      const parsed = getRootDomainAndOrg(d);
      if (!parsed) continue;
      const clean = d.toLowerCase();

      const matched = domainIndex.get(clean) || domainIndex.get(parsed.root);
      if (matched) {
        if (matched.domains.length < 20 && !matched.domains.includes(clean)) {
          matched.domains.push(clean);
        }
      } else {
        const orgName = formatOrgName(parsed.rawName);
        if (!orgName) continue;
        const progKey = `https://${parsed.root}`;
        if (!map.has(progKey)) {
          const country = detectCountry(progKey, [clean]);
          const newProg = {
            id: progKey,
            name: orgName,
            url: progKey,
            platform: "Target Asset",
            isSelfHosted: false,
            hasBounty: true,
            hasSwag: false,
            isPrivate: false,
            isWildcard: false,
            country,
            tags: [country.code.toLowerCase(), country.name.toLowerCase(), "bounty", parsed.rawName],
            maxReward: null,
            domains: [clean],
            favicon: getFavicon(progKey)
          };
          map.set(progKey, newProg);
          domainIndex.set(parsed.root, newProg);
        } else {
          const ep = map.get(progKey);
          if (ep.domains.length < 20 && !ep.domains.includes(clean)) ep.domains.push(clean);
        }
      }
    }
  }

  // Ensure isWildcard and tag consistency + eliminate false-positive bare TLDs
  const cleanList = [];
  const invalidNames = new Set([
    "com", "co", "org", "net", "io", "gov", "gob", "edu", "ac", "biz", "info", "me",
    "ai", "app", "dev", "mil", "int", "arpa", "www", "ltd", "plc", "null", "undefined"
  ]);

  for (const prog of map.values()) {
    const n = (prog.name || "").toLowerCase().trim();
    const u = (prog.url || "").toLowerCase().trim();

    // Skip false-positive bare TLDs or invalid names
    if (invalidNames.has(n) || n.length < 2) continue;
    if (u === "https://com" || u === "https://co.uk" || u === "https://com.au" || u === "https://com.br" || u === "https://biz.pl" || u === "https://me.uk" || u.endsWith(".com/.") || u.endsWith(".co/.")) continue;
    try {
      const parsedUrl = new URL(u);
      const hParts = parsedUrl.hostname.split(".").filter(Boolean);
      if (hParts.length <= 1) continue;
      if (hParts.length === 2 && (invalidNames.has(hParts[0]) || MULTI_PART_PREFIXES.has(hParts[0]))) continue;
    } catch (_) {}

    if (prog.domains && prog.domains.some(d => d.startsWith("*"))) {
      prog.isWildcard = true;
      if (Array.isArray(prog.tags) && !prog.tags.includes("wildcard")) {
        prog.tags.push("wildcard");
      }
    }

    cleanList.push(prog);
  }

  return cleanList;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    detectPlatform,
    normalizeUrl,
    detectCountry,
    TLD_COUNTRY_MAP,
    fetchLiveFeed,
    getFavicon,
    fetchAllFeeds
  };
}

