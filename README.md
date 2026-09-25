# BountyRadar 📡
> **Autonomous Fresh Bug Bounty & VDP Discovery Radar**  
> Discovers newly launched, self-hosted, and unlisted bug bounty programs in the background without needing to visit websites.

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success.svg)](manifest.json)
[![Supported Browsers](https://img.shields.io/badge/Browsers-Chrome%20%7C%20Firefox%20%7C%20Brave%20%7C%20Edge-purple.svg)](https://github.com/tejassroot/BountyRadar)

---

## ⚡ How It Works (Without Visiting Sites)

Traditional browser extensions require you to manually browse to target websites before they detect anything. **BountyRadar** inverts this model:

1. **Autonomous Feed Ingestion**: In the background, BountyRadar pulls from live global trackers: **Disclose.io (diodb)**, **HackerOne**, **Bugcrowd**, **ProjectDiscovery**, **Intigriti**, and **YesWeHack**.
2. **Unlimited & Continuous Discovery**: No fixed limit or static database—dynamically pulls live upstream diffs with cache-busting on every sync, continuously growing your target radar with newly launched public & private programs.
3. **🌍 Global Country & TLD Regional Radar**: Automatically detects and tags programs by national domain extensions and sovereign regions (`🏛️ .gov`, `🇩🇪 .de`, `🇬🇧 .uk`, `🇳🇱 .nl`, `🇨🇭 .ch`, `🇮🇳 .in`, `🇦🇺 .au`, `🇨🇦 .ca`, `🇫🇷 .fr`, `🇪🇺 .eu`, `🎓 .edu`, `🇧🇷 .br`, `🌐 US/Global`).
4. **Zero-Click Auto-Sync**: Automatically checks and syncs live feeds on browser startup and popup launch—no manual buttons required.
5. **Diff & Fresh Discovery Engine**: Tracks newly added programs and flags them with `🔥 NEW`.
6. **1-Click Scope Copy**: Copy all in-scope domains formatted line-by-line, ready to pipe into `subfinder`, `httpx`, or `nuclei`.

---

## 🚀 Installation Guide

BountyRadar works identically on **Windows**, **Linux**, and **macOS** across any Chromium or Firefox-based browser.

### Step 1: Download the Repository

#### Option A: Via Git (Windows / Linux / macOS)
```bash
git clone https://github.com/tejassroot/BountyRadar.git
```

#### Option B: Download as ZIP (No Git Required)
1. Click the green **Code** button at the top of this repository.
2. Click **Download ZIP**.
3. Extract the downloaded `BountyRadar-main.zip` folder on your computer.

---

### Step 2: Load into Your Browser

#### 🌐 Google Chrome, Brave, Microsoft Edge, Opera (Windows & Linux)
> *Recommended: Stays permanently installed across all browser sessions.*

1. Open your browser and navigate to the extensions page:
   - **Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Edge**: `edge://extensions`
2. Toggle on **Developer mode** (switch in the top-right corner).
3. Click the **"Load unpacked"** button in the top-left corner.
4. Select the extracted `BountyRadar` folder (containing `manifest.json`).
5. **Done!** Click the puzzle icon (🧩) on your browser toolbar and pin **BountyRadar**.

---

#### 🦊 Mozilla Firefox (Windows & Linux)
1. Open Firefox and type in the address bar:
   ```text
   about:debugging#/runtime/this-firefox
   ```
2. Click **"Load Temporary Add-on…"**.
3. Open the `BountyRadar` folder and select the [`manifest.json`](manifest.json) file.
4. Pin the icon to your toolbar from the Extensions (🧩) menu.

*Or run from terminal with live reload:*
```bash
# Linux / macOS
cd BountyRadar && npx web-ext run

# Windows (PowerShell / Command Prompt)
cd BountyRadar; npx web-ext run
```

---

## 🎯 Features & Usage

| Feature | Description |
| :--- | :--- |
| **⚡ Zero-Click Sync** | Automatically pulls fresh data on startup; no manual sync clicking needed. |
| **🌍 Country & TLD Radar** | Filter across 20+ national and sovereign domains (`.gov`, `.de`, `.uk`, `.nl`, `.in`, `.ch`, `.au`, `.ca`, `.fr`, etc.). |
| **♾️ Unlimited Live Ingestion** | Dynamic feed cache-busting ensures newly launched targets are ingested without fixed caps. |
| **📊 Interactive Bento Grid** | Click any metric card (**Total**, **🔥 Fresh**, **🌐 Self-Hosted**, **🔒 Private**) for instant 1-click filtering. |
| **📋 1-Click Scope Copy** | Click **"Copy Scope"** on any program to copy all target domains formatted for recon CLI tools. |
| **🏷️ Quick Hunter Tags** | One-click chips for `API`, `Crypto`, `Mobile`, `Hall of Fame`, `security.txt`, `Safe Harbor`, etc. |
| **🔍 Smart Search & Hotkey** | Press **`/`** to focus search; supports multi-word queries (e.g. `bugcrowd api`, `private crypto`, `germany`, `gov`). |
| **📥 JSON Export** | Export filtered programs to structured JSON for automation pipelines. |

---

## 🛠️ Tech Stack & Structure

```text
BountyRadar/
├── manifest.json       # Manifest V3 cross-browser configuration
├── background.js       # Background service worker & auto-sync alarms
├── feeds.js            # Multi-source parser (Disclose.io, H1, Bugcrowd, etc.)
├── popup.html          # Cyber-obsidian bento grid dashboard
├── popup.css           # Glassmorphic responsive dark stylesheet
├── popup.js            # Reactive state, token search & clipboard integration
├── icons/              # Extension brand assets (16px, 48px, 128px)
└── dist/               # Packaged production zip release
```

---

## 🤝 Contributing & License
Contributions, feedback, and feed additions are welcome! Open an issue or pull request.  
Licensed under the [MIT License](LICENSE).
