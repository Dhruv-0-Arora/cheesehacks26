# Fegis

Fegis is a Chrome extension that detects and masks personally identifiable information (PII). It highlights sensitive data in real time, replaces it with safe tokens or realistic fake values, and lets you review everything before it leaves your browser.

Everything runs locally — no data is sent to any external server.

---

## What it does

- **Real-time detection** — analyzes text as you type across ChatGPT, Gemini, Claude, Copilot, Grok, DeepSeek, and other non-agentic websites.
- **Color-coded highlights** — visually marks names, emails, phone numbers, credit cards, SSNs, addresses, API keys, URLs, and more
- **Two masking modes**
  - *Tokens* (default): replaces PII with `[NAME_1]`, `[EMAIL_2]`, etc.
  - *Fake data* (auto-replace beta): swaps in deterministically generated fake values that preserve the original format
- **Block on send** — warns you before unmasked PII reaches the AI
- **Response unmasking** — optionally restores tokens in AI replies back to originals
- **Custom blocklists** — add org-specific terms to detect
- **Session-only storage** — token maps are cleared when you close the browser

---

## Detected PII types

| Type | Examples |
|------|---------|
| Name | Sarah Johnson, Dr. Kim, Prof. Lee |
| Email | user@company.com |
| Phone | (206) 555-8742, +1-206-555-8742 |
| Financial | Credit cards (Luhn-validated), IBAN, routing numbers, crypto wallets |
| SSN / Identity | 372-14-8562, passport numbers, driver's licenses |
| Address | 742 Evergreen Terrace, Springfield, IL 62701 |
| Secret / API key | sk_live_..., Bearer tokens |
| URL | https://app.example.com/settings?api_token=... |
| ID / UUID | 550e8400-e29b-41d4-a716-446655440000 |
| Date | 03/15/1984, 2024-03-15 |
| Path | /etc/app/config.yml, /var/log/app/error.log |
| Log entries | Timestamps, IPs, usernames in log lines |
| Custom | Any terms you add to the blocklist |

---

## Project structure

```
fegis/
├── extension/          Chrome extension (MV3)
│   └── src/
│       ├── detectors/  9 pattern-based PII detectors + engine
│       ├── tokens/     Token manager & deterministic fake-data generator
│       ├── content/    Content script, highlighter, fetch interceptor, site adapters
│       ├── background/ Service worker & settings manager
│       └── popup/      Extension popup UI (React)
│
└── website/            Marketing & interactive demo site (React + Vite)
    └── src/
        └── components/
            └── HeroDemo.tsx  Live PII scanner demo with text and PDF upload
```

---

## Getting started

### Extension

```bash
cd extension
bun install        # or npm install
bun run build      # outputs to dist/
```

Load into Chrome:
1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select `extension/dist/`

For development with watch mode:

```bash
bun run dev
```

### Website

```bash
cd website
bun install        # or npm install
bun run dev        # starts Vite dev server at localhost:5173
```

The website imports directly from `extension/src` via a `@extension` path alias, so the demo always uses the same detection engine as the extension.

---

## Architecture notes

**Multiple execution contexts**

The extension runs code in three separate contexts that communicate via `chrome.runtime.sendMessage`:

- **Content script** (isolated world) — DOM access, highlighting, input monitoring
- **Fetch interceptor** (main world) — intercepts `fetch`, `XHR`, and `WebSocket` before page scripts
- **Service worker** — settings storage, session management, cross-tab broadcasting
- **Popup** — React UI for configuration

**Deterministic fake data**

Fake replacements use a DJB2 hash of the original value as a seed, so the same input always produces the same fake output within a session. Phone format is preserved, SSNs always start with `000`, credit cards with `4111`, etc.

**Site adapters**

Platform-specific selectors handle differences between ChatGPT (contenteditable), Claude (ProseMirror), and others. A generic fallback detects `contenteditable`, `textarea`, and `role=textbox` elements for unsupported sites.

**Privacy**

- No external requests
- Token/replacement maps live in `chrome.storage.session` (wiped on browser close)
- User settings live in `chrome.storage.local`
- Permissions: `storage`, `activeTab`, `clipboardWrite`

---

## Tech stack

- TypeScript 5.9
- React 19 + Vite 7
- Chrome Extensions Manifest V3
- pdfjs-dist (website PDF demo)
- Bun (package manager / task runner)
