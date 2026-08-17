import mammoth from 'mammoth';

// Sample data
const SAMPLE_EN_HTML = `<section>
  <h2>Employment insurance benefits and leave</h2>
  <p>Find information on Employment Insurance (EI) benefits, including sickness, maternity, and parental leave.</p>
  
  <h3>Eligibility requirements</h3>
  <p>To qualify for regular benefits, you must meet the following criteria:</p>
  <ul>
    <li>You were employed in insurable employment.</li>
    <li>You lost your job through no fault of your own.</li>
    <li>You have been without work and pay for at least 7 consecutive days.</li>
  </ul>

  <h3>How to apply</h3>
  <p>Submit your application online through the official portal. You should apply as soon as possible after you stop working.</p>
  
  <p>For more details, consult the <a href="https://www.canada.ca/en/services/benefits/ei.html">Employment Insurance overview</a>.</p>

  <section class="alert alert-info">
    <h3>Important notice</h3>
    <p>Always have your <strong>Social Insurance Number (SIN)</strong> ready before starting.</p>
  </section>
</section>`;

const SAMPLE_FR_DOCX_HTML = `<h2>Prestations d'assurance-emploi et congés</h2>
<p>Trouvez des renseignements sur les prestations d'assurance-emploi (AE), y compris les congés de maladie, de maternité et parentaux.</p>
<h3>Critères d'admissibilité</h3>
<p>Pour être admissible aux prestations régulières, vous devez répondre aux critères suivants :</p>
<ul>
  <li>Vous occupiez un emploi assurable.</li>
  <li>Vous avez perdu votre emploi sans en être responsable.</li>
  <li>Vous avez été sans travail et sans rémunération pendant au moins 7 jours consécutifs.</li>
</ul>
<h3>Comment présenter une demande</h3>
<p>Présentez votre demande en ligne par l'intermédiaire du portail officiel. Vous devez présenter votre demande dès que possible après avoir cessé de travailler.</p>
<p>Pour en savoir plus, consultez <a href="https://www.canada.ca/fr/services/prestations/ae.html">l'aperçu de l'assurance-emploi</a>.</p>
<h3>Avis important</h3>
<p>Ayez toujours votre <strong>numéro d'assurance sociale (NAS)</strong> à portée de main avant de commencer.</p>`;

// Symmetra Core Constants & Logic
const BLOCK_SELECTOR =
  'h2,h3,h4,h5,h6,p,li,dt,dd,td,th,figcaption,blockquote,caption,summary,img[alt],input[placeholder],input[aria-label],textarea[placeholder],button[aria-label]';

const SPAN_TAGS = ['a', 'strong', 'b', 'em', 'i'];

function spanType(tag) {
  if (tag === 'a') return 'a';
  if (tag === 'strong' || tag === 'b') return 'strong';
  return 'em';
}

function isLeafBlock(el) {
  const tagName = el.tagName.toLowerCase();
  if (['img', 'input', 'textarea', 'button'].includes(tagName)) return true;
  return !el.querySelector(BLOCK_SELECTOR);
}

function isClassificationMarking(text) {
  const words = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length || words.length > 6) return false;
  const allowed = new Set([
    'unclassified', 'non', 'classifie', 'classifiee', 'protected',
    'protege', 'a', 'b', 'c', 'secret', 'top', 'confidential', 'confidentiel'
  ]);
  const core = [
    'unclassified', 'classifie', 'classifiee', 'protected',
    'protege', 'secret', 'confidential', 'confidentiel'
  ];
  return words.every((w) => allowed.has(w)) && words.some((w) => core.includes(w));
}

function isPlainUrlText(text) {
  const t = text.trim().replace(/[.,;:)\]\u00bb]+$/, '');
  if (!t) return false;
  return /^(https?:\/\/\S+|www\.\S+)$/i.test(t);
}

function getBlockContent(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'img') return el.getAttribute('alt') || '';
  if (['input', 'textarea'].includes(tag) && el.hasAttribute('placeholder'))
    return el.getAttribute('placeholder') || '';
  if (['input', 'button'].includes(tag) && el.hasAttribute('aria-label'))
    return el.getAttribute('aria-label') || '';
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

function applyFrenchTypographyRules(text) {
  if (!text) return text;
  return text
    .replace(/(\s*)([:?!;])/g, '\u00A0$2')
    .replace(/«\s*/g, '«\u00A0')
    .replace(/\s*»/g, '\u00A0»');
}

function extractBlockSpans(el) {
  const tag = el.tagName.toLowerCase();
  if (SPAN_TAGS.includes(tag)) {
    const type = spanType(tag);
    return [
      {
        type,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        href: type === 'a' ? el.getAttribute('href') || '' : undefined,
      },
    ];
  }
  const found = Array.from(el.querySelectorAll(SPAN_TAGS.join(', ')));
  const foundSet = new Set(found);
  const topLevel = found.filter((n) => {
    let p = n.parentElement;
    while (p && p !== el) {
      if (foundSet.has(p)) return false;
      p = p.parentElement;
    }
    return true;
  });
  return topLevel
    .map((n) => {
      const type = spanType(n.tagName.toLowerCase());
      return {
        type,
        text: (n.textContent || '').replace(/\s+/g, ' ').trim(),
        href: type === 'a' ? n.getAttribute('href') || '' : undefined,
      };
    })
    .filter((s) => s.text.length > 0);
}

