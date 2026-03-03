# Fegis

[![DEMO VIDEO](https://img.youtube.com/vi/-zWZHxggq-g/0.jpg)](https://www.youtube.com/watch?v=-zWZHxggq-g)

A Chrome extension that detects personally identifiable information (PII) in AI chatbot inputs and either blocks the message or replaces PII with tokens/fake values before it's sent. All detection runs locally in the browser.

## Supported sites

ChatGPT, Claude, Gemini, Grok, Copilot, DeepSeek, and Perplexity. A generic fallback handles other sites that use `textarea`, `contenteditable`, or `role="textbox"` inputs.

## How it works

1. A content script monitors the chat input field as you type.
2. Text is run through regex-based detectors for each PII type.
3. Detected PII is highlighted inline with color-coded underlines.
4. Depending on the mode:
   - **Block mode** (default): pressing Enter or clicking Send is intercepted and a warning is shown. You choose to block or allow.
   - **Auto-replace mode**: PII is swapped with deterministic fake values in the outgoing fetch/XHR/WebSocket request body. AI responses containing fakes are unmasked back to originals.
5. Dropped or pasted files (PDF, DOCX, images) are parsed in an offscreen document and scanned before they reach the site. Files with PII are blocked until explicitly allowed.

## Detected PII types

| Type | What it matches |
|------|----------------|
| Name | Common first/last name combinations |
| Email | Email addresses |
| Phone | US phone formats, international with `+` prefix |
| Financial | Credit card numbers (Luhn-validated), IBANs, routing numbers, crypto wallet addresses |
| SSN / Identity | Social Security Numbers, passport numbers, driver's license numbers |
| Address | US street addresses with city/state/zip |
| Secret | API keys (`sk_live_`, `Bearer`, etc.), private keys |
| URL | URLs, especially those with tokens or credentials in query params |
| ID / UUID | UUIDs, numeric IDs |
| Date | Dates in common formats (MM/DD/YYYY, YYYY-MM-DD, etc.) |
| Path | Unix/Windows file paths |
| Log entries | Lines containing timestamps, IPs, and usernames |
| Custom | User-defined terms added via the popup blocklist |

## Machine Learning Model (Experimental)

In addition to regex-based detectors, Fegis can optionally use a lightweight machine learning model for PII detection. This model is a BiLSTM-CRF (Bidirectional Long Short-Term Memory with Conditional Random Field) based Named Entity Recognition (NER) model, trained to identify various PII categories in text.

-   **Training (`model/train.py`):** This script trains the BiLSTM NER model using TensorFlow/Keras. It processes input data to build a vocabulary and label mappings, then trains the model, and saves the trained model in Keras's `.h5` format. It also exports `vocab.json` and `labels.json` which are essential for inference.
-   **Conversion (`model/convert.py`):** After training, the `.h5` Keras model is converted into a TensorFlow.js LayersModel format. This conversion allows the model to be run directly in the browser. The script also copies the `vocab.json` and `labels.json` files alongside the converted TF.js model artifacts into the `extension/public/model/` directory, making them accessible to the extension.
-   **Inference (`extension/src/detectors/engine.ts`):** The `analyzeTextWithML` function in `engine.ts` integrates the ML model's predictions with the existing regex-based detection. It asynchronously requests ML analysis via the background service worker, loading the converted TensorFlow.js model from `extension/public/model/`. ML-detected PII is then merged with regex matches, with regex matches taking priority in case of overlaps. This allows for a hybrid detection approach, leveraging both rule-based and ML-based insights.

## Masking modes

**Tokens**: replaces PII with labels like `[NAME_1]`, `[EMAIL_2]`. A token map is stored in session storage so the same value always gets the same token.

**Fake data**: generates deterministic fake values (seeded by a hash of the original) that preserve the format -- phone numbers stay phone-shaped, SSNs start with `000`, credit cards start with `4111`, etc. The same input always produces the same fake within a session.

## File scanning

When a file is dropped or pasted into a chat input, the extension intercepts it before the site receives it:

- **PDF** -- text extracted with `pdfjs-dist`
- **DOCX** -- text extracted with `mammoth`
- **Images** -- OCR via `Tesseract.js`

Parsing runs in a Chrome offscreen document (the MV3 service worker can't use `import()` or Web Workers). If PII is found, the file is blocked and a warning panel appears. If allowed, the file is whitelisted by name+size so subsequent drops go through without re-scanning.

## Project structure

```
extension/
├── src/
│   ├── detectors/      Regex-based PII detectors (one file per type) + engine
│   ├── tokens/         Token/fake-data manager, deterministic fake generator
│   ├── content/        Content script, highlighter, DOM interceptor, site adapters, file handler
│   ├── parsers/        File type detection (PDF, DOCX, image)
│   ├── offscreen/      Offscreen document for PDF/DOCX/OCR parsing
│   ├── background/     Service worker (settings, message relay to offscreen)
│   └── popup/          Settings UI (React)
├── public/             manifest.json, icons, offscreen.html
└── tests/

website/
└── src/
    └── components/
        └── HeroDemo.tsx    Interactive demo: paste text or upload PDF/DOCX to see detection
```

## Extension architecture

The extension runs across four contexts, communicating via `chrome.runtime.sendMessage` and `window.postMessage`:

- **Content script** (isolated world) -- DOM monitoring, highlight rendering, input interception, file handling
- **Fetch interceptor** (main world) -- patches `fetch`, `XHR`, and `WebSocket.send` to replace PII in outgoing request bodies (ChatGPT and Gemini)
- **Service worker** -- settings storage (`chrome.storage.local` / `chrome.storage.session`), message relay to offscreen document
- **Offscreen document** -- runs pdfjs-dist, mammoth, and Tesseract.js for file parsing (service workers can't use these libraries)

Site-specific adapters provide CSS selectors for each platform's input field, send button, and response containers. A generic fallback covers unsupported sites.

## Setup

### Extension

```bash
cd extension
npm install
npm run build:ext    # outputs to extension/dist/
```

Load in Chrome:
1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `extension/dist/`

### Website

```bash
cd website
npm install
npm run dev          # Vite dev server at localhost:5173
```

The website imports detection code from `extension/src` via a `@extension` path alias, so the demo uses the same engine as the extension.

## Dependencies

**Extension**: React 19, pdfjs-dist, mammoth, Tesseract.js, Vite 7, TypeScript

**Website**: React 19, pdfjs-dist, mammoth, Spline (3D), Vite, TypeScript

## Privacy

- All PII detection and replacement happens in the browser. No data is sent to external servers.
- Token and replacement maps are stored in `chrome.storage.session` (cleared when the browser closes).
- User settings are stored in `chrome.storage.local`.
- Required permissions: `storage`, `activeTab`, `clipboardWrite`, `offscreen`.
