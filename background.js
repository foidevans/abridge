
const PROXY_URL = 'https://gemini-proxy-nine-iota.vercel.app/api/summarize';

const CACHE_TTL_MS = 60 * 60 * 1000;

let lastCallTime = 0;
const MIN_WAIT_MS = 10000;

async function callProxyAPI(content, title) {

   const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;

  if (timeSinceLastCall < MIN_WAIT_MS) {
    const secondsLeft = Math.ceil((MIN_WAIT_MS - timeSinceLastCall) / 1000);
    throw new Error(`Rate limit: Please wait ${secondsLeft}s before next summary.`);
  }

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, title })
  });

  if (!response.ok) {
      if (response.status === 429) {
      throw new Error("The AI is currently busy (limit reached). Please try again later.");
    }
    
    let errMsg = `Proxy error: ${response.status}`;
    try {
      const errBody = await response.json();
      errMsg = errBody?.error || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data;
}

function buildCacheKey(url) {
  try {
    const { origin, pathname } = new URL(url);
    return `cache_${origin}${pathname}`;
  } catch {
    return `cache_${url}`;
  }
}

function readCache(key) {
  return new Promise(resolve => {
    chrome.storage.local.get([key], result => {
      const entry = result[key];
      if (!entry) return resolve(null);
      const age = Date.now() - (entry.cachedAt || 0);
      if (age > CACHE_TTL_MS) {
        chrome.storage.local.remove([key]);
        return resolve(null);
      }
      resolve(entry);
    });
  });
}

function writeCache(key, data) {
  chrome.storage.local.set({ [key]: { ...data, cachedAt: Date.now() } });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

  if (message.type === 'SUMMARIZE_PAGE') {
    const { content, title, url } = message.payload;
    const cacheKey = buildCacheKey(url);

    (async () => {
      try {
        const cached = await readCache(cacheKey);
        if (cached) {
          sendResponse({ success: true, data: cached, fromCache: true });
          return;
        }
        const summary = await callProxyAPI(content, title);
        writeCache(cacheKey, summary);
        sendResponse({ success: true, data: summary, fromCache: false });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true;
  }

  if (message.type === 'CLEAR_CACHE') {
    const cacheKey = buildCacheKey(message.url);
    chrome.storage.local.remove([cacheKey], () => {
      sendResponse({ success: true });
    });
    return true;
  }
});