function extractBlocks(rootEl) {
  const all = Array.from(rootEl.querySelectorAll(BLOCK_SELECTOR));
  return all
    .filter((el) => isLeafBlock(el))
    .map((el) => {
      const tag = el.tagName.toLowerCase();
      let attrTarget = 'text';
      if (tag === 'img') attrTarget = 'alt';
      else if (['input', 'textarea'].includes(tag) && el.hasAttribute('placeholder'))
        attrTarget = 'placeholder';
      else if (el.hasAttribute('aria-label')) attrTarget = 'aria-label';
      return {
        el,
        tag,
        attrTarget,
        text: getBlockContent(el),
        spans: extractBlockSpans(el),
      };
    })
    .filter((b) => b.text.length > 0)
    .filter((b) => !isClassificationMarking(b.text))
    .filter((b) => !isPlainUrlText(b.text));
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFragmentHref(href) {
  return typeof href === 'string' && href.trim().startsWith('#');
}

function formatFrenchRootRelativeLink(rawHref) {
  if (!rawHref || typeof rawHref !== 'string') return rawHref || '';
  const trimmed = rawHref.trim();
  if (!trimmed) return '';

  // Preserve anchor fragments, mailto, tel, javascript, etc.
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('javascript:')
  ) {
    return trimmed;
  }

  // 1. AEM authoring prefix + /content/canadasite/... or /content/...
  // (e.g. https://author-canada-prod.adobecqms.net/editor.html/content/canadasite/en/...)
  // (e.g. /editor.html/content/canadasite/en/... or /cf#/content/canadasite/en/...)
  const aemAuthorMatch = trimmed.match(/(?:https?:\/\/[^\/]+)?(?:\/editor\.html|\/cf#)(\/content\/(?:canadasite|dam|[a-zA-Z0-9_-]+)\/.*)$/i);
  if (aemAuthorMatch) {
    return aemAuthorMatch[1];
  }

  // 2. Domain + /content/canadasite/... or /content/dam/... or /content/...
  const contentMatch = trimmed.match(/(?:https?:\/\/[^\/]+)(\/content\/(?:canadasite|dam|[a-zA-Z0-9_-]+)\/.*)$/i);
  if (contentMatch) {
    return contentMatch[1];
  }

  // 3. Already root-relative /content/...
  if (trimmed.startsWith('/content/')) {
    return trimmed;
  }

  // 4. Domains (e.g. canada-preview.adobecqms.net, www.canada.ca, etc.) or relative paths with /en/ or /fr/
  // E.g. https://canada-preview.adobecqms.net/en/health-canada/services/food-nutrition/food-safety/education.html
  // E.g. https://www.canada.ca/en/health-canada/services/food-nutrition/food-safety/education.html
  // E.g. /en/health-canada/services/...
  // E.g. /fr/sante-canada/services/...
  const langPathMatch = trimmed.match(/^(?:https?:\/\/[^\/]+)?(?:\/editor\.html|\/cf#)?\/(en|fr)(\/.*|\.html.*|\?.*|#.*|$)/i);
  if (langPathMatch) {
    const lang = langPathMatch[1].toLowerCase();
    const rest = langPathMatch[2] || '';
    return `/content/canadasite/${lang}${rest}`;
  }

  // 5. Canada.ca or adobecqms.net domain without explicit en/fr prefix
  const gcDomainMatch = trimmed.match(/^https?:\/\/(?:[a-zA-Z0-9_.-]*canada\.ca|[a-zA-Z0-9_.-]*adobecqms\.net|[a-zA-Z0-9_.-]*gc\.ca)(\/.*)?$/i);
  if (gcDomainMatch) {
    const path = gcDomainMatch[1] || '';
    if (path.startsWith('/content/')) {
      return path;
    }
    if (path.match(/^\/(en|fr)(\/.*|$)/i)) {
      return `/content/canadasite${path}`;
    }
    if (path) {
      return `/content/canadasite${path}`;
    }
    return '/content/canadasite';
  }

  return trimmed;
}

function replaceBlockTextPreservingLinks(
  el,
  newText,
  attrTarget = 'text',
  frSpans = []
) {
  newText = applyFrenchTypographyRules(newText);
  if (attrTarget !== 'text') {
    el.setAttribute(attrTarget, newText);
    return { unresolvedLinks: 0 };
  }
  const blockTag = el.tagName.toLowerCase();
  if (SPAN_TAGS.includes(blockTag)) {
    if (blockTag === 'a') {
      const originalHref = el.getAttribute('href') || '';
      el.textContent = newText;
      if (isFragmentHref(originalHref)) return { unresolvedLinks: 0 };
      const frLink = frSpans.find((s) => s.type === 'a');
      if (frLink && frLink.href) {
        el.setAttribute('href', formatFrenchRootRelativeLink(frLink.href));
        return { unresolvedLinks: 0 };
      }
      return { unresolvedLinks: 1 };
    }
    el.textContent = newText;
    return { unresolvedLinks: 0 };
  }
  const oldSpans = extractBlockSpans(el);
  if (!oldSpans.length) {
    el.textContent = newText;
    return { unresolvedLinks: 0 };
  }
  const originalText = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (oldSpans.length === 1 && originalText === oldSpans[0].text) {
    const span = oldSpans[0];
    if (span.type === 'a') {
      const originalHref = el.querySelector('a')?.getAttribute('href') || '';
      const aElem = document.createElement('a');
      aElem.textContent = newText;
      if (isFragmentHref(originalHref)) {
        aElem.setAttribute('href', originalHref);
        el.replaceChildren(aElem);
        return { unresolvedLinks: 0 };
      }
      const frLink = frSpans.find((s) => s.type === 'a');
      if (frLink && frLink.href) {
        aElem.setAttribute('href', formatFrenchRootRelativeLink(frLink.href));
        el.replaceChildren(aElem);
        return { unresolvedLinks: 0 };
      }
      el.replaceChildren(document.createTextNode(newText));
      return { unresolvedLinks: 1 };
    }
    const tagElem = document.createElement(span.type === 'strong' ? 'strong' : 'em');
    tagElem.textContent = newText;
    el.replaceChildren(tagElem);
    return { unresolvedLinks: 0 };
  }

  const typeCounters = {};
  const spansMeta = oldSpans.map((span) => {
    const n = typeCounters[span.type] || 0;
    const sameTypeFr = frSpans.filter((s) => s.type === span.type);
    const frMatch = sameTypeFr[n] || null;
    typeCounters[span.type] = n + 1;
    const origA = el.querySelector(`a`);
    const isFrag = span.type === 'a' && isFragmentHref(origA?.getAttribute('href') || '');
    return {
      ...span,
      frMatch,
      isFragment: isFrag,
      matchedText: '',
    };
  });

  const placeholders = spansMeta.map((_, i) => `___GC_SPAN_${i}___`);
  let rebuilt = newText;
  spansMeta.forEach((span, i) => {
    const candidates = [span.frMatch && span.frMatch.text, span.text].filter(Boolean);
    for (const candidate of candidates) {
      const escaped = escapeRegExp(candidate);
      const regex = new RegExp(escaped, 'i');
      if (regex.test(rebuilt)) {
        rebuilt = rebuilt.replace(regex, placeholders[i]);
        span.matchedText = candidate;
        break;
      }
    }
  });

  if (spansMeta.every((_, i) => rebuilt.includes(placeholders[i]))) {
    el.replaceChildren();
    const parts = rebuilt.split(/(___GC_SPAN_\d+___)/g);
    let unresolved = 0;
    parts.forEach((part) => {
      const match = part.match(/^___GC_SPAN_(\d+)___$/);
      if (match) {
        const span = spansMeta[parseInt(match[1], 10)];
        const spanEl = document.createElement(
          span.type === 'a' ? 'a' : span.type === 'strong' ? 'strong' : 'em'
        );
        spanEl.textContent = span.matchedText || span.text;
        if (span.type === 'a') {
          if (span.isFragment) {
            spanEl.setAttribute('href', span.href || '#');
          } else if (span.frMatch && span.frMatch.href) {
            spanEl.setAttribute('href', formatFrenchRootRelativeLink(span.frMatch.href));
          } else {
            unresolved++;
          }
        }
        el.appendChild(spanEl);
      } else if (part) {
        el.appendChild(document.createTextNode(part));
      }
    });
    return { unresolvedLinks: unresolved };
  }

  el.replaceChildren(document.createTextNode(newText));
  let unresolved = 0;
  spansMeta.forEach((span) => {
    if (span.type === 'a' && !span.isFragment && !(span.frMatch && span.frMatch.href)) {
      unresolved++;
      return;
    }
    const label = span.matchedText || (span.frMatch && span.frMatch.text) || span.text;
    const spanEl = document.createElement(
      span.type === 'a' ? 'a' : span.type === 'strong' ? 'strong' : 'em'
    );
    if (label) spanEl.textContent = label;
    if (span.type === 'a' && !span.isFragment && span.frMatch && span.frMatch.href) {
      spanEl.setAttribute('href', formatFrenchRootRelativeLink(span.frMatch.href));
    }
    el.appendChild(document.createTextNode(' '));
    el.appendChild(spanEl);
  });
  return { unresolvedLinks: unresolved };
}

function alignByTag(enTags, frTags) {
  const n = enTags.length;
  const m = frTags.length;
  const MATCH = 2;
  const MISMATCH = -1;
  const GAP = -1;

  if (n * m > 4000000) {
    const len = Math.max(n, m);
    const pairs = [];
    for (let i = 0; i < len; i++) {
      pairs.push({ enIndex: i < n ? i : null, frIndex: i < m ? i : null, skip: false });
    }
    return pairs;
  }

  const score = new Array(n + 1);
  for (let i = 0; i <= n; i++) score[i] = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) score[i][0] = score[i - 1][0] + GAP;
  for (let j = 1; j <= m; j++) score[0][j] = score[0][j - 1] + GAP;

  for (let i = 1; i <= n; i++) {
    const rowCur = score[i];
    const rowPrev = score[i - 1];
    for (let j = 1; j <= m; j++) {
      const diag = rowPrev[j - 1] + (enTags[i - 1] === frTags[j - 1] ? MATCH : MISMATCH);
      const up = rowPrev[j] + GAP;
      const left = rowCur[j - 1] + GAP;
      rowCur[j] = Math.max(diag, up, left);
    }
  }

  let i = n;
  let j = m;
  const pairs = [];

  while (i > 0 && j > 0) {
    const cur = score[i][j];
    const diagVal = score[i - 1][j - 1] + (enTags[i - 1] === frTags[j - 1] ? MATCH : MISMATCH);
    if (cur === diagVal) {
      pairs.push({ enIndex: i - 1, frIndex: j - 1, skip: false });
      i--;
      j--;
    } else if (cur === score[i - 1][j] + GAP) {
      pairs.push({ enIndex: i - 1, frIndex: null, skip: false });
      i--;
    } else {
      pairs.push({ enIndex: null, frIndex: j - 1, skip: false });
      j--;
    }
  }

  while (i > 0) {
    pairs.push({ enIndex: --i, frIndex: null, skip: false });
  }
  while (j > 0) {
    pairs.push({ enIndex: null, frIndex: --j, skip: false });
  }
  pairs.reverse();
  return pairs;
}

function isHeadingTag(tag) {
  return /^h[1-6]$/.test(tag);
}

function describeStyleMismatch(enTag, frTag) {
  const enHeading = isHeadingTag(enTag);
  const frHeading = isHeadingTag(frTag);
  if (enHeading && !frHeading) {
    return (
      'The English HTML has this as a heading (<' +
      enTag +
      '>), but the matching paragraph in the French Word document isn\'t styled as a heading — it came through as plain text (<' +
      frTag +
      '>). In Word, apply the Heading ' +
      enTag.slice(1) +
      ' style to this paragraph so it matches.'
    );
  }
  if (!enHeading && frHeading) {
    return (
      'The matching paragraph in the French Word document is styled as a heading (<' +
      frTag +
      '>), but the English HTML has this as plain text (<' +
      enTag +
      '>). Double-check whether the Word paragraph should be a heading, or if the style was applied by mistake.'
    );
  }
  if (enHeading && frHeading) {
    return (
      'Heading level mismatch: the English HTML uses <' +
      enTag +
      '> but the French Word paragraph is styled as <' +
      frTag +
      '>. Apply the same heading level in Word.'
    );
  }
  return (
    'The English HTML has this as <' +
    enTag +
    '>, but the matching French Word paragraph came through as <' +
    frTag +
    '>. Check the paragraph style applied in Word.'
  );
}

function issueSnippet(text, max = 80) {
  if (!text) return '(empty)';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return '(empty)';
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

function computeIssues(
  alignRows,
  enBlocks,
  frBlocks,
  linkIssueRows = []
) {
  const groups = {
    mismatch: [],
    missing: [],
    extra: [],
    links: [],
  };

  alignRows.forEach((row) => {
    const en = row.enIndex !== null ? enBlocks[row.enIndex] : null;
    const fr = row.frIndex !== null ? frBlocks[row.frIndex] : null;
    const mismatched = !!(en && fr && fr.tag !== en.tag);
    const noFr = row.frIndex === null;

    if (mismatched && row.enIndex !== null && en && fr) {
      groups.mismatch.push({
        category: 'mismatch',
        kind: 'jump-en',
        enIndex: row.enIndex,
        title: 'Style mismatch — block #' + (row.enIndex + 1),
        detail:
          describeStyleMismatch(en.tag, fr.tag) +
          ' — "' +
          issueSnippet(en.text) +
          '"',
      });
    }
    if (noFr && row.enIndex !== null && !row.skip && en) {
      groups.missing.push({
        category: 'missing',
        kind: 'jump-en',
        enIndex: row.enIndex,
        title: 'No French match — block #' + (row.enIndex + 1),
        detail:
          '<' +
          en.tag +
          '> "' +
          issueSnippet(en.text) +
          '" has no matching French content in document.',
      });
    }
  });

  alignRows
    .filter((r) => r.enIndex === null && r.frIndex !== null)
    .forEach((row) => {
      const fr = row.frIndex !== null ? frBlocks[row.frIndex] : null;
      if (row.frIndex !== null) {
        groups.extra.push({
          category: 'extra',
          kind: 'none',
          frIndex: row.frIndex,
          title: 'Extra French content — Word block #' + (row.frIndex + 1),
          detail:
            '<' +
            (fr ? fr.tag : '?') +
            '> "' +
            issueSnippet(fr ? fr.text : '') +
            '" was not used — no matching English block in HTML structure.',
        });
      }
    });

  linkIssueRows.forEach((row) => {
    const en = enBlocks[row.enIndex];
    groups.links.push({
      category: 'links',
      kind: 'jump-en',
      enIndex: row.enIndex,
      title: 'Link needs review — block #' + (row.enIndex + 1),
      detail:
        row.count +
        ' link(s) in this block have no matching French URL, so the link was dropped (plain text kept). Add the correct French URL, or hyperlink the term in the .docx and re-upload.' +
        (en ? ' — "' + issueSnippet(en.text) + '"' : ''),
    });
  });

  return groups;
}

function parseEnHtml(raw) {
  raw = raw.trim();
  if (!raw) return { ok: false, msg: 'Paste or provide HTML source first.' };
  const hasHtmlTag = /<html[\s>]/i.test(raw);
  const parser = new DOMParser();
  let doc;
  let root;
  let isFullDoc = false;

  if (hasHtmlTag) {
    doc = parser.parseFromString(raw, 'text/html');
    root = doc.body;
    isFullDoc = true;
  } else {
    doc = parser.parseFromString('<html><body></body></html>', 'text/html');
    doc.body.innerHTML = raw;
    root = doc.body;
    isFullDoc = false;
  }

  const parseErr = doc.querySelector('parsererror');
  const blocks = extractBlocks(root);
  if (blocks.length === 0) {
    return {
      ok: false,
      msg: 'No headings, paragraphs, list items, or table cells found in HTML.',
    };
  }

  return {
    ok: true,
    count: blocks.length,
    warn: !!parseErr,
    blocks,
    isFullDoc,
    rawHtml: raw,
  };
}

const HIGHLIGHT_CSS = `
:root {
  --gc-bg: #121316;
  --gc-text: #f3f4f6;
  --gc-text-muted: #9ca3af;
  --gc-heading: #ffffff;
  --gc-link: #60a5fa;
  --gc-link-hover: #93c5fd;
  --gc-border: #2e3440;
  --gc-card-bg: #1a1d24;
}

body.gc-light-mode {
  --gc-bg: #ffffff;
  --gc-text: #333333;
  --gc-text-muted: #555555;
  --gc-heading: #333333;
  --gc-link: #284162;
  --gc-link-hover: #0535d2;
  --gc-border: #dcdcdc;
  --gc-card-bg: #f9f9f9;
}

html, body {
  background: var(--gc-bg) !important;
  color: var(--gc-text) !important;
}

body {
  padding: 34px !important;
  padding-top: 40vh !important;
  padding-bottom: 40vh !important;
  font-family: "Noto Sans", "Helvetica Neue", Arial, sans-serif !important;
  font-size: 16px !important;
  line-height: 1.5 !important;
  margin: 0;
  box-sizing: border-box;
}

*, *::before, *::after {
  box-sizing: inherit;
}

body * {
  font-family: inherit !important;
}

h1, h2, h3, h4, h5, h6 {
  font-weight: 700 !important;
  line-height: 1.2 !important;
  color: var(--gc-heading) !important;
}

a {
  color: var(--gc-link) !important;
  text-decoration: underline !important;
}
a:visited {
  color: var(--gc-link) !important;
}
a:hover, a:focus {
  color: var(--gc-link-hover) !important;
}

.alert, section.alert, div.alert, aside.alert {
  position: relative !important;
  margin-top: 1.5em !important;
  margin-bottom: 1.5em !important;
  padding: 10px 0 8px 30px !important;
  border: none !important;
  border-left: 6px solid #269abc !important;
  border-radius: 0 !important;
  box-sizing: border-box !important;
  display: block !important;
  background: transparent !important;
  background-color: transparent !important;
  color: var(--gc-text, #f3f4f6) !important;
}

.alert::before {
  content: "" !important;
  position: absolute !important;
  left: -16px !important;
  top: 8px !important;
  width: 26px !important;
  height: 26px !important;
  border-radius: 50% !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
  background-size: contain !important;
  box-shadow: 0 0 0 3.5px var(--gc-bg, #18181b) !important;
  z-index: 2 !important;
}
body.gc-light-mode .alert::before {
  box-shadow: 0 0 0 3.5px #ffffff !important;
}

.alert h1, .alert h2, .alert h3, .alert h4, .alert h5, .alert h6,
.alert > h1, .alert > h2, .alert > h3, .alert > h4, .alert > h5, .alert > h6 {
  margin-top: 0 !important;
  margin-bottom: 8px !important;
  font-size: 1.35em !important;
  font-weight: 700 !important;
  line-height: 1.3 !important;
  letter-spacing: normal !important;
  color: #ffffff !important;
}

.alert p, .alert > p {
  margin-top: 0 !important;
  margin-bottom: 10px !important;
  line-height: 1.5 !important;
  color: var(--gc-text, #f3f4f6) !important;
}

.alert ul, .alert ol {
  margin-top: 6px !important;
  margin-bottom: 10px !important;
  padding-left: 20px !important;
  color: var(--gc-text, #f3f4f6) !important;
}

.alert li {
  margin-bottom: 4px !important;
  color: var(--gc-text, #f3f4f6) !important;
}

.alert > :last-child,
.alert p:last-child,
.alert ul:last-child,
.alert ol:last-child {
  margin-bottom: 0 !important;
}

.alert a, .alert .alert-link {
  text-decoration: underline !important;
  font-weight: 600 !important;
  color: #93c5fd !important;
}

/* Info Alert (Default contextual alert on Canada.ca) */
.alert-info, section.alert-info, div.alert-info, aside.alert-info,
.alert:not(.alert-warning):not(.alert-danger):not(.alert-success) {
  border-left-color: #269abc !important;
}
.alert-info::before, section.alert-info::before, div.alert-info::before, aside.alert-info::before,
.alert:not(.alert-warning):not(.alert-danger):not(.alert-success)::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23269abc'/%3E%3Ccircle cx='12' cy='7' r='1.6' fill='%23ffffff'/%3E%3Crect x='10.4' y='10.5' width='3.2' height='7.5' rx='1' fill='%23ffffff'/%3E%3C/svg%3E") !important;
}

/* Warning Alert */
.alert-warning, section.alert-warning, div.alert-warning, aside.alert-warning {
  border-left-color: #ee7100 !important;
}
.alert-warning::before, section.alert-warning::before, div.alert-warning::before, aside.alert-warning::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23ee7100'/%3E%3Crect x='10.4' y='5.5' width='3.2' height='8.5' rx='1' fill='%23ffffff'/%3E%3Ccircle cx='12' cy='17.5' r='1.6' fill='%23ffffff'/%3E%3C/svg%3E") !important;
}

/* Danger Alert */
.alert-danger, section.alert-danger, div.alert-danger, aside.alert-danger {
  border-left-color: #d3080c !important;
}
.alert-danger::before, section.alert-danger::before, div.alert-danger::before, aside.alert-danger::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23d3080c'/%3E%3Crect x='10.4' y='5.5' width='3.2' height='8.5' rx='1' fill='%23ffffff'/%3E%3Ccircle cx='12' cy='17.5' r='1.6' fill='%23ffffff'/%3E%3C/svg%3E") !important;
}

/* Success Alert */
.alert-success, section.alert-success, div.alert-success, aside.alert-success {
  border-left-color: #278400 !important;
}
.alert-success::before, section.alert-success::before, div.alert-success::before, aside.alert-success::before {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23278400'/%3E%3Cpolyline points='6.5 12 10.5 16 17.5 8.5' fill='none' stroke='%23ffffff' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") !important;
}

/* Light Mode Alert Overrides */
body.gc-light-mode .alert,
body.gc-light-mode section.alert,
body.gc-light-mode div.alert,
body.gc-light-mode aside.alert {
  color: #333333 !important;
}
body.gc-light-mode .alert h1, body.gc-light-mode .alert h2, body.gc-light-mode .alert h3, body.gc-light-mode .alert h4, body.gc-light-mode .alert h5, body.gc-light-mode .alert h6,
body.gc-light-mode .alert > h1, body.gc-light-mode .alert > h2, body.gc-light-mode .alert > h3, body.gc-light-mode .alert > h4, body.gc-light-mode .alert > h5, body.gc-light-mode .alert > h6 {
  color: #000000 !important;
}
body.gc-light-mode .alert p, body.gc-light-mode .alert li, body.gc-light-mode .alert span, body.gc-light-mode .alert div {
  color: #333333 !important;
}
body.gc-light-mode .alert a, body.gc-light-mode .alert .alert-link {
  color: #284162 !important;
}

.panel {
  margin-bottom: 23px !important;
  background-color: #1e2430 !important;
  border: 1px solid #334155 !important;
  border-radius: 4px !important;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2) !important;
}
body.gc-light-mode .panel {
  background-color: #ffffff !important;
  border: 1px solid #dddddd !important;
  box-shadow: 0 1px 1px rgba(0,0,0,.05) !important;
}

.panel-heading {
  padding: 10px 15px !important;
  border-bottom: 1px solid #334155 !important;
  border-top-right-radius: 3px !important;
  border-top-left-radius: 3px !important;
  background-color: #161a22 !important;
  color: #ffffff !important;
}
body.gc-light-mode .panel-heading {
  background-color: #f5f5f5 !important;
  border-bottom-color: #dddddd !important;
  color: #333333 !important;
}

.panel-title {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  font-size: 18px !important;
  font-weight: 700 !important;
  color: inherit !important;
}

.panel-body {
  padding: 15px !important;
  color: var(--gc-text) !important;
}

.panel-footer {
  padding: 10px 15px !important;
  background-color: #161a22 !important;
  border-top: 1px solid #334155 !important;
  border-bottom-right-radius: 3px !important;
  border-bottom-left-radius: 3px !important;
  color: #94a3b8 !important;
}
body.gc-light-mode .panel-footer {
  background-color: #f5f5f5 !important;
  border-top-color: #dddddd !important;
  color: #555555 !important;
}

.panel-primary { border-color: #26374a !important; }
.panel-primary > .panel-heading { background-color: #26374a !important; color: #ffffff !important; border-color: #26374a !important; }

.panel-info { border-color: #269abc !important; }
.panel-info > .panel-heading { background-color: rgba(0, 180, 216, 0.2) !important; color: #38bdf8 !important; border-color: #269abc !important; }

.panel-warning { border-color: #ee7100 !important; }
.panel-warning > .panel-heading { background-color: rgba(245, 158, 11, 0.2) !important; color: #fbbf24 !important; border-color: #ee7100 !important; }

.panel-danger { border-color: #d3080c !important; }
.panel-danger > .panel-heading { background-color: rgba(239, 68, 68, 0.2) !important; color: #f87171 !important; border-color: #d3080c !important; }

.panel-success { border-color: #278400 !important; }
.panel-success > .panel-heading { background-color: rgba(34, 197, 94, 0.2) !important; color: #4ade80 !important; border-color: #278400 !important; }

.well {
  min-height: 20px !important;
  padding: 19px !important;
  margin-bottom: 20px !important;
  background-color: #1e2430 !important;
  border: 1px solid #334155 !important;
  border-radius: 4px !important;
  box-shadow: inset 0 1px 1px rgba(0,0,0,.05) !important;
  color: var(--gc-text) !important;
}
body.gc-light-mode .well {
  background-color: #f5f5f5 !important;
  border: 1px solid #e3e3e3 !important;
  color: #333333 !important;
}
.well-sm { padding: 9px !important; border-radius: 3px !important; }
.well-lg { padding: 24px !important; border-radius: 6px !important; }
.well-header { border-left: 6px solid #26374a !important; }

table, .table {
  width: 100% !important;
  max-width: 100% !important;
  margin-bottom: 23px !important;
  border-collapse: collapse !important;
  border-color: #334155 !important;
  color: var(--gc-text) !important;
}
body.gc-light-mode table, body.gc-light-mode .table {
  border-color: #dddddd !important;
}

th, td, .table th, .table td {
  padding: 8px 12px !important;
  line-height: 1.45 !important;
  vertical-align: top !important;
  border-top: 1px solid #334155 !important;
}
body.gc-light-mode th, body.gc-light-mode td, body.gc-light-mode .table th, body.gc-light-mode .table td {
  border-top: 1px solid #dddddd !important;
}

th, .table th {
  vertical-align: bottom !important;
  border-bottom: 2px solid #475569 !important;
  font-weight: 700 !important;
  background-color: #1a202c !important;
  color: #ffffff !important;
}
body.gc-light-mode th, body.gc-light-mode .table th {
  border-bottom: 2px solid #dddddd !important;
  background-color: #f5f5f5 !important;
  color: #333333 !important;
}

.table-striped tbody tr:nth-of-type(odd) {
  background-color: rgba(255, 255, 255, 0.03) !important;
}
body.gc-light-mode .table-striped tbody tr:nth-of-type(odd) {
  background-color: #f9f9f9 !important;
}

.table-bordered, .table-bordered th, .table-bordered td {
  border: 1px solid #334155 !important;
}
body.gc-light-mode .table-bordered, body.gc-light-mode .table-bordered th, body.gc-light-mode .table-bordered td {
  border: 1px solid #dddddd !important;
}

.table-hover tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.06) !important;
}
body.gc-light-mode .table-hover tbody tr:hover {
  background-color: #f5f5f5 !important;
}

.btn {
  display: inline-block !important;
  margin-bottom: 0 !important;
  font-weight: 700 !important;
  text-align: center !important;
  vertical-align: middle !important;
  cursor: pointer !important;
  border: 1px solid transparent !important;
  white-space: nowrap !important;
  padding: 6px 14px !important;
  font-size: 16px !important;
  line-height: 1.45 !important;
  border-radius: 4px !important;
  text-decoration: none !important;
  transition: all 0.15s ease-in-out !important;
}

.btn-default {
  color: #f1f5f9 !important;
  background-color: #334155 !important;
  border-color: #475569 !important;
}
body.gc-light-mode .btn-default {
  color: #333333 !important;
  background-color: #eaebed !important;
  border-color: #dcdee1 !important;
}

.btn-primary {
  color: #ffffff !important;
  background-color: #26374a !important;
  border-color: #26374a !important;
}

.btn-call-to-action, .btn-success {
  color: #ffffff !important;
  background-color: #318000 !important;
  border-color: #318000 !important;
}

.btn-info {
  color: #ffffff !important;
  background-color: #269abc !important;
  border-color: #269abc !important;
}

.btn-warning {
  color: #ffffff !important;
  background-color: #ee7100 !important;
  border-color: #ee7100 !important;
}

.btn-danger {
  color: #ffffff !important;
  background-color: #d3080c !important;
  border-color: #d3080c !important;
}

.label {
  display: inline !important;
  padding: .2em .6em .3em !important;
  font-size: 75% !important;
  font-weight: 700 !important;
  line-height: 1 !important;
  color: #ffffff !important;
  text-align: center !important;
  white-space: nowrap !important;
  vertical-align: baseline !important;
  border-radius: .25em !important;
}
.label-default { background-color: #64748b !important; }
.label-primary { background-color: #26374a !important; }
.label-success { background-color: #278400 !important; }
.label-info { background-color: #269abc !important; }
.label-warning { background-color: #ee7100 !important; }
.label-danger { background-color: #d3080c !important; }

.badge {
  display: inline-block !important;
  min-width: 10px !important;
  padding: 3px 8px !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
  color: #ffffff !important;
  text-align: center !important;
  white-space: nowrap !important;
  vertical-align: middle !important;
  background-color: #64748b !important;
  border-radius: 10px !important;
}

blockquote {
  padding: 10px 20px !important;
  margin: 0 0 20px !important;
  font-size: 17.5px !important;
  border-left: 5px solid #6366f1 !important;
  background: rgba(99, 102, 241, 0.08) !important;
  color: var(--gc-text) !important;
  font-style: italic !important;
}
body.gc-light-mode blockquote {
  border-left: 5px solid #eeeeee !important;
  background: #f9f9f9 !important;
}

code, kbd, pre, samp {
  font-family: Menlo, Monaco, Consolas, "Courier New", monospace !important;
  background-color: rgba(255, 255, 255, 0.08) !important;
  color: #38bdf8 !important;
  border-radius: 3px !important;
}
body.gc-light-mode code, body.gc-light-mode kbd, body.gc-light-mode samp {
  background-color: #f5f5f5 !important;
  color: #c7254e !important;
}
code { padding: 2px 5px !important; }
pre { padding: 12px !important; margin-bottom: 15px !important; overflow-x: auto !important; }

details {
  border: 1px solid #334155 !important;
  background-color: rgba(255, 255, 255, 0.03) !important;
  border-radius: 4px !important;
  padding: 10px 14px !important;
  margin-bottom: 15px !important;
}
body.gc-light-mode details {
  border: 1px solid #cccccc !important;
  background-color: #ffffff !important;
}
summary {
  font-weight: 700 !important;
  color: var(--gc-link) !important;
  cursor: pointer !important;
  outline: none !important;
}
summary:hover {
  text-decoration: underline !important;
}

.mrgn-tp-0 { margin-top: 0 !important; }
.mrgn-tp-sm { margin-top: 5px !important; }
.mrgn-tp-md { margin-top: 15px !important; }
.mrgn-tp-lg { margin-top: 30px !important; }
.mrgn-tp-xl { margin-top: 50px !important; }
.mrgn-bttm-0 { margin-bottom: 0 !important; }
.mrgn-bttm-sm { margin-bottom: 5px !important; }
.mrgn-bttm-md { margin-bottom: 15px !important; }
.mrgn-bttm-lg { margin-bottom: 30px !important; }
.mrgn-bttm-xl { margin-bottom: 50px !important; }
.mrgn-lft-0 { margin-left: 0 !important; }
.mrgn-rght-0 { margin-right: 0 !important; }

.pagedetails {
  font-size: 14px !important;
  color: var(--gc-text-muted) !important;
  margin-top: 30px !important;
  border-top: 1px solid var(--gc-border) !important;
  padding-top: 10px !important;
}
.gc-subway {
  border-left: 4px solid #26374a !important;
  padding-left: 15px !important;
  margin-bottom: 20px !important;
}

[data-swap-index] {
  transition: opacity .2s ease, filter .2s ease, outline .15s ease;
  position: relative;
}

.gc-swap-editable:hover {
  cursor: text;
}
.gc-swap-editable:focus {
  outline: 2px solid #8b5cf6 !important;
  background: transparent !important;
}

.gc-swap-active {
  outline: 2px solid #8b5cf6 !important;
  outline-offset: 3px;
  background: transparent !important;
}

body.mode-focus [data-swap-index] {
  opacity: .3;
}
body.mode-focus .gc-swap-active {
  opacity: 1 !important;
}

body.mode-blur [data-swap-index] {
  filter: blur(3px);
}
body.mode-blur .gc-swap-active {
  filter: none !important;
}

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: #191919; }
::-webkit-scrollbar-thumb { background: #6258d9; border-radius: 8px; border: 2px solid #191919; }
::-webkit-scrollbar-thumb:hover { background: #8278ee; }
* { scrollbar-width: thin; scrollbar-color: #6258d9 #191919; }
`;

// App State
const state = {
  theme: 'light',
  enHtml: '',
  enBlocks: [],
  enParsed: null,
  frDocxName: '',
  frBlocks: [],
  alignRows: [],
  alignPairs: [],
  issueGroups: { mismatch: [], missing: [], extra: [], links: [] },
  activeCategory: 'mismatch',
  drawerOpen: false,
  activePreviewBlock: 0,
  syncOffset: 0,
  autoSync: true,
  syncPaused: false,
  focusMode: false,
  blurMode: false,
  outputHtml: '',
  outputTab: 'preview', // 'preview' | 'code'
  frViewMode: 'visual', // 'visual' | 'code'
};

// DOM Element References
const themeToggle = document.getElementById('themeToggle');
const themeThumbIcon = document.getElementById('themeThumbIcon');
const htmlInput = document.getElementById('htmlInput');
const clearHtmlBtn = document.getElementById('clearHtmlBtn');
const parseHtmlBtn = document.getElementById('parseHtmlBtn');
const loadSampleEnBtn = document.getElementById('loadSampleEnBtn');
const htmlStat = document.getElementById('htmlStat');

const dropzone = document.getElementById('dropzone');
const dropzoneMain = document.getElementById('dropzoneMain');
const docxFile = document.getElementById('docxFile');
const docxStatWrap = document.getElementById('docxStatWrap');
const loadSampleFrBtn = document.getElementById('loadSampleFrBtn');

const appHeader = document.getElementById('appHeader');
const navSourcesCondensed = document.getElementById('navSourcesCondensed');
const sourceUploadSection = document.getElementById('sourceUploadSection');
const sourceCondensedBar = document.getElementById('sourceCondensedBar');
const condensedEnStat = document.getElementById('condensedEnStat');
const condensedFrStat = document.getElementById('condensedFrStat');
const expandSourcesBtn = document.getElementById('expandSourcesBtn');
const collapseSourcesBtn = document.getElementById('collapseSourcesBtn');

const alignBtn = document.getElementById('alignBtn');
const previewSection = document.getElementById('previewSection');
const toggleFocusMode = document.getElementById('toggleFocusMode');
const toggleBlurMode = document.getElementById('toggleBlurMode');
const openControlsModalBtn = document.getElementById('openControlsModalBtn');
const closeControlsModalBtn = document.getElementById('closeControlsModalBtn');
const dismissControlsModalBtn = document.getElementById('dismissControlsModalBtn');
const controlsModal = document.getElementById('controlsModal');
const toggleAutoSync = document.getElementById('toggleAutoSync');
const rightBack = document.getElementById('rightBack');
const rightForward = document.getElementById('rightForward');
const resetSyncOffset = document.getElementById('resetSyncOffset');

const enBlockCountBadge = document.getElementById('enBlockCountBadge');
const frBlockCountBadge = document.getElementById('frBlockCountBadge');
const enSyncStatus = document.getElementById('enSyncStatus');
const frSyncStatus = document.getElementById('frSyncStatus');
const enPreviewFrame = document.getElementById('enPreviewFrame');
const frPreviewFrame = document.getElementById('frPreviewFrame');

// French Pane View Toggle & Code View Elements
const frPaneTitle = document.getElementById('frPaneTitle');
const frViewVisualBtn = document.getElementById('frViewVisualBtn');
const frViewCodeBtn = document.getElementById('frViewCodeBtn');
const frCodeWrap = document.getElementById('frCodeWrap');
const frCodeEditor = document.getElementById('frCodeEditor');
const frCodeStats = document.getElementById('frCodeStats');
const copyFrCodeBtn = document.getElementById('copyFrCodeBtn');
const formatFrCodeBtn = document.getElementById('formatFrCodeBtn');

const statDetailPanel = document.getElementById('statDetailPanel');
const drawerBody = document.getElementById('drawerBody');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');

const healthPill = document.getElementById('healthPill');
const healthPillText = document.getElementById('healthPillText');
const cEn = document.getElementById('cEn');
const cFr = document.getElementById('cFr');
const cMismatch = document.getElementById('cMismatch');
const cMissing = document.getElementById('cMissing');
const cExtra = document.getElementById('cExtra');
const cSkip = document.getElementById('cSkip');

const activeBlockHudText = document.getElementById('activeBlockHudText');
const activeBlockHudTag = document.getElementById('activeBlockHudTag');
const blockJumpToggleBtn = document.getElementById('blockJumpToggleBtn');
const prevBlockBtn = document.getElementById('prevBlockBtn');
const nextBlockBtn = document.getElementById('nextBlockBtn');
const jumpForm = document.getElementById('jumpForm');
const jumpInput = document.getElementById('jumpInput');
const syncOffsetBadge = document.getElementById('syncOffsetBadge');

const downloadFrCodeBtn = document.getElementById('downloadFrCodeBtn');
const toast = document.getElementById('toast');

// Toast helper
let toastTimer = null;
function showToast(msg, duration = 3000) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// Theme Management
function initTheme() {
  const saved = localStorage.getItem('symmetra-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  state.theme = saved ? saved : prefersDark ? 'dark' : 'light';
  applyTheme(state.theme);
}

function applyTheme(theme) {
  state.theme = theme;
  localStorage.setItem('symmetra-theme', theme);
  const isDark = theme === 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  
  if (themeToggle) {
    themeToggle.classList.toggle('is-dark', isDark);
    themeToggle.classList.toggle('is-light', !isDark);
    themeToggle.setAttribute('aria-checked', isDark ? 'true' : 'false');
    themeToggle.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  if (themeThumbIcon) {
    if (isDark) {
      themeThumbIcon.innerHTML = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>';
      themeThumbIcon.setAttribute('class', 'w-3 h-3 text-purple-400');
    } else {
      themeThumbIcon.innerHTML = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>';
      themeThumbIcon.setAttribute('class', 'w-3 h-3 text-amber-500');
    }
  }

  // Update preview iframes theme
  updateIframesTheme();
}

function updateIframesTheme() {
  [enPreviewFrame, frPreviewFrame].forEach((frame) => {
    if (frame && frame.contentDocument && frame.contentDocument.body) {
      if (state.theme === 'light') {
        frame.contentDocument.body.classList.add('gc-light-mode');
      } else {
        frame.contentDocument.body.classList.remove('gc-light-mode');
      }
    }
  });
}

// English HTML Input handlers
function updateHtmlState() {
  const val = htmlInput.value.trim();
  state.enHtml = val;
  clearHtmlBtn.disabled = !val;
  parseHtmlBtn.disabled = !val;
  checkAlignReady();
}

function analyzeEnglishHtml() {
  const val = htmlInput.value.trim();
  if (!val) {
    htmlStat.textContent = '';
    state.enBlocks = [];
    state.enParsed = null;
    checkAlignReady();
    return;
  }

  const res = parseEnHtml(val);
  if (!res.ok) {
    htmlStat.innerHTML = `<span class="text-rose-500 font-semibold">${res.msg}</span>`;
    state.enBlocks = [];
    state.enParsed = null;
  } else {
    state.enBlocks = res.blocks;
    state.enParsed = res;
    htmlStat.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400 font-semibold">${res.count} text block(s) found</span>`;
  }
  if (condensedEnStat) {
    condensedEnStat.textContent = `${state.enBlocks.length} block(s)`;
  }
  checkAlignReady();
}

// French Word Document parsing
function parseFrDocxHtml(rawDocxHtml, filename = 'Uploaded Document.docx') {
  const parser = new DOMParser();
  const doc = parser.parseFromString('<html><body></body></html>', 'text/html');
  doc.body.innerHTML = rawDocxHtml;

  // Format any links inside the French Word document DOM to root-relative
  doc.body.querySelectorAll('a[href]').forEach((a) => {
    const rawHref = a.getAttribute('href');
    if (rawHref) {
      a.setAttribute('href', formatFrenchRootRelativeLink(rawHref));
    }
  });

  const blocks = extractBlocks(doc.body);

  state.frDocxName = filename;
  state.frBlocks = blocks;

  renderDocxStat(blocks.length, filename);
  checkAlignReady();
}

function renderDocxStat(count, filename) {
  if (!count) {
    docxStatWrap.innerHTML = `
      <div class="filestat err">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" x2="12" y2="12"/><line x1="12" x2="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>No headings, paragraphs, or lists detected in ${filename}</span>
        <button type="button" class="clr" id="clearDocxBtn">✕</button>
      </div>`;
  } else {
    docxStatWrap.innerHTML = `
      <div class="filestat">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
        <span>${filename} — ${count} block(s) detected</span>
        <button type="button" class="clr" id="clearDocxBtn" title="Clear uploaded document">✕</button>
      </div>`;
  }

  if (condensedFrStat) {
    if (!count) {
      condensedFrStat.textContent = '0 blocks';
    } else {
      condensedFrStat.textContent = `${filename} (${count} block(s))`;
    }
  }

  const clr = document.getElementById('clearDocxBtn');
  if (clr) {
    clr.addEventListener('click', () => {
      state.frBlocks = [];
      state.frDocxName = '';
      docxStatWrap.innerHTML = '';
      if (docxFile) docxFile.value = '';
      if (condensedFrStat) condensedFrStat.textContent = '0 blocks';
      checkAlignReady();
    });
  }
}

async function handleDocxFile(file) {
  if (!file) return;
  dropzoneMain.textContent = `Reading ${file.name}...`;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    dropzoneMain.textContent = 'Drop .docx here or click to browse';
    parseFrDocxHtml(result.value, file.name);
    showToast(`Loaded ${file.name}`);
  } catch (err) {
    console.error('Error parsing docx:', err);
    dropzoneMain.textContent = 'Drop .docx here or click to browse';
    docxStatWrap.innerHTML = `
      <div class="filestat err">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" x2="12" y2="12"/><line x1="12" x2="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Failed to read Word document. Ensure it is a valid .docx file.</span>
      </div>`;
    showToast('Failed to read .docx file', 4000);
  }
}

function checkAlignReady() {
  const ready = state.enBlocks.length > 0 && state.frBlocks.length > 0;
  alignBtn.disabled = !ready;
}

function condenseSources() {
  if (!sourceUploadSection) return;
  state.sourcesCondensed = true;
  if (condensedEnStat) {
    condensedEnStat.textContent = `${state.enBlocks.length} block(s)`;
  }
  if (condensedFrStat) {
    const docName = state.frDocxName || 'Uploaded .docx';
    condensedFrStat.textContent = `${docName} (${state.frBlocks.length} block(s))`;
    condensedFrStat.setAttribute('title', docName);
  }
  sourceUploadSection.classList.add('is-condensed');
  if (appHeader) {
    appHeader.classList.add('has-condensed-sources');
  }
  if (navSourcesCondensed) {
    navSourcesCondensed.classList.add('is-visible');
  }
  if (collapseSourcesBtn) {
    collapseSourcesBtn.style.display = 'inline-flex';
  }
}

function expandSources() {
  if (!sourceUploadSection) return;
  state.sourcesCondensed = false;
  sourceUploadSection.classList.remove('is-condensed');
  if (appHeader) {
    appHeader.classList.remove('has-condensed-sources');
  }
  if (navSourcesCondensed) {
    navSourcesCondensed.classList.remove('is-visible');
  }
  sourceUploadSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Alignment and Dual Pane Rendering
function computeAlignment() {
  const enTags = state.enBlocks.map((b) => b.tag);
  const frTags = state.frBlocks.map((b) => b.tag);
  const rows = alignByTag(enTags, frTags);
  const pairs = rows.filter((r) => r.enIndex !== null && r.frIndex !== null && !r.skip);
  const issues = computeIssues(rows, state.enBlocks, state.frBlocks, []);

  state.alignRows = rows;
  state.alignPairs = pairs;
  state.issueGroups = issues;
  state.activePreviewBlock = 0;
  state.lastKnownEnIndex = 0;
  state.syncOffset = 0;

  renderStatsBar();
  buildDualIframePreviews();
  updateSyncOffsetBadge();
  updateSyncStatusLabel();

  // Condense the source HTML & Word Document upload panels
  condenseSources();

  previewSection.classList.add('show');

  setTimeout(() => {
    applyActiveHighlight();
    alignPreviewBlocks(0);
    updateActiveBlockHud(0);
  }, 120);
}

function buildDualIframePreviews() {
  // Update block badges if present
  if (enBlockCountBadge) enBlockCountBadge.textContent = `${state.enBlocks.length} blocks`;
  if (frBlockCountBadge) frBlockCountBadge.textContent = `${state.frBlocks.length} blocks`;

  // English Frame Document
  const enDocHtml = buildFrameSource(state.enHtml, state.enBlocks, 'en');
  // French Frame Document (Cloned from English structure so alert boxes, panels, and layouts match 1:1)
  const frDocHtml = buildFrenchFrameSource(state.enHtml, state.enBlocks, state.frBlocks, state.alignPairs);

  enPreviewFrame.srcdoc = enDocHtml;
  frPreviewFrame.srcdoc = frDocHtml;

  setupIframeEventListeners();
}

function buildFrameSource(rawHtml, blocks, lang) {
  const parser = new DOMParser();
  let doc;
  const hasHtmlTag = /<html[\s>]/i.test(rawHtml);

  if (hasHtmlTag) {
    doc = parser.parseFromString(rawHtml, 'text/html');
  } else {
    doc = parser.parseFromString('<html><head></head><body></body></html>', 'text/html');
    doc.body.innerHTML = rawHtml;
  }

  // Tag DOM nodes with data-swap-index and editable attributes
  const domBlocks = extractBlocks(doc.body);
  domBlocks.forEach((b, idx) => {
    b.el.setAttribute('data-swap-index', String(idx));
    if (lang === 'fr') {
      b.el.setAttribute('contenteditable', 'true');
      b.el.classList.add('gc-swap-editable');
    }
  });

  const isLight = state.theme === 'light';
  const bodyClass = isLight ? 'gc-light-mode' : '';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${HIGHLIGHT_CSS}</style>
</head>
<body class="${bodyClass}">
  ${doc.body.innerHTML}
  <script>
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-swap-index]');
      if (target) {
        const idx = parseInt(target.getAttribute('data-swap-index'), 10);
        if (!isNaN(idx)) {
          window.parent.postMessage({ type: 'symmetra-jump', side: '${lang}', index: idx }, '*');
        }
      }
    });

    document.addEventListener('input', (e) => {
      const target = e.target.closest('[data-swap-index]');
      if (target && '${lang}' === 'fr') {
        const idx = parseInt(target.getAttribute('data-swap-index'), 10);
        if (!isNaN(idx)) {
          window.parent.postMessage({ type: 'frEdit', index: idx, text: target.innerText }, '*');
        }
      }
    });
  </script>
</body>
</html>`;
}

function buildFrenchFrameSource(rawEnHtml, enBlocks, frBlocks, alignPairs) {
  if (!rawEnHtml) {
    const frInnerHtml = frBlocks
      .map((b) => `<${b.tag}>${b.text}</${b.tag}>`)
      .join('\n');
    return buildFrameSource(frInnerHtml, frBlocks, 'fr');
  }

  const parser = new DOMParser();
  let doc;
  const hasHtmlTag = /<html[\s>]/i.test(rawEnHtml);

  if (hasHtmlTag) {
    doc = parser.parseFromString(rawEnHtml, 'text/html');
  } else {
    doc = parser.parseFromString('<html><head></head><body></body></html>', 'text/html');
    doc.body.innerHTML = rawEnHtml;
  }

  if (doc.documentElement) {
    doc.documentElement.setAttribute('lang', 'fr');
  }

  const domBlocks = extractBlocks(doc.body);

  domBlocks.forEach((enBlock, enIdx) => {
    const pair = alignPairs ? alignPairs.find((p) => p.enIndex === enIdx && !p.skip) : null;
    if (pair && pair.frIndex !== null && frBlocks[pair.frIndex]) {
      const frBlock = frBlocks[pair.frIndex];
      replaceBlockTextPreservingLinks(enBlock.el, frBlock.text, enBlock.attrTarget, frBlock.spans);
      enBlock.el.setAttribute('data-swap-index', String(enIdx));
      enBlock.el.setAttribute('data-fr-index', String(pair.frIndex));
      enBlock.el.setAttribute('data-en-index', String(enIdx));
      enBlock.el.setAttribute('contenteditable', 'true');
      enBlock.el.classList.add('gc-swap-editable');
    } else {
      enBlock.el.setAttribute('data-swap-index', String(enIdx));
      enBlock.el.setAttribute('data-en-index', String(enIdx));
      enBlock.el.setAttribute('contenteditable', 'true');
      enBlock.el.classList.add('gc-swap-editable', 'gc-swap-missing');
    }
  });

  // Ensure all links on the French side are formatted as root-relative
  doc.body.querySelectorAll('a[href]').forEach((a) => {
    const rawHref = a.getAttribute('href');
    if (rawHref && !isFragmentHref(rawHref)) {
      a.setAttribute('href', formatFrenchRootRelativeLink(rawHref));
    }
  });

  // NOTE: Extra French block warning section removed here to rely entirely on the Issues Panel.

  const isLight = state.theme === 'light';
  const bodyClass = isLight ? 'gc-light-mode' : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${HIGHLIGHT_CSS}</style>
</head>
<body class="${bodyClass}">
  ${doc.body.innerHTML}
  <script>
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-swap-index]');
      if (target) {
        const rawIdx = target.getAttribute('data-swap-index');
        const idx = parseInt(rawIdx, 10);
        if (!isNaN(idx)) {
          window.parent.postMessage({ type: 'symmetra-jump', side: 'fr', index: idx }, '*');
        }
      }
    });

    document.addEventListener('input', (e) => {
      const target = e.target.closest('[data-swap-index]');
      if (target) {
        const enIdx = parseInt(target.getAttribute('data-en-index') || target.getAttribute('data-swap-index'), 10);
        const frIdx = target.hasAttribute('data-fr-index') ? parseInt(target.getAttribute('data-fr-index'), 10) : null;
        if (!isNaN(enIdx)) {
          window.parent.postMessage({ type: 'frEdit', enIndex: enIdx, frIndex: frIdx, text: target.innerText }, '*');
        }
      }
    });
  </script>
</body>
</html>`;
}

// Tracks which scroll containers are currently being driven by our own
// code (as opposed to real user input). Keyed per-element rather than a
// single global flag, so a write to one frame never blocks processing
// of genuine scroll events on the other frame.
const programmaticScrollEls = new Set();

function getSyncItems(frame) {
  try {
    const doc = frame.contentDocument || frame.contentWindow.document;
    if (!doc) return [];
    const scrollEl = doc.scrollingElement || doc.documentElement;
    return Array.from(doc.querySelectorAll('[data-swap-index]'))
      .map((el) => ({
        index: parseInt(el.getAttribute('data-swap-index'), 10),
        el,
      }))
      .filter((o) => Number.isFinite(o.index))
      .map((o) => ({
        index: o.index,
        el: o.el,
        top: o.el.getBoundingClientRect().top + scrollEl.scrollTop,
        height: o.el.getBoundingClientRect().height,
      }))
      .sort((a, b) => a.top - b.top);
  } catch (_) {
    return [];
  }
}

function highlightIndexInFrame(frame, index) {
  try {
    const doc = frame.contentDocument || frame.contentWindow.document;
    if (!doc) return;
    doc.querySelectorAll('.gc-swap-active').forEach((el) => el.classList.remove('gc-swap-active'));
    if (index === null || index === undefined || !Number.isFinite(index)) return;
    const items = getSyncItems(frame);
    if (!items.length) return;
    let target = items.find((it) => it.index === index);
    if (!target) {
      target = items.reduce((best, it) =>
        Math.abs(it.index - index) < Math.abs(best.index - index) ? it : best, items[0]);
    }
    if (target && target.el) {
      target.el.classList.add('gc-swap-active');
    }
  } catch (_) {}
}

function applyActiveHighlight() {
  highlightIndexInFrame(enPreviewFrame, state.activePreviewBlock);
  if (state.autoSync && !state.syncPaused) {
    highlightIndexInFrame(frPreviewFrame, state.activePreviewBlock + state.syncOffset);
  }
}

function findTopIndexForFrame(frame) {
  try {
    const doc = frame.contentDocument || frame.contentWindow.document;
    if (!doc) return null;
    const scrollEl = doc.scrollingElement || doc.documentElement;
    const items = getSyncItems(frame);
    if (!items.length) return null;

    const maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    // Force top/bottom element only at the true edges of scroll
    if (scrollEl.scrollTop <= 4) return items[0].index;
    if (maxScroll > 0 && scrollEl.scrollTop >= maxScroll - 4) return items[items.length - 1].index;

    // Walk down the sorted items and keep the last one whose top has
    // already crossed the reading line. This is monotonic with scrollTop,
    // so short blocks (e.g. a lone heading) can never be stepped over.
    // The line sits at the vertical center of the viewport so the active
    // block stays the one visually in the middle of the screen.
    const topThreshold = scrollEl.scrollTop + scrollEl.clientHeight / 2;
    let candidate = items[0];
    for (const item of items) {
      if (item.top <= topThreshold) {
        candidate = item;
      } else {
        break;
      }
    }
    return candidate.index;
  } catch (_) {
    return null;
  }
}

function scrollFrameToIndex(frame, index) {
  try {
    const doc = frame.contentDocument || frame.contentWindow.document;
    if (!doc) return;
    const scrollEl = doc.scrollingElement || doc.documentElement;
    cancelSmoothFollowScroll(scrollEl); // don't fight an in-flight follow-scroll ease
    const items = getSyncItems(frame);
    if (!items.length) return;
    let target = items.find((it) => it.index === index);
    if (!target) {
      target = items.reduce((best, it) =>
        Math.abs(it.index - index) < Math.abs(best.index - index) ? it : best, items[0]);
    }
    if (!target) return;
    const max = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
    if (items.indexOf(target) === 0 && index <= items[0].index) {
      scrollEl.scrollTop = 0;
      return;
    }
    if (items.indexOf(target) === items.length - 1 && index >= items[items.length - 1].index) {
      scrollEl.scrollTop = max;
      return;
    }
    const destination = target.top + target.height / 2 - scrollEl.clientHeight / 2;
    scrollEl.scrollTop = Math.max(0, Math.min(destination, max));
  } catch (_) {}
}

function stepFrameBlock(frame, stepCount) {
  try {
    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) return;
    const scrollEl = doc.scrollingElement || doc.documentElement;
    if (!scrollEl) return;

    cancelSmoothFollowScroll(scrollEl);

    const items = getSyncItems(frame);
    if (!items.length) return;

    const currentIdx = findTopIndexForFrame(frame);
    let itemPos = items.findIndex((it) => it.index === currentIdx);
    if (itemPos === -1) {
      itemPos = stepCount > 0 ? 0 : items.length - 1;
    }

    let nextPos = itemPos + stepCount;
    nextPos = Math.max(0, Math.min(nextPos, items.length - 1));

    const nextTarget = items[nextPos];
    if (!nextTarget) return;

    scrollFrameToIndex(frame, nextTarget.index);
    highlightIndexInFrame(frame, nextTarget.index);

    if (frame === enPreviewFrame) {
      state.activePreviewBlock = nextTarget.index;
      updateActiveBlockHud(nextTarget.index);
    }
  } catch (_) {}
}

function alignPreviewBlocks(index) {
  if (!enPreviewFrame || !frPreviewFrame) return;

  let enScroll = null;
  let frScroll = null;
  try {
    const enDoc = enPreviewFrame.contentDocument || enPreviewFrame.contentWindow.document;
    const frDoc = frPreviewFrame.contentDocument || frPreviewFrame.contentWindow.document;
    if (!enDoc || !frDoc) return;

    enScroll = enDoc.scrollingElement || enDoc.documentElement;
    frScroll = frDoc.scrollingElement || frDoc.documentElement;

    const frIndex = index + state.syncOffset;
    const enEl = enDoc.querySelector(`[data-swap-index="${index}"]`);
    const frEl = frDoc.querySelector(`[data-swap-index="${frIndex}"]`);

    if (!enEl && !frEl) return;

    cancelSmoothFollowScroll(enScroll); // don't fight an in-flight follow-scroll ease
    cancelSmoothFollowScroll(frScroll);
    programmaticScrollEls.add(enScroll);
    programmaticScrollEls.add(frScroll);

    if (enEl) {
      if (index === 0) {
        enScroll.scrollTop = 0;
      } else if (index === state.enBlocks.length - 1) {
        enScroll.scrollTop = Math.max(0, enScroll.scrollHeight - enScroll.clientHeight);
      } else {
        const enRect = enEl.getBoundingClientRect();
        const enTop = enRect.top + enScroll.scrollTop;
        const enMax = Math.max(0, enScroll.scrollHeight - enScroll.clientHeight);
        const enDestination = enTop + enRect.height / 2 - enScroll.clientHeight / 2;
        enScroll.scrollTop = Math.max(0, Math.min(enDestination, enMax));
      }
    }

    if (state.autoSync && !state.syncPaused) {
      if (frEl) {
        if (frIndex === 0) {
          frScroll.scrollTop = 0;
        } else if (state.frBlocks && frIndex >= state.frBlocks.length - 1) {
          frScroll.scrollTop = Math.max(0, frScroll.scrollHeight - frScroll.clientHeight);
        } else {
          const frRect = frEl.getBoundingClientRect();
          const frTop = frRect.top + frScroll.scrollTop;
          const frMax = Math.max(0, frScroll.scrollHeight - frScroll.clientHeight);
          const frDestination = frTop + frRect.height / 2 - frScroll.clientHeight / 2;
          frScroll.scrollTop = Math.max(0, Math.min(frDestination, frMax));
        }
      } else if (frDoc) {
        const frItems = getSyncItems(frPreviewFrame);
        if (frItems.length) {
          if (frIndex <= 0) {
            frScroll.scrollTop = 0;
          } else {
            const frMax = Math.max(0, frScroll.scrollHeight - frScroll.clientHeight);
            frScroll.scrollTop = frMax;
          }
        }
      }
    }

    setTimeout(() => {
      programmaticScrollEls.delete(enScroll);
      programmaticScrollEls.delete(frScroll);
    }, 80);
  } catch (_) {
    if (enScroll) programmaticScrollEls.delete(enScroll);
    if (frScroll) programmaticScrollEls.delete(frScroll);
  }
}

function jumpToBlock(enIdx) {
  if (enIdx < 0 || enIdx >= state.enBlocks.length) return;
  state.activePreviewBlock = enIdx;
  state.lastKnownEnIndex = enIdx;

  applyActiveHighlight();
  updateActiveBlockHud(enIdx);
  alignPreviewBlocks(enIdx);
}

function updateActiveBlockHud(enIdx) {
  if (!activeBlockHudText || !activeBlockHudTag) return;
  const total = state.enBlocks ? state.enBlocks.length : 0;
  const currentBlock = state.enBlocks && state.enBlocks[enIdx] ? state.enBlocks[enIdx] : null;
  const tag = currentBlock ? `<${currentBlock.tag}>` : '';
  const displayNum = total > 0 ? Math.min(Math.max(enIdx + 1, 1), total) : 0;
  activeBlockHudText.textContent = `Block ${displayNum}/${total}`;
  activeBlockHudTag.textContent = tag;
}

// Eases a scroll container toward a moving destination instead of
// snapping straight to it on every scroll event. Each call just updates
// the destination; the rAF loop (re)started here keeps chasing it, so
// bursts of scroll events during a wheel/trackpad gesture produce one
// continuous smooth motion on the target frame rather than a jump per
// event. The target's own scrollEl is marked in programmaticScrollEls
// for the whole ease so *its* scroll listener doesn't treat this as user
// input and fight back (which would otherwise cause a feedback loop) —
// this is scoped to that one element so it never blocks scroll handling
// on the other (source) frame.
const scrollAnimState = new WeakMap();

function cancelSmoothFollowScroll(scrollEl) {
  const anim = scrollAnimState.get(scrollEl);
  if (anim && anim.raf) {
    cancelAnimationFrame(anim.raf);
    anim.raf = null;
  }
  programmaticScrollEls.delete(scrollEl);
}

function smoothFollowScroll(scrollEl, destination) {
  let anim = scrollAnimState.get(scrollEl);
  if (!anim) {
    anim = { raf: null, dest: destination };
    scrollAnimState.set(scrollEl, anim);
  } else {
    anim.dest = destination;
  }
  programmaticScrollEls.add(scrollEl);
  if (anim.raf) return; // loop already running; it'll pick up the new dest next frame

  const step = () => {
    const cur = scrollEl.scrollTop;
    const diff = anim.dest - cur;
    if (Math.abs(diff) < 0.5) {
      scrollEl.scrollTop = anim.dest;
      anim.raf = null;
      // Let one more frame pass so the programmatic scroll event this
      // final write triggers gets swallowed before we release the flag.
      requestAnimationFrame(() => {
        programmaticScrollEls.delete(scrollEl);
      });
      return;
    }
    scrollEl.scrollTop = cur + diff * 0.25;
    anim.raf = requestAnimationFrame(step);
  };
  anim.raf = requestAnimationFrame(step);
}

function syncScroll(sourceFrame, targetFrame) {
  try {
    const srcDoc = sourceFrame.contentDocument || sourceFrame.contentWindow.document;
    if (!srcDoc) return;
    const srcScroll = srcDoc.scrollingElement || srcDoc.documentElement;
    if (programmaticScrollEls.has(srcScroll)) return; // this event was caused by our own code, not the user
    const srcItems = getSyncItems(sourceFrame);
    if (!srcItems.length) return;

    const maxScroll = Math.max(0, srcScroll.scrollHeight - srcScroll.clientHeight);
    const viewportCenter = srcScroll.scrollTop + srcScroll.clientHeight / 2;

    // Pick the active block by which one has crossed a reading line at
    // the vertical center of the viewport. This is monotonic in
    // scrollTop, so a short block (e.g. a lone heading between a
    // paragraph and a list) can never be jumped over between two scroll
    // events the way a nearest-center comparison can, and it keeps the
    // highlighted block centered on screen rather than pinned near the top.
    let candidate = srcItems[0];
    if (srcScroll.scrollTop <= 4) {
      candidate = srcItems[0];
    } else if (maxScroll > 0 && srcScroll.scrollTop >= maxScroll - 4) {
      candidate = srcItems[srcItems.length - 1];
    } else {
      const topThreshold = viewportCenter;
      for (const item of srcItems) {
        if (item.top <= topThreshold) {
          candidate = item;
        } else {
          break;
        }
      }
    }

    const pixelOffset = viewportCenter - candidate.top;
    const sourceIndex = candidate.index;
    const isEn = sourceFrame === enPreviewFrame;
    const enIndex = isEn ? sourceIndex : sourceIndex - state.syncOffset;

    state.lastKnownEnIndex = enIndex;
    state.activePreviewBlock = Math.max(0, Math.min(enIndex, state.enBlocks.length - 1));

    // The highlighted bar actively follows the scroll position!
    highlightIndexInFrame(sourceFrame, sourceIndex);
    updateActiveBlockHud(state.activePreviewBlock);

    // If auto-sync is enabled and not paused with Alt, synchronize the target frame too
    if (state.autoSync && !state.syncPaused) {
      const targetIndex = isEn ? sourceIndex + state.syncOffset : enIndex;
      highlightIndexInFrame(targetFrame, targetIndex);

      const targetDoc = targetFrame.contentDocument || targetFrame.contentWindow.document;
      if (!targetDoc) return;
      const targetScroll = targetDoc.scrollingElement || targetDoc.documentElement;
      const targetItems = getSyncItems(targetFrame);
      if (!targetItems.length) return;

      let targetItem = targetItems.find((it) => it.index === targetIndex);
      if (!targetItem) {
        targetItem = targetItems.reduce((best, it) =>
          Math.abs(it.index - targetIndex) < Math.abs(best.index - targetIndex) ? it : best, targetItems[0]);
      }

      const targetMax = Math.max(0, targetScroll.scrollHeight - targetScroll.clientHeight);

      let destination;
      if (srcScroll.scrollTop <= 30 && state.syncOffset === 0) {
        destination = 0;
      } else if (maxScroll > 0 && srcScroll.scrollTop >= maxScroll - 30 && state.syncOffset === 0) {
        destination = targetMax;
      } else {
        destination = Math.max(0, Math.min(targetItem.top + pixelOffset - targetScroll.clientHeight / 2, targetMax));
      }

      smoothFollowScroll(targetScroll, destination);
    }
  } catch (_) {}
}

// Wheel Navigation & Independent Scroll Handling
let wheelLock = false;
let altWheelLock = false;
let wheelResetTimer = null;
let accumulatedDeltaY = 0;
let lastHoveredFrame = null;

function handleWheelNavigation(e, sourceFrameOverride = null) {
  if (!state.enBlocks || state.enBlocks.length === 0) return;
  // If in French Code View and hovering over code editor, allow native textarea scrolling
  if (state.frViewMode === 'code' && (e.target?.closest?.('#frCodeEditor') || e.target?.id === 'frCodeEditor')) {
    return;
  }

  const rawDelta = e.deltaY;
  if (Math.abs(rawDelta) < 0.5) return;

  // Normalize delta across line and pixel deltaModes
  const delta = e.deltaMode === 1 ? rawDelta * 30 : e.deltaMode === 2 ? rawDelta * 100 : rawDelta;

  const isAlt = e.altKey || state.syncPaused || !state.autoSync;

  // When Alt is held or Auto-sync is off, allow independent scrolling for the pane under the cursor
  if (isAlt) {
    if (e.cancelable) {
      e.preventDefault();
    }

    let targetFrame = sourceFrameOverride || lastHoveredFrame;
    if (!targetFrame) {
      if (e.target && typeof e.target.closest === 'function') {
        targetFrame = (e.target.closest('#frPreviewPane') || e.target.closest('#frPreviewFrame')) ? frPreviewFrame : enPreviewFrame;
      } else {
        targetFrame = enPreviewFrame;
      }
    }

    if (targetFrame) {
      // Check if it's a discrete mouse wheel notch vs continuous smooth trackpad gesture
      const isMouseWheelNotch = e.deltaMode !== 0 || Math.abs(rawDelta) >= 40;
      if (isMouseWheelNotch) {
        if (altWheelLock) return;
        altWheelLock = true;
        const direction = delta > 0 ? 1 : -1;
        stepFrameBlock(targetFrame, direction);
        setTimeout(() => {
          altWheelLock = false;
        }, 140);
      } else {
        // Continuous smooth trackpad gesture
        const doc = targetFrame.contentDocument || targetFrame.contentWindow?.document;
        if (doc) {
          const scrollEl = doc.scrollingElement || doc.documentElement;
          if (scrollEl) {
            cancelSmoothFollowScroll(scrollEl);
            scrollEl.scrollTop += delta;
            const topIdx = findTopIndexForFrame(targetFrame);
            if (topIdx !== null) {
              highlightIndexInFrame(targetFrame, topIdx);
              if (targetFrame === enPreviewFrame) {
                state.activePreviewBlock = topIdx;
                updateActiveBlockHud(topIdx);
              }
            }
          }
        }
      }
    }
    return;
  }

  // Prevent browser default raw pixel jumping so blocks aren't skipped
  if (e.cancelable) {
    e.preventDefault();
  }

  accumulatedDeltaY += delta;

  if (wheelResetTimer) {
    clearTimeout(wheelResetTimer);
  }
  wheelResetTimer = setTimeout(() => {
    accumulatedDeltaY = 0;
    wheelLock = false;
  }, 180);

  if (wheelLock) return;

  // Discrete threshold: standard mouse wheel notches emit ~50-120 delta in a single event.
  // Trackpad events emit continuous smaller deltas that accumulate smoothly.
  const THRESHOLD = 20;

  if (Math.abs(accumulatedDeltaY) >= THRESHOLD || Math.abs(delta) >= THRESHOLD) {
    const direction = accumulatedDeltaY > 0 || delta > 0 ? 1 : -1;
    accumulatedDeltaY = 0;
    wheelLock = true;

    if (direction > 0) {
      if (state.activePreviewBlock < state.enBlocks.length - 1) {
        jumpToBlock(state.activePreviewBlock + 1);
      }
    } else {
      if (state.activePreviewBlock > 0) {
        jumpToBlock(state.activePreviewBlock - 1);
      }
    }

    // Cooldown prevents multiple jumps from a single flick/notch of mouse wheel
    setTimeout(() => {
      wheelLock = false;
    }, 140);
  }
}

function setupIframeEventListeners() {
  const attachListeners = (frame, targetFrame) => {
    const attachToWindow = () => {
      updateIframesTheme();
      try {
        const win = frame.contentWindow;
        if (!win) return;

        // Scroll sync (for manual drag of scrollbar)
        if (win._symmetraScrollHandler) {
          win.removeEventListener('scroll', win._symmetraScrollHandler);
        }
        win._symmetraScrollHandler = () => syncScroll(frame, targetFrame);
        win.addEventListener('scroll', win._symmetraScrollHandler, { passive: true });

        // Wheel navigation (1 notch = 1 block down/up, or independent scroll when Alt is held)
        if (win._symmetraWheelHandler) {
          win.removeEventListener('wheel', win._symmetraWheelHandler);
        }
        win._symmetraWheelHandler = (e) => handleWheelNavigation(e, frame);
        win.addEventListener('wheel', win._symmetraWheelHandler, { passive: false });

        const doc = frame.contentDocument;
        if (doc) {
          if (doc._symmetraWheelHandler) {
            doc.removeEventListener('wheel', doc._symmetraWheelHandler);
          }
          doc._symmetraWheelHandler = (e) => handleWheelNavigation(e, frame);
          doc.addEventListener('wheel', doc._symmetraWheelHandler, { passive: false });

          doc.addEventListener('mousemove', () => {
            lastHoveredFrame = frame;
          }, { passive: true });
        }

        // Keyboard navigation & Alt detection inside iframe
        if (win._symmetraKeyHandler) {
          win.removeEventListener('keydown', win._symmetraKeyHandler);
        }
        win._symmetraKeyHandler = (e) => {
          if (e.key === 'Alt') {
            state.syncPaused = true;
            updateSyncStatusLabel();
          }
          handleKeyNavigation(e);
        };
        win.addEventListener('keydown', win._symmetraKeyHandler);

        if (win._symmetraKeyUpHandler) {
          win.removeEventListener('keyup', win._symmetraKeyUpHandler);
        }
        win._symmetraKeyUpHandler = (e) => {
          if (e.key === 'Alt') {
            state.syncPaused = false;
            updateSyncStatusLabel();
          }
        };
        win.addEventListener('keyup', win._symmetraKeyUpHandler);

        win.addEventListener('blur', () => {
          state.syncPaused = false;
          updateSyncStatusLabel();
        });

        // Focus sync — keep activePreviewBlock in sync when Tabbing inside iframe
        if (win._symmetraFocusHandler) {
          win.removeEventListener('focusin', win._symmetraFocusHandler);
        }
        win._symmetraFocusHandler = (e) => {
          const target = e.target.closest('[data-swap-index]');
          if (!target) return;
          const idx = parseInt(target.getAttribute('data-swap-index'), 10);
          if (!isNaN(idx) && idx >= 0 && idx < state.enBlocks.length) {
            state.activePreviewBlock = idx;
            state.lastKnownEnIndex = idx;
            applyActiveHighlight();
            updateActiveBlockHud(idx);
          }
        };
        win.addEventListener('focusin', win._symmetraFocusHandler);
      } catch (e) {
        console.warn('Iframe attach error', e);
      }
    };

    // Remove any previous load listener so they don't accumulate
    if (frame._symmetraLoadHandler) {
      frame.removeEventListener('load', frame._symmetraLoadHandler);
    }
    frame._symmetraLoadHandler = attachToWindow;
    frame.addEventListener('load', frame._symmetraLoadHandler);
  };

  attachListeners(enPreviewFrame, frPreviewFrame);
  attachListeners(frPreviewFrame, enPreviewFrame);
}

// Global PostMessage receiver for iframe clicks and edits
window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object') return;

  if (e.data.type === 'symmetra-jump') {
    const { index } = e.data;
    if (typeof index === 'number' && !isNaN(index)) {
      jumpToBlock(index);
    }
  } else if (e.data.type === 'frEdit') {
    const { enIndex, frIndex, text } = e.data;
    if (frIndex !== null && state.frBlocks[frIndex]) {
      state.frBlocks[frIndex].text = text;
    } else if (enIndex !== null) {
      const pair = state.alignPairs.find((p) => p.enIndex === enIndex);
      if (pair && pair.frIndex !== null && state.frBlocks[pair.frIndex]) {
        state.frBlocks[pair.frIndex].text = text;
      }
    }
  }
});

