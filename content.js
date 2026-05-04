const style = document.createElement('style');
style.textContent = `
.abridge-highlight {
  background-color: rgba(191, 64, 191, 0.18) !important; /* soft purple */
  border-bottom: 2px solid #BF40BF; /* main brand color */
  color: inherit !important;
  padding: 2px 0;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.abridge-highlight:hover {
  background-color: rgba(191, 64, 191, 0.35) !important;
}
`;
document.head.appendChild(style);


if (!chrome?.runtime?.onMessage) {
  console.warn('[Abridge] chrome.runtime unavailable on this page — messaging skipped.');
} else {

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {

    if (message.type === 'GET_PAGE_CONTENT') {
      try {
        const content = extractMainContent();
        const title = document.title || 'Untitled Page';
        const url = window.location.href;

        if (!content || content.length < 50) {
          sendResponse({ success: false, error: 'Not enough readable content found on this page.' });
          return true;
        }

        sendResponse({ success: true, content, title, url });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (message.type === 'HIGHLIGHT_CONTENT') {
      try {
        const { phrases } = message.payload;
        removeExistingHighlights();
        phrases.forEach(phrase => highlightPhrase(phrase));
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    if (message.type === 'CLEAR_HIGHLIGHTS') {
      removeExistingHighlights();
      sendResponse({ success: true });
      return true;
    }
  });

} 

function highlightPhrase(phrase) {
  if (!phrase || phrase.trim().length < 4) return;


const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const regex = new RegExp(`\\b(${escapedPhrase})\\b`, 'gi'); 

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parentTag = node.parentElement?.tagName?.toLowerCase();
        if (['script', 'style', 'noscript', 'mark'].includes(parentTag)) {
          return NodeFilter.FILTER_REJECT;
        }
        return regex.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    }
  );

  const nodesToReplace = [];
  let node;
  while ((node = walker.nextNode())) nodesToReplace.push(node);

  nodesToReplace.forEach(textNode => {
    const parts = textNode.nodeValue.split(regex);
    const fragment = document.createDocumentFragment();

    parts.forEach(part => {
      if (regex.test(part)) {
        const mark = document.createElement('mark');
        mark.className = 'abridge-highlight';
        mark.setAttribute('data-summarize-it', 'true');
        mark.textContent = part;
        fragment.appendChild(mark);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    });

    textNode.parentNode?.replaceChild(fragment, textNode);
  });
}

function removeExistingHighlights() {
  const marks = document.querySelectorAll('mark[data-summarize-it="true"]');
  marks.forEach(mark => {
    const text = document.createTextNode(mark.textContent);
    mark.parentNode?.replaceChild(text, mark);
  });
}