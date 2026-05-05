
# Abridge — AI Page Summarizer

A Chrome Extension (Manifest V3) that extracts meaningful content from any webpage and generates a structured AI summary — including bullet-point key insights, a plain-English overview, and estimated reading time.

---

## Features

- Extracts readable article content using heuristic DOM scoring
- Sends content to the Gemini 2.5 Flash API via a secure Vercel Proxy Server
- Displays: summary, key insights, reading time, word count
- **Smart Highlighting:** Uses a progressive phrase-matching algorithm to highlight key insights and summary anchors directly on the page
- Caches summaries per URL (1-hour TTL) to avoid duplicate API calls
- Dark/light mode toggle with persistent preference
- Copy summary to clipboard
- Graceful error handling throughout

---

## Setup Instructions

1. **Clone the repository**
  ```bash
  git clone https://github.com/foidevans/abridge.git
  cd abridge
  ```
2. **Set up the Proxy Server**
  - Create a Vercel project using the provided `/api` directory.
  - Add your `GEMINI_API_KEY` to Vercel's Environment Variables.
  - Deploy the project and copy your Deployment URL.
  - Open `background.js` and update the `PROXY_URL`:
    ```js
    const PROXY_URL = 'https://gemini-proxy-nine-iota.vercel.app/api/summarize';
;
    ```
3. **Load the extension in Chrome**
  - Open Chrome and go to `chrome://extensions`
  - Enable Developer Mode (top-right toggle)
  - Click **Load unpacked**
  - Select the `abridge` folder
  - The extension icon appears in your toolbar

4. **Use it**
  - Navigate to any article or blog post
  - Click the Abridge icon
  - Click **Summarize Page**
  - Read your summary and click **Highlight on Page** to see key facts in-situ

---

## Architecture

```
abridge/
├── manifest.json         # Extension config — Vercel host permissions
├── background.js         # Service worker — Proxy coordination, caching, rate limiting
├── content.js            # Injected into pages — DOM extraction, smart highlighting
├── popup/
│   ├── popup.html        # UI shell
│   ├── popup.css         # Styles with CSS custom properties (dark/light)
│   └── popup.js          # UI state machine, phrase-matching logic
├── lib/
│   └── readability.js    # Custom heuristic content extractor
└── icons/
   ├── icon16.png
   ├── icon48.png
   └── icon128.png
```

---

## Message Passing Flow

Chrome extensions are made of isolated JS contexts. They communicate via `chrome.runtime.sendMessage`:

```
User clicks "Summarize"
  │
  ▼
popup.js
  │── sendMessage(GET_PAGE_CONTENT) ──▶ content.js
  │                                        │ extracts DOM text
  │◀── { content, title, url } ───────────┘
  │
  │── sendMessage(SUMMARIZE_PAGE) ──▶ background.js
  │                                        │ checks chrome.storage cache
  │                                        │ checks local rate limit (10s)
  │                                        │ calls Vercel Proxy API
  │◀── { summary, keyInsights, ... } ──────┘
  │
  ▼
renders result in popup UI
```

---

## AI Integration

- **Provider:** Google Gemini 2.5 Flash (via Vercel Proxy)
- **Why 2.5 Flash?** State-of-the-art for performance-sensitive tasks, higher efficiency, better reasoning than 1.5.
- **Prompt strategy:** Uses Structured Outputs (`responseSchema`) to force the model to return a strict JSON object. This eliminates parsing errors and ensures the data shape matches the UI requirements. Temperature is set to 0.1 for maximum factual consistency.
- **Content capping:** Extracted text is capped at 15,000 characters before being sent to the API.

---

## Security Decisions

### API Key Location

The Gemini API key is never stored in the extension. It is hosted as an environment variable on a Vercel Proxy Server. The extension communicates with the proxy, which attaches the key server-side before forwarding the request to Google.

**Benefit:** This is a production-grade security architecture. The private key is invisible to users, preventing unauthorized quota consumption and securing the developer's credentials.

### XSS Prevention

All content rendered into the popup uses `element.textContent`, never `element.innerHTML`. This means malicious HTML in a page's content cannot be injected into the extension's UI. In `content.js`, page highlights are created with `document.createElement` and `element.textContent` — never `innerHTML`.

### Minimal Permissions

Only the permissions actually needed are declared:
- `activeTab` — access the current tab on user gesture only
- `scripting` — inject content script for highlighting
- `storage` — cache summaries and theme preferences
- `host_permissions` — limited specifically to the Vercel Proxy domain

---

## Trade-offs

| Decision                        | Why                                 | Trade-off                                      |
|----------------------------------|-------------------------------------|------------------------------------------------|
| Custom extractor vs Readability.js | No external dependencies to manage | Slightly less accurate on unusual layouts      |
| Gemini 2.5 vs GPT-4             | Free tier, superior speed           | Slightly different reasoning style             |
| Vercel Proxy for Key            | Highly secure, hides API credentials| Requires an active backend deployment          |
| Progressive Phrase Matching      | Highlights reworded AI content      | Multiple regex scans per page can be CPU-intensive |
| 15,000 char content cap         | High context, fast response         | Extremely long articles are summarized partially|
| Client-side Rate Limiting        | Protects API quota from spam        | Users must wait 10s between new summaries      |

---

## Known Limitations

- Does not work on `chrome://` pages, the Chrome Web Store, or PDFs
- Highlighting effectiveness depends on how heavily the AI paraphrases the source text
- Service worker may be terminated by Chrome; long-term state is preserved in `chrome.storage`
- Free tier quota (250/day for Flash 2.5) applies project-wide via the proxy

---

## Resources

- [Chrome Extensions MV3 Overview](https://developer.chrome.com/docs/extensions/mv3/)
- [Vercel Serverless Functions](https://vercel.com/docs/concepts/functions/serverless-functions)
- [Gemini API Structured Outputs](https://ai.google.dev/docs/structured_output)
- [chrome.storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [Cross-Origin Resource Sharing (CORS)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)