function nudgeSync(delta) {
  state.syncOffset += delta;
  updateSyncOffsetBadge();
  const currentEnIndex = typeof state.activePreviewBlock === 'number' && state.activePreviewBlock >= 0
    ? state.activePreviewBlock
    : (findTopIndexForFrame(enPreviewFrame) || 0);
  state.lastKnownEnIndex = currentEnIndex;
  
  if (state.autoSync && !state.syncPaused) {
    applyActiveHighlight();
    alignPreviewBlocks(currentEnIndex);
  } else {
    stepFrameBlock(frPreviewFrame, delta);
  }
}

function updateSyncStatusLabel() {
  let text = '● synced';
  let color = '#10b981';
  if (!state.autoSync) {
    text = '○ manual';
    color = '#94a3b8';
  } else if (state.syncPaused) {
    text = '● paused (hold Alt)';
    color = '#ee7100';
  }
  if (enSyncStatus) {
    enSyncStatus.textContent = text;
    enSyncStatus.style.color = color;
  }
  if (frSyncStatus) {
    frSyncStatus.textContent = text;
    frSyncStatus.style.color = color;
  }
}

// Bottom Stats HUD and Inspector Drawer
function renderStatsBar() {
  const nEn = state.enBlocks.length;
  const nFr = state.frBlocks.length;
  const nMis = state.issueGroups.mismatch.length;
  const nMiss = state.issueGroups.missing.length;
  const nExt = state.issueGroups.extra.length;
  const nSkip = state.alignRows.filter((r) => r.skip).length;
  const nMatched = state.alignPairs.length;

  cEn.textContent = String(nEn);
  cFr.textContent = String(nFr);
  cMismatch.textContent = String(nMis);
  cMissing.textContent = String(nMiss);
  cExtra.textContent = String(nExt);
  cSkip.textContent = String(nSkip);

  // Style tabs based on issue counts
  const tabMis = document.getElementById('tabMismatch');
  const tabMiss = document.getElementById('tabMissing');
  const tabExt = document.getElementById('tabExtra');

  if (tabMis) tabMis.classList.toggle('has-issues', nMis > 0);
  if (tabMiss) tabMiss.classList.toggle('has-danger', nMiss > 0);
  if (tabExt) tabExt.classList.toggle('has-issues', nExt > 0);

  // Update Drawer Tab counters
  const dMis = document.getElementById('drawerTabMismatch');
  const dMiss = document.getElementById('drawerTabMissing');
  const dExt = document.getElementById('drawerTabExtra');
  const dEn = document.getElementById('drawerTabEnTags');
  const dFr = document.getElementById('drawerTabFrTags');
  const dSkip = document.getElementById('drawerTabSkipped');

  if (dMis) dMis.textContent = `Mismatches (${nMis})`;
  if (dMiss) dMiss.textContent = `Missing FR (${nMiss})`;
  if (dExt) dExt.textContent = `Extra FR (${nExt})`;
  if (dEn) dEn.textContent = `EN Tags (${nEn})`;
  if (dFr) dFr.textContent = `FR Tags (${nFr})`;
  if (dSkip) dSkip.textContent = `Skipped (${nSkip})`;

  // Overall Alignment Health Pill
  const hasErrors = nMiss > 0;
  const hasWarnings = nMis > 0 || nExt > 0;

  healthPill.className = 'preview-status-pill ' + (hasErrors ? 'status-danger' : hasWarnings ? 'status-warn' : 'status-clean');
  
  if (hasErrors) {
    healthPill.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-rose-500"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" x2="12" y2="12"/><line x1="12" x2="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>${nMiss} missing block(s) • ${nMatched}/${nEn} matched</span>`;
  } else if (hasWarnings) {
    healthPill.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-amber-500"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" x2="13"/><line x1="12" x2="12" y1="17" x2="12.01" y2="17"/></svg>
      <span>${nMis} style mismatch(es) • ${nMatched}/${nEn} matched</span>`;
  } else {
    healthPill.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-emerald-500"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
      <span>100% Aligned • ${nMatched} blocks matched</span>`;
  }

  updateActiveBlockHud(state.activePreviewBlock);
}

