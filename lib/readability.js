function scoreElement(el) {
  let score = 0;
  const tag = el.tagName.toLowerCase();

  const positiveTagScores = { article: 30, main: 25, section: 10 };
  const negativeTagScores = { nav: -25, footer: -25, header: -20, aside: -20, form: -15 };

  if (positiveTagScores[tag] !== undefined) score += positiveTagScores[tag];
  if (negativeTagScores[tag] !== undefined) score += negativeTagScores[tag];

  const identifier = `${el.id} ${el.className}`.toLowerCase();
  const positivePattern = /article|content|main|post|body|entry|story|text|prose/;
  const negativePattern = /nav|sidebar|footer|header|menu|ad|banner|popup|modal|cookie|share|related/;

  if (positivePattern.test(identifier)) score += 20;
  if (negativePattern.test(identifier)) score -= 20;

  const paragraphCount = el.querySelectorAll('p').length;
  score += Math.min(paragraphCount * 3, 30); 

  const textLength = (el.innerText || '').length;
  if (textLength > 500) score += 10;
  if (textLength > 1500) score += 15;

  return score;
}


function extractMainContent() {

  const landmarks = ['article', 'main', '[role="main"]', '.post-content', '.article-body'];
  for (const selector of landmarks) {
    const el = document.querySelector(selector);
    if (el) {
      const text = (el.innerText || '').trim();
      if (text.length > 200) return sanitizeText(text);
    }
  }


  const candidates = document.querySelectorAll('div, section, article, main');
  let bestEl = null;
  let bestScore = -Infinity;

  candidates.forEach(el => {
    if ((el.innerText || '').trim().length < 100) return;

    const score = scoreElement(el);
    if (score > bestScore) {
      bestScore = score;
      bestEl = el;
    }
  });

  if (bestEl) return sanitizeText(bestEl.innerText || '');

  const paragraphs = Array.from(document.querySelectorAll('p'))
    .map(p => (p.innerText || '').trim())
    .filter(t => t.length > 40)
    .join('\n\n');

  return sanitizeText(paragraphs || document.body.innerText || '');
}

function sanitizeText(text) {
  return text
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 8000);
}