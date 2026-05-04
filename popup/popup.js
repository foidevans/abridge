const app          = document.getElementById('app');
const pageTitle    = document.getElementById('pageTitle');
const idleState    = document.getElementById('idleState');
const loadingState = document.getElementById('loadingState');
const loadingText  = document.getElementById('loadingText');
const errorState   = document.getElementById('errorState');
const errorMessage = document.getElementById('errorMessage');
const resultState  = document.getElementById('resultState');

const summarizeBtn = document.getElementById('summarizeBtn');
const retryBtn     = document.getElementById('retryBtn');
const highlightBtn = document.getElementById('highlightBtn');
const copyBtn      = document.getElementById('copyBtn');
const clearBtn     = document.getElementById('clearBtn');
const themeToggle  = document.getElementById('themeToggle');
const themeIcon    = document.getElementById('themeIcon');

const readingTimeEl = document.getElementById('readingTime');
const wordCountEl   = document.getElementById('wordCount');
const cachePill     = document.getElementById('cachePill');
const summaryText   = document.getElementById('summaryText');
const insightsList  = document.getElementById('insightsList');

let currentTab = null;      
let currentSummary = null;  
let highlightsActive = false;


const STATES = ['idle', 'loading', 'error', 'result'];

function showState(state) {
  idleState.classList.toggle('hidden', state !== 'idle');
  loadingState.classList.toggle('hidden', state !== 'loading');
  errorState.classList.toggle('hidden', state !== 'error');
  resultState.classList.toggle('hidden', state !== 'result');
}


async function init() {
  chrome.storage.local.get(['theme'], ({ theme }) => {
    applyTheme(theme || 'light');
  });

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    pageTitle.textContent = tab.title || 'Untitled Page';
  } catch {
    pageTitle.textContent = 'Could not read page info';
  }

  showState('idle');
}


async function runSummarize() {
  if (!currentTab?.id) {
    showError('No active tab found. Please try again.');
    return;
  }

  showState('loading');
  setLoading('Extracting page content…');
  summarizeBtn.disabled = true;

  let pageData;
  try {
    pageData = await sendMessageToTab(currentTab.id, { type: 'GET_PAGE_CONTENT' });
  } catch (err) {
    showError('Could not read this page. Try refreshing and opening the extension again.');
    return;
  }

  if (!pageData?.success) {
    showError(pageData?.error || 'Could not extract content from this page.');
    return;
  }

  setLoading('Generating summary with AI…');

  let result;
  try {
    result = await sendMessageToBackground({
      type: 'SUMMARIZE_PAGE',
      payload: {
        content: pageData.content,
        title: pageData.title,
        url: pageData.url,
      }
    });
  } catch (err) {
    showError('Failed to reach the background service. Try reopening the extension.');
    return;
  }

  if (!result?.success) {
    showError(result?.error || 'AI summarization failed. Check your API key and try again.');
    return;
  }

  currentSummary = result.data;
  renderSummary(result.data, result.fromCache);
  showState('result');
  summarizeBtn.disabled = false;
}


function renderSummary(data, fromCache) {
  readingTimeEl.textContent = data.readingTime || '—';
  wordCountEl.textContent = data.wordCount ? `${data.wordCount.toLocaleString()} words` : '—';
  cachePill.classList.toggle('hidden', !fromCache);

  summaryText.textContent = data.summary || 'No summary available.';

  insightsList.innerHTML = '';
  const insights = Array.isArray(data.keyInsights) ? data.keyInsights : [];
  insights.forEach(insight => {
    const li = document.createElement('li');
    li.className = 'insight-item';
    li.textContent = insight; 
    insightsList.appendChild(li);
  });

  if (insights.length === 0) {
    const li = document.createElement('li');
    li.className = 'insight-item';
    li.textContent = 'No key insights extracted.';
    insightsList.appendChild(li);
  }
}

function showError(message) {
  errorMessage.textContent = message;
  showState('error');
  summarizeBtn.disabled = false;
}

function setLoading(message) {
  loadingText.textContent = message;

}

async function handleHighlight() {
  if (!currentTab?.id || !currentSummary) return;

  if (highlightsActive) {
    await sendMessageToTab(currentTab.id, { type: 'CLEAR_HIGHLIGHTS' });
    highlightsActive = false;
    highlightBtn.textContent = 'Highlight on Page';
    return;
  }

  const phrasesToHighlight = [];

  const insights = currentSummary.keyInsights || [];
  insights.forEach(insight => {
    const words = insight.replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 0);
    
    for (let i = 0; i <= words.length - 3; i++) {
      const trio = words.slice(i, i + 3).join(' ');
      const quad = words.slice(i, i + 4).join(' ');

      if (!/^(the|and|is|was|that|this|with|for|they|he|she)\b/i.test(trio)) {
        if (quad && i <= words.length - 4) phrasesToHighlight.push(quad);
        phrasesToHighlight.push(trio);
      }
    }
  });

  const summaryText = currentSummary.summary || "";
  const summaryKeywords = summaryText.match(/\b(\w{6,})\b/g) || [];
  summaryKeywords.forEach(word => phrasesToHighlight.push(word));

  const finalSet = [...new Set(phrasesToHighlight)].filter(p => p.length > 3);

  if (finalSet.length === 0) return;

  const response = await sendMessageToTab(currentTab.id, {
    type: 'HIGHLIGHT_CONTENT',
    payload: { phrases: finalSet.slice(0, 60) } 
  });

  if (response?.success) {
    highlightsActive = true;
    highlightBtn.textContent = 'Clear Highlights';
  }
}



async function handleCopy() {
  if (!currentSummary) return;

  const text = [
    `Summary\n${currentSummary.summary}`,
    '',
    `Key Insights\n${(currentSummary.keyInsights || []).map((i, n) => `${n + 1}. ${i}`).join('\n')}`,
    '',
    `${currentSummary.readingTime} · ${currentSummary.wordCount} words`,
  ].join('\n');

  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = 'Copied!';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = 'Copy';
      copyBtn.classList.remove('copied');
    }, 2000);
  } catch {
    copyBtn.textContent = 'Failed';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
  }
}

async function handleClear() {
  if (currentTab?.url) {
    await sendMessageToBackground({ type: 'CLEAR_CACHE', url: currentTab.url });
  }
  if (highlightsActive && currentTab?.id) {
    await sendMessageToTab(currentTab.id, { type: 'CLEAR_HIGHLIGHTS' });
    highlightsActive = false;
  }
  currentSummary = null;
  highlightBtn.textContent = 'Highlight on Page';
  showState('idle');
}


function applyTheme(theme) {
  app.setAttribute('data-theme', theme);
  themeIcon.textContent = theme === 'dark' ? '☀' : '☽';
}

function toggleTheme() {
  const current = app.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  chrome.storage.local.set({ theme: next });
}


function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

function sendMessageToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}


summarizeBtn.addEventListener('click', runSummarize);
retryBtn.addEventListener('click', runSummarize);
highlightBtn.addEventListener('click', handleHighlight);
copyBtn.addEventListener('click', handleCopy);
clearBtn.addEventListener('click', handleClear);
themeToggle.addEventListener('click', toggleTheme);

// Keyboard shortcut: Enter on the summarize button
summarizeBtn.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') runSummarize();
});

init();