function openDrawer(category) {
  state.activeCategory = category;
  state.drawerOpen = true;
  statDetailPanel.classList.add('show');

  // Update active state on segmented tabs
  document.querySelectorAll('.preview-segment-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.getAttribute('data-category') === category);
  });

  // Update active state on drawer header tabs
  document.querySelectorAll('.drawer-tab').forEach((tab) => {
    const isActive = tab.getAttribute('data-category') === category;
    tab.className = `drawer-tab px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
      isActive ? 'bg-accent text-white shadow-sm' : 'bg-surface hover:bg-surface-hover text-text-secondary'
    }`;
  });

  renderDrawerBody(category);
}

function closeDrawer() {
  state.drawerOpen = false;
  statDetailPanel.classList.remove('show');
  document.querySelectorAll('.preview-segment-tab').forEach((tab) => {
    tab.classList.remove('is-active');
  });
}

function openControlsModal() {
  if (!controlsModal) return;
  state.controlsModalOpen = true;
  controlsModal.style.display = 'flex';
  requestAnimationFrame(() => {
    controlsModal.classList.add('is-open');
  });
}

function closeControlsModal() {
  if (!controlsModal) return;
  state.controlsModalOpen = false;
  controlsModal.classList.remove('is-open');
  setTimeout(() => {
    if (!state.controlsModalOpen) {
      controlsModal.style.display = 'none';
    }
  }, 220);
}

