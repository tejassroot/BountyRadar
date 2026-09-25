# BountyRadar 📡
> **Autonomous Fresh Bug Bounty & VDP Discovery Radar**  
> Discovers newly launched, self-hosted, and unlisted bug bounty programs in the background without needing to visit websites.

---

## ⚡ How It Works (Without Visiting Sites)

Traditional extensions require you to manually browse to target websites before they detect anything. **BountyRadar** inverts this model:

1. **Autonomous Feed Ingestion**: In the background, BountyRadar pulls from live global trackers: **Disclose.io (diodb)**, **HackerOne**, **Bugcrowd**, **ProjectDiscovery**, **Intigriti**, and **YesWeHack**.
2. **Instant Index of 3,000+ Programs**: Includes **1,550+ Self-Hosted / Independent** company disclosure policies that are not listed on traditional bug bounty portals.
3. **Diff & Fresh Discovery Engine**: Every 6 hours (configurable via background alarms), it fetches the latest data. Any newly added program is automatically tagged with `🔥 NEW`.
4. **Browser Notifications & Badge Alerts**: Alerts you directly when new programs are launched.

---

## 🚀 Installation

### In Mozilla Firefox (Recommended)
1. Open Firefox and type in the address bar:
   ```text
   about:debugging#/runtime/this-firefox
   ```
2. Click **"Load Temporary Add-on…"**.
3. Navigate to `/home/kali/BountyRadar` and select [`manifest.json`](file:///home/kali/BountyRadar/manifest.json).
4. Pin the icon to your toolbar from the Extensions (🧩) menu.

*Or run via terminal:*
```bash
cd /home/kali/BountyRadar && npx web-ext run
```

### In Google Chrome / Chromium
1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **"Load unpacked"** and select the `/home/kali/BountyRadar` folder.

---

## 🎯 Features

- **🔥 Fresh / New Filter**: Instantly isolate newly launched programs discovered in the latest sync cycles.
- **🌐 Self-Hosted Tab**: Browse independent corporate programs hosted directly on company domains (outside HackerOne/Bugcrowd).
- **💰 Cash Bounty vs 🛡️ VDP Filter**: Toggle between programs offering monetary cash rewards vs Hall of Fame / Swag.
- **🔍 Real-Time Search**: Search across company names, program URLs, or in-scope target domains (`*.example.com`).
- **📥 One-Click Export**: Export filtered programs as formatted JSON for recon pipelines, Nuclei, or LLM analysis.
- **🔄 On-Demand Sync**: Click **"Sync Feeds"** anytime to force an instant background pull.