function renderDrawerBody(category) {
  drawerBody.innerHTML = '';

  if (category === 'en-tags' || category === 'fr-tags') {
    const blocks = category === 'en-tags' ? state.enBlocks : state.frBlocks;
    const title = category === 'en-tags' ? 'English Source HTML Tag Breakdown' : 'French Word Document Tag Breakdown';
    const counts = {};
    blocks.forEach((b) => {
      counts[b.tag] = (counts[b.tag] || 0) + 1;
    });

    let badgesHtml = Object.entries(counts)
      .map(
        ([tag, cnt]) => `
      <div class="tag-breakdown-badge">
        <span class="tag-name">&lt;${tag}&gt;</span>
        <span class="tag-count">${cnt}</span>
      </div>`
      )
      .join('');

    let listHtml = blocks
      .map(
        (b, i) => `
      <div class="issue-row issue-row-clickable" data-jump-en="${category === 'en-tags' ? i : ''}" data-jump-fr="${category === 'fr-tags' ? i : ''}">
        <div class="issue-side info">&lt;${b.tag}&gt;</div>
        <div>
          <div class="issue-title">#${i + 1} &lt;${b.tag}&gt;</div>
          <div class="issue-detail">${escapeHtml(issueSnippet(b.text, 120))}</div>
        </div>
        <div class="issue-status">${b.spans.length ? `${b.spans.length} inline span(s)` : 'plain block'}</div>
        <div>
          <button type="button" class="btn btn-secondary text-xs px-2.5 py-1">Jump →</button>
        </div>
      </div>`
      )
      .join('');

    drawerBody.innerHTML = `
      <div class="p-4 bg-surface-soft border-b border-border">
        <div class="text-xs font-semibold text-text mb-2">${title}</div>
        <div class="flex items-center gap-2 flex-wrap">${badgesHtml}</div>
      </div>
      <div>${listHtml}</div>`;
  } else if (category === 'mismatch') {
    const issues = state.issueGroups.mismatch;
    if (!issues.length) {
      drawerBody.innerHTML = `<div class="p-6 text-center text-text-secondary text-xs">No tag or style mismatches found! Perfect structural symmetry.</div>`;
    } else {
      drawerBody.innerHTML = issues
        .map(
          (iss) => `
        <div class="issue-row issue-row-clickable" data-jump-en="${iss.enIndex}">
          <div class="issue-side warn">Mismatch</div>
          <div>
            <div class="issue-title">${escapeHtml(iss.title)}</div>
            <div class="issue-detail">${escapeHtml(iss.detail)}</div>
          </div>
          <div class="issue-status">Needs style sync</div>
          <div>
            <button type="button" class="btn btn-secondary text-xs px-2.5 py-1">Jump →</button>
          </div>
        </div>`
        )
        .join('');
    }
  } else if (category === 'missing') {
    const issues = state.issueGroups.missing;
    if (!issues.length) {
      drawerBody.innerHTML = `<div class="p-6 text-center text-text-secondary text-xs">All English blocks have corresponding French translations.</div>`;
    } else {
      drawerBody.innerHTML = issues
        .map(
          (iss) => `
        <div class="issue-row issue-row-clickable" data-jump-en="${iss.enIndex}">
          <div class="issue-side danger">Missing FR</div>
          <div>
            <div class="issue-title">${escapeHtml(iss.title)}</div>
            <div class="issue-detail">${escapeHtml(iss.detail)}</div>
          </div>
          <div class="issue-status">Unmatched in docx</div>
          <div>
            <button type="button" class="btn btn-secondary text-xs px-2.5 py-1">Jump →</button>
          </div>
        </div>`
        )
        .join('');
    }
  } else if (category === 'extra') {
    const issues = state.issueGroups.extra;
    if (!issues.length) {
      drawerBody.innerHTML = `<div class="p-6 text-center text-text-secondary text-xs">No extra unaligned French paragraphs in the document.</div>`;
    } else {
      drawerBody.innerHTML = issues
        .map(
          (iss) => `
        <div class="issue-row">
          <div class="issue-side info">Extra FR</div>
          <div>
            <div class="issue-title">${escapeHtml(iss.title)}</div>
            <div class="issue-detail">${escapeHtml(iss.detail)}</div>
          </div>
          <div class="issue-status">Ignored on export</div>
          <div></div>
        </div>`
        )
        .join('');
    }
  } else if (category === 'skipped') {
    const skippedRows = state.alignRows.filter((r) => r.skip);
    if (!skippedRows.length) {
      drawerBody.innerHTML = `<div class="p-6 text-center text-text-secondary text-xs">No blocks have been skipped.</div>`;
    } else {
      drawerBody.innerHTML = skippedRows
        .map(
          (row) => `
        <div class="issue-row">
          <div class="issue-side info">Skipped</div>
          <div>
            <div class="issue-title">English block #${row.enIndex !== null ? row.enIndex + 1 : '—'}</div>
            <div class="issue-detail">This block alignment was manually excluded from export.</div>
          </div>
          <div class="issue-status">Skipped</div>
          <div></div>
        </div>`
        )
        .join('');
    }
  }

  // Attach jump click listeners inside drawer
  drawerBody.querySelectorAll('.issue-row-clickable').forEach((row) => {
    row.addEventListener('click', () => {
      const en = row.getAttribute('data-jump-en');
      const fr = row.getAttribute('data-jump-fr');
      if (en !== null && en !== '') {
        jumpToBlock(parseInt(en, 10));
      } else if (fr !== null && fr !== '') {
        const frIdx = parseInt(fr, 10);
        const match = state.alignPairs.find((p) => p.frIndex === frIdx);
        if (match && match.enIndex !== null) jumpToBlock(match.enIndex);
        else highlightBlockInFrames(null, frIdx);
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Pretty print HTML with clean indentation and inline tag closure on the same line
function formatHtmlCode(html) {
  if (!html || typeof html !== 'string') return '';
  const trimmed = html.trim();
  if (!trimmed) return '';

  const hasDocType = /^<!doctype/i.test(trimmed);
  const docTypeMatch = trimmed.match(/^<!doctype[^>]*>/i);
  const docTypeStr = docTypeMatch ? docTypeMatch[0] : '<!DOCTYPE html>';
  const hasHtmlTag = /<html[\s>]/i.test(trimmed);
  const hasHeadTag = /<head[\s>]/i.test(trimmed);

  const parser = new DOMParser();
  const doc = parser.parseFromString(trimmed, 'text/html');

  const tab = '  ';
  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  // Elements that are strictly inline
  const inlineTags = new Set([
    'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn',
    'em', 'i', 'kbd', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
    'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'
  ]);

  // Elements where content and closing tag should stay on one line (unless containing block elements)
  const singleLineBlockTags = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'dt', 'dd',
    'th', 'td', 'caption', 'label', 'legend', 'title', 'button',
    'summary', 'figcaption', 'option'
  ]);

  // Elements where whitespace must be preserved verbatim
  const preserveWhitespaceTags = new Set(['pre', 'textarea', 'script', 'style']);

  function serializeAttributes(el) {
    if (!el.attributes || el.attributes.length === 0) return '';
    let attrs = '';
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      attrs += ` ${attr.name}="${attr.value.replace(/"/g, '&quot;')}"`;
    }
    return attrs;
  }

  function hasBlockChildren(el) {
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (!inlineTags.has(tag)) return true;
      }
    }
    return false;
  }

  function formatInlineContent(el) {
    let result = '';
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE) {
        result += child.nodeValue.replace(/\s+/g, ' ');
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        const attrs = serializeAttributes(child);
        if (voidTags.has(tag)) {
          result += `<${tag}${attrs}>`;
        } else {
          result += `<${tag}${attrs}>${formatInlineContent(child)}</${tag}>`;
        }
      } else if (child.nodeType === Node.COMMENT_NODE) {
        result += `<!--${child.nodeValue}-->`;
      }
    }
    return result;
  }

  function formatNode(node, level = 0) {
    const indent = tab.repeat(level);

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue.replace(/\s+/g, ' ').trim();
      return text ? `${indent}${text}\n` : '';
    }

    if (node.nodeType === Node.COMMENT_NODE) {
      return `${indent}<!--${node.nodeValue}-->\n`;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      const attrs = serializeAttributes(node);

      if (voidTags.has(tag)) {
        return `${indent}<${tag}${attrs}>\n`;
      }

      if (preserveWhitespaceTags.has(tag)) {
        return `${indent}<${tag}${attrs}>${node.innerHTML}</${tag}>\n`;
      }

      // Check if this is a leaf/single-line tag or element with only inline/text children
      const containsBlock = hasBlockChildren(node);
      const isSingleLineCandidate = singleLineBlockTags.has(tag) || (!containsBlock && node.childNodes.length > 0);

      if (!containsBlock && isSingleLineCandidate) {
        const inlineInner = formatInlineContent(node).trim();
        if (!inlineInner) {
          return `${indent}<${tag}${attrs}></${tag}>\n`;
        }
        return `${indent}<${tag}${attrs}>${inlineInner}</${tag}>\n`;
      }

      // Container element with child elements
      let inner = '';
      for (let i = 0; i < node.childNodes.length; i++) {
        inner += formatNode(node.childNodes[i], level + 1);
      }

      if (!inner.trim()) {
        return `${indent}<${tag}${attrs}></${tag}>\n`;
      }

      return `${indent}<${tag}${attrs}>\n${inner}${indent}</${tag}>\n`;
    }

    return '';
  }

  // Determine what roots to format
  let output = '';

  if (hasDocType || hasHtmlTag) {
    if (hasDocType) {
      output += `${docTypeStr}\n`;
    }
    const htmlEl = doc.documentElement;
    const htmlAttrs = serializeAttributes(htmlEl);
    output += `<html${htmlAttrs}>\n`;

    // Head
    const headEl = doc.head;
    if (hasHeadTag || (headEl && headEl.childNodes.length > 0)) {
      const headAttrs = serializeAttributes(headEl);
      let headInner = '';
      for (let i = 0; i < headEl.childNodes.length; i++) {
        headInner += formatNode(headEl.childNodes[i], 2);
      }
      if (headInner.trim()) {
        output += `  <head${headAttrs}>\n${headInner}  </head>\n`;
      } else if (hasHeadTag) {
        output += `  <head${headAttrs}></head>\n`;
      }
    }

    // Body
    const bodyEl = doc.body;
    const bodyAttrs = serializeAttributes(bodyEl);
    let bodyInner = '';
    for (let i = 0; i < bodyEl.childNodes.length; i++) {
      bodyInner += formatNode(bodyEl.childNodes[i], 2);
    }
    if (bodyInner.trim()) {
      output += `  <body${bodyAttrs}>\n${bodyInner}  </body>\n`;
    } else {
      output += `  <body${bodyAttrs}></body>\n`;
    }

    output += `</html>`;
  } else {
    // Fragment format
    const bodyEl = doc.body;
    for (let i = 0; i < bodyEl.childNodes.length; i++) {
      output += formatNode(bodyEl.childNodes[i], 0);
    }
  }

  return output.trim();
}

// Generate localized French HTML from current state and active frame edits
function generateFrenchHtmlSource() {
  const parser = new DOMParser();
  let doc;
  const hasHtmlTag = /<html[\s>]/i.test(state.enHtml);

  if (hasHtmlTag) {
    doc = parser.parseFromString(state.enHtml, 'text/html');
  } else {
    doc = parser.parseFromString('<html><head></head><body></body></html>', 'text/html');
    doc.body.innerHTML = state.enHtml || '';
  }

  // Update lang attribute to fr
  if (doc.documentElement) {
    doc.documentElement.setAttribute('lang', 'fr');
  }

  const enDocBlocks = extractBlocks(doc.body);

  // Synchronize any live edits made in the French visual preview frame into state.frBlocks
  try {
    if (frPreviewFrame && frPreviewFrame.contentDocument) {
      const editables = frPreviewFrame.contentDocument.querySelectorAll('.gc-swap-editable');
      editables.forEach((el) => {
        const frIdx = el.hasAttribute('data-fr-index') ? parseInt(el.getAttribute('data-fr-index'), 10) : null;
        if (frIdx !== null && state.frBlocks[frIdx]) {
          state.frBlocks[frIdx].text = el.innerText.trim();
        }
      });
    }
  } catch (_) {}

  state.alignPairs.forEach((pair) => {
    if (pair.enIndex !== null && pair.frIndex !== null && !pair.skip) {
      const enTarget = enDocBlocks[pair.enIndex];
      const frBlock = state.frBlocks[pair.frIndex];
      if (enTarget && frBlock) {
        replaceBlockTextPreservingLinks(
          enTarget.el,
          frBlock.text,
          enTarget.attrTarget,
          frBlock.spans
        );
      }
    }
  });

  // Ensure all links on the French side are formatted as root-relative
  doc.body.querySelectorAll('a[href]').forEach((a) => {
    const rawHref = a.getAttribute('href');
    if (rawHref && !isFragmentHref(rawHref)) {
      a.setAttribute('href', formatFrenchRootRelativeLink(rawHref));
    }
  });

  const rawHtml = hasHtmlTag ? doc.documentElement.outerHTML : doc.body.innerHTML;
  return formatHtmlCode(rawHtml);
}

function updateFrCodeStats() {
  if (!frCodeEditor || !frCodeStats) return;
  const text = frCodeEditor.value || '';
  const lines = text ? text.split('\n').length : 0;
  const chars = text.length;
  frCodeStats.textContent = `${lines} ${lines === 1 ? 'line' : 'lines'} • ${chars} chars`;
}

function switchFrenchView(mode) {
  state.frViewMode = mode;
  const isCode = mode === 'code';

  if (frViewVisualBtn) frViewVisualBtn.classList.toggle('is-active', !isCode);
  if (frViewCodeBtn) frViewCodeBtn.classList.toggle('is-active', isCode);

  if (frPaneTitle) {
    frPaneTitle.textContent = isCode ? 'French (HTML Code View)' : 'French (aligned & editable)';
  }

  if (isCode) {
    const htmlCode = generateFrenchHtmlSource();
    if (frCodeEditor) {
      frCodeEditor.value = htmlCode;
      updateFrCodeStats();
    }
    if (frPreviewFrame) frPreviewFrame.style.display = 'none';
    if (frCodeWrap) frCodeWrap.style.display = 'flex';
  } else {
    if (frCodeWrap) frCodeWrap.style.display = 'none';
    if (frPreviewFrame) frPreviewFrame.style.display = 'block';
  }
}

// Keyboard Navigation & Shortcuts
function handleKeyNavigation(e) {
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

  const isAlt = e.altKey || state.syncPaused || !state.autoSync;

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (isAlt) {
      // Step exactly 1 block up in the active / hovered pane independently
      const targetFrame = lastHoveredFrame || (document.activeElement === frPreviewFrame ? frPreviewFrame : enPreviewFrame);
      stepFrameBlock(targetFrame, -1);
    } else {
      if (state.activePreviewBlock > 0) {
        jumpToBlock(state.activePreviewBlock - 1);
      }
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (isAlt) {
      // Step exactly 1 block down in the active / hovered pane independently
      const targetFrame = lastHoveredFrame || (document.activeElement === frPreviewFrame ? frPreviewFrame : enPreviewFrame);
      stepFrameBlock(targetFrame, 1);
    } else {
      if (state.activePreviewBlock < state.enBlocks.length - 1) {
        jumpToBlock(state.activePreviewBlock + 1);
      }
    }
  } else if (e.key === 'PageUp') {
    e.preventDefault();
    if (isAlt) {
      const targetFrame = lastHoveredFrame || (document.activeElement === frPreviewFrame ? frPreviewFrame : enPreviewFrame);
      stepFrameBlock(targetFrame, -5);
    } else {
      jumpToBlock(Math.max(0, state.activePreviewBlock - 5));
    }
  } else if (e.key === 'PageDown') {
    e.preventDefault();
    if (isAlt) {
      const targetFrame = lastHoveredFrame || (document.activeElement === frPreviewFrame ? frPreviewFrame : enPreviewFrame);
      stepFrameBlock(targetFrame, 5);
    } else {
      jumpToBlock(Math.min(state.enBlocks.length - 1, state.activePreviewBlock + 5));
    }
  } else if (e.key === '[') {
    e.preventDefault();
    nudgeSync(-1);
  } else if (e.key === ']') {
    e.preventDefault();
    nudgeSync(1);
  } else if (e.key === 'Escape') {
    if (state.controlsModalOpen) {
      closeControlsModal();
      return;
    }
    if (state.drawerOpen) {
      closeDrawer();
      return;
    }
  } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
    e.preventDefault();
    if (state.controlsModalOpen) {
      closeControlsModal();
    } else {
      openControlsModal();
    }
  }
}

function updateSyncOffsetBadge() {
  if (state.syncOffset !== 0) {
    syncOffsetBadge.style.display = 'inline-flex';
    syncOffsetBadge.textContent = `Offset: ${state.syncOffset > 0 ? '+' : ''}${state.syncOffset}`;
  } else {
    syncOffsetBadge.style.display = 'none';
  }
}

// Event Listeners Initialization
function initEventListeners() {
  // Theme Toggle Button
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }

  // HTML Source Input
  htmlInput.addEventListener('input', updateHtmlState);
  clearHtmlBtn.addEventListener('click', () => {
    htmlInput.value = '';
    htmlStat.textContent = '';
    state.enBlocks = [];
    state.enParsed = null;
    updateHtmlState();
  });
  parseHtmlBtn.addEventListener('click', analyzeEnglishHtml);
  loadSampleEnBtn.addEventListener('click', () => {
    htmlInput.value = SAMPLE_EN_HTML;
    updateHtmlState();
    analyzeEnglishHtml();
    showToast('Loaded English sample template');
  });

  // DOCX Dropzone & Upload
  loadSampleFrBtn.addEventListener('click', () => {
    parseFrDocxHtml(SAMPLE_FR_DOCX_HTML, 'sample-french-translation.docx');
    showToast('Loaded French sample translation');
  });

  dropzone.addEventListener('click', () => {
    docxFile.click();
  });

  docxFile.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleDocxFile(file);
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleDocxFile(file);
  });

  // Align & Source Condense Controls
  alignBtn.addEventListener('click', computeAlignment);

  if (expandSourcesBtn) {
    expandSourcesBtn.addEventListener('click', expandSources);
  }

  if (collapseSourcesBtn) {
    collapseSourcesBtn.addEventListener('click', condenseSources);
  }

  // View Toolbar
  toggleFocusMode.addEventListener('click', () => {
    state.focusMode = !state.focusMode;
    toggleFocusMode.classList.toggle('is-active', state.focusMode);
    [enPreviewFrame, frPreviewFrame].forEach((frame) => {
      if (frame && frame.contentDocument && frame.contentDocument.body) {
        frame.contentDocument.body.classList.toggle('mode-focus', state.focusMode);
      }
    });
  });

  toggleBlurMode.addEventListener('click', () => {
    state.blurMode = !state.blurMode;
    toggleBlurMode.classList.toggle('is-active', state.blurMode);
    [enPreviewFrame, frPreviewFrame].forEach((frame) => {
      if (frame && frame.contentDocument && frame.contentDocument.body) {
        frame.contentDocument.body.classList.toggle('mode-blur', state.blurMode);
      }
    });
  });

  // Controls & Help Modal
  if (openControlsModalBtn) {
    openControlsModalBtn.addEventListener('click', openControlsModal);
  }
  if (closeControlsModalBtn) {
    closeControlsModalBtn.addEventListener('click', closeControlsModal);
  }
  if (dismissControlsModalBtn) {
    dismissControlsModalBtn.addEventListener('click', closeControlsModal);
  }
  if (controlsModal) {
    controlsModal.addEventListener('click', (e) => {
      if (e.target === controlsModal) {
        closeControlsModal();
      }
    });
  }

  toggleAutoSync.addEventListener('click', () => {
    state.autoSync = !state.autoSync;
    toggleAutoSync.classList.toggle('is-active', state.autoSync);
    toggleAutoSync.querySelector('span').textContent = state.autoSync ? 'Auto-sync on' : 'Auto-sync off';
    updateSyncStatusLabel();
    if (state.autoSync) {
      applyActiveHighlight();
      alignPreviewBlocks(state.activePreviewBlock);
      showToast('Auto-sync enabled');
    } else {
      showToast('Auto-sync disabled — panes scroll independently');
    }
  });

  rightBack.addEventListener('click', () => {
    nudgeSync(-1);
  });

  rightForward.addEventListener('click', () => {
    nudgeSync(1);
  });

  resetSyncOffset.addEventListener('click', () => {
    state.syncOffset = 0;
    updateSyncOffsetBadge();
    applyActiveHighlight();
    alignPreviewBlocks(state.activePreviewBlock);
    showToast('Sync offset reset to 0');
  });

  // French Pane View Toggle (Visual vs Code)
  if (frViewVisualBtn) {
    frViewVisualBtn.addEventListener('click', () => {
      switchFrenchView('visual');
    });
  }

  if (frViewCodeBtn) {
    frViewCodeBtn.addEventListener('click', () => {
      switchFrenchView('code');
    });
  }

  if (copyFrCodeBtn) {
    let copyResetTimer = null;
    copyFrCodeBtn.addEventListener('click', async () => {
      if (!frCodeEditor || !frCodeEditor.value) return;
      try {
        await navigator.clipboard.writeText(frCodeEditor.value);
        showToast('French HTML code copied to clipboard');
      } catch (_) {
        frCodeEditor.select();
        document.execCommand('copy');
        showToast('French HTML code copied to clipboard');
      }

      // Animated transform to checkmark icon
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyFrCodeBtn.classList.add('is-copied');
      const iconWrap = copyFrCodeBtn.querySelector('.fr-copy-icon-wrap');
      const label = copyFrCodeBtn.querySelector('.fr-copy-label');
      if (iconWrap) {
        iconWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 mr-1 text-emerald-400"><polyline points="20 6 9 17 4 12"/></svg>`;
      }
      if (label) {
        label.textContent = 'Copied!';
      }

      copyResetTimer = setTimeout(() => {
        copyFrCodeBtn.classList.remove('is-copied');
        if (iconWrap) {
          iconWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 mr-1 fr-copy-svg"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
        }
        if (label) {
          label.textContent = 'Copy';
        }
      }, 2000);
    });
  }

  if (formatFrCodeBtn) {
    formatFrCodeBtn.addEventListener('click', () => {
      if (!frCodeEditor) return;
      frCodeEditor.value = formatHtmlCode(frCodeEditor.value);
      updateFrCodeStats();
      showToast('HTML code formatted');
    });
  }

  if (frCodeEditor) {
    frCodeEditor.addEventListener('input', () => {
      updateFrCodeStats();
    });

    // Support tab indent in code editor
    frCodeEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = frCodeEditor.selectionStart;
        const end = frCodeEditor.selectionEnd;
        frCodeEditor.value = frCodeEditor.value.substring(0, start) + '  ' + frCodeEditor.value.substring(end);
        frCodeEditor.selectionStart = frCodeEditor.selectionEnd = start + 2;
        updateFrCodeStats();
      }
    });
  }

  if (downloadFrCodeBtn) {
    downloadFrCodeBtn.addEventListener('click', () => {
      const code = frCodeEditor && frCodeEditor.value ? frCodeEditor.value : generateFrenchHtmlSource();
      if (!code) {
        showToast('No French HTML to download');
        return;
      }
      const blob = new Blob([code], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (state.frDocxName.replace(/\.docx$/i, '') || 'french-localized') + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Downloaded French HTML');
    });
  }

  // Segmented Bar Tabs (EN Tags, FR Tags, Mismatches, Missing, Extra, Skipped)
  document.querySelectorAll('.preview-segment-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const cat = tab.getAttribute('data-category');
      if (state.drawerOpen && state.activeCategory === cat) {
        closeDrawer();
      } else {
        openDrawer(cat);
      }
    });
  });

  // Drawer Header Category Buttons
  document.querySelectorAll('.drawer-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const cat = tab.getAttribute('data-category');
      openDrawer(cat);
    });
  });

  closeDrawerBtn.addEventListener('click', closeDrawer);

  // Active Block Stepper & Popover Jump
  prevBlockBtn.addEventListener('click', () => {
    if (state.activePreviewBlock > 0) {
      jumpToBlock(state.activePreviewBlock - 1);
    }
  });

  nextBlockBtn.addEventListener('click', () => {
    if (state.activePreviewBlock < state.enBlocks.length - 1) {
      jumpToBlock(state.activePreviewBlock + 1);
    }
  });

  blockJumpToggleBtn.addEventListener('click', () => {
    const isShown = jumpForm.style.display !== 'none';
    jumpForm.style.display = isShown ? 'none' : 'flex';
    if (!isShown) {
      jumpInput.value = String(state.activePreviewBlock + 1);
      jumpInput.focus();
      jumpInput.select();
    }
  });

  jumpForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = parseInt(jumpInput.value, 10);
    if (!isNaN(val) && val >= 1 && val <= state.enBlocks.length) {
      jumpToBlock(val - 1);
      jumpForm.style.display = 'none';
    }
  });

  // Hover tracking for independent scrolling
  const enPaneEl = document.querySelector('.preview-pane:first-child');
  const frPaneEl = document.getElementById('frPreviewPane');
  if (enPaneEl) {
    enPaneEl.addEventListener('mouseenter', () => { lastHoveredFrame = enPreviewFrame; });
    enPaneEl.addEventListener('mousemove', () => { lastHoveredFrame = enPreviewFrame; });
  }
  if (frPaneEl) {
    frPaneEl.addEventListener('mouseenter', () => { lastHoveredFrame = frPreviewFrame; });
    frPaneEl.addEventListener('mousemove', () => { lastHoveredFrame = frPreviewFrame; });
  }

  // Workspace Wheel Navigation (1 notch = 1 block step when cursor is over preview area)
  const workspaceEl = document.getElementById('workspace');
  if (workspaceEl) {
    workspaceEl.addEventListener('wheel', (e) => handleWheelNavigation(e), { passive: false });
  }

  // Global Alt key detection to pause sync
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') {
      state.syncPaused = true;
      updateSyncStatusLabel();
    }
    handleKeyNavigation(e);
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') {
      state.syncPaused = false;
      updateSyncStatusLabel();
    }
  });

  window.addEventListener('blur', () => {
    state.syncPaused = false;
    updateSyncStatusLabel();
  });
}

// Initial bootstrap
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initEventListeners();
});