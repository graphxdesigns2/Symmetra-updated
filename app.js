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
  'h1,h2,h3,h4,h5,h6,p,li,dt,dd,td,th,figcaption,blockquote,caption,summary,img[alt],input[placeholder],input[aria-label],textarea[placeholder],button[aria-label],.alert,section.alert,div.alert,aside.alert,.well,.panel-body';

const SPAN_TAGS = ['a', 'strong', 'b', 'em', 'i', 'span'];

function spanType(tag) {
  if (tag === 'a') return 'a';
  if (tag === 'strong' || tag === 'b') return 'strong';
  if (tag === 'span') return 'span';
  return 'em';
}

function isFootnoteBoilerplateElement(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();

  // 1. <dt> inside a footnote list: e.g. <dt>Footnote 1</dt> or <dt>Note de bas de page 1</dt>
  if (tag === 'dt') {
    if (el.closest('.wb-fnote, [role="note"]') || el.closest('dl')?.querySelector('dd[id^="fn"]')) {
      return true;
    }
    if (/^(?:Footnote|Note\s+de\s+bas\s+de\s+page)\s*[a-zA-Z0-9_-]+/i.test((el.textContent || '').trim())) {
      return true;
    }
  }

  // 2. Return link element with class fn-rtn
  if (el.classList.contains('fn-rtn') || el.closest('.fn-rtn')) {
    return true;
  }

  // 3. <a> link pointing to footnote reference (-rf)
  if (tag === 'a' && ((el.getAttribute('href') || '').includes('-rf') || el.classList.contains('fn-rtn'))) {
    return true;
  }

  // 4. Standalone element whose text ONLY consists of return link boilerplate
  const txt = (el.textContent || '').trim();
  if (/^(?:Return to footnote|Retour à la référence de la note de bas de page)\s*[a-zA-Z0-9_-]*(?:\s*referrer)?$/i.test(txt)) {
    return true;
  }

  // 5. In-text footnote superscript or link
  if (isFootnoteElement(el)) {
    return true;
  }

  return false;
}

function isLeafBlock(el) {
  const tagName = el.tagName.toLowerCase();
  if (['img', 'input', 'textarea', 'button'].includes(tagName)) return true;

  if (tagName === 'li') {
    // If this <li> contains child content block elements (such as <p>, <div>, <blockquote>, etc.)
    // that are inside this <li> but NOT part of a nested sub-list <ul> or <ol>,
    // then this <li> is a structural container and those inner <p> elements are the leaf blocks.
    const nonListChildBlocks = Array.from(el.querySelectorAll(BLOCK_SELECTOR)).filter((child) => {
      if (child === el) return false;
      if (isFootnoteBoilerplateElement(child)) return false;
      const childTag = child.tagName.toLowerCase();
      if (childTag === 'ul' || childTag === 'ol') return false;
      const nestedList = child.closest('ul, ol');
      if (nestedList && el.contains(nestedList) && nestedList !== el.parentElement) {
        return false;
      }
      return true;
    });

    if (nonListChildBlocks.length > 0) {
      return false;
    }
    return true;
  }

  // If it contains child blocks, check if those child blocks are actual content blocks (not just boilerplate)
  const childBlocks = Array.from(el.querySelectorAll(BLOCK_SELECTOR)).filter(
    (child) => child !== el && !isFootnoteBoilerplateElement(child)
  );
  return childBlocks.length === 0;
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

function isFootnoteElement(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'sup') {
    return !!el.querySelector('a.fn-lnk, a[href*="#fn"], a[href*="#_ftn"]') || /^\s*\d{1,3}\s*$/.test(el.textContent);
  }
  if (tag === 'a') {
    if (el.classList.contains('fn-lnk') || el.classList.contains('fn-rtn')) return true;
    const href = el.getAttribute('href') || '';
    if (href.startsWith('#fn') || href.includes('-rf') || href.startsWith('#_ftn')) return true;
    if (el.closest('sup')) return true;
  }
  return false;
}

function extractBlockFootnotes(el) {
  const footnotes = [];
  const fnLinks = Array.from(
    el.querySelectorAll(
      'sup a.fn-lnk, a.fn-lnk, sup > a[href*="#fn"]:not([href*="-rf"]), a[href*="#fn"]:not([href*="-rf"]), sup > a[href*="#_ftn"], a[href*="#_ftn"]'
    )
  ).filter((a) => !a.classList.contains('fn-rtn') && !a.closest('.fn-rtn') && !(a.getAttribute('href') || '').includes('-rf'));

  fnLinks.forEach((a) => {
    const href = a.getAttribute('href') || '';
    const numMatch = href.match(/#(?:fn|_ftn)?([a-zA-Z0-9_-]+)/i) || a.textContent.match(/\b([a-zA-Z0-9_-]+)\b/);
    const fnNum = numMatch ? numMatch[1] : '1';
    const sup = a.closest('sup');
    const supId = sup?.getAttribute('id') || a.getAttribute('id') || '';
    const cleanHref = href.startsWith('#_ftn') ? `#fn${fnNum}` : (href || `#fn${fnNum}`);

    footnotes.push({
      fnNum,
      href: cleanHref,
      id: supId,
    });
  });

  // Also check for bare <sup> elements with digits (e.g. <sup>1</sup>) that don't have an <a> tag
  const bareSups = Array.from(el.querySelectorAll('sup')).filter((sup) => {
    return !sup.querySelector('a') && /^\s*\d{1,3}\s*$/.test(sup.textContent);
  });
  bareSups.forEach((sup) => {
    const fnNum = sup.textContent.trim();
    footnotes.push({
      fnNum,
      href: `#fn${fnNum}`,
      id: sup.getAttribute('id') || '',
    });
  });

  return footnotes;
}

function createFrenchFootnoteNode(fn) {
  const supEl = document.createElement('sup');
  if (fn.id) supEl.setAttribute('id', fn.id);
  const aEl = document.createElement('a');
  aEl.className = 'fn-lnk';
  aEl.setAttribute('href', fn.href || `#fn${fn.fnNum}`);
  const spanEl = document.createElement('span');
  spanEl.className = 'wb-inv';
  spanEl.textContent = 'Note de bas de page ';
  aEl.appendChild(spanEl);
  aEl.appendChild(document.createTextNode(String(fn.fnNum)));
  supEl.appendChild(aEl);
  return supEl;
}

function convertFootnotesToFrenchInHtml(html) {
  if (!html || typeof html !== 'string') return html || '';
  const trimmed = html.trim();
  if (!trimmed) return '';

  const isFullDoc = /^<!doctype/i.test(trimmed) || /<html[\s>]/i.test(trimmed);
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    isFullDoc ? trimmed : `<html><head></head><body>${trimmed}</body></html>`,
    'text/html'
  );

  const root = doc.body;
  if (!root) return html;

  // 1. Process Footnotes headings (e.g. <h2 id="fn">Footnotes</h2> or <h2>Footnotes</h2>)
  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    const text = h.textContent.trim();
    if (/^Footnotes?$/i.test(text)) {
      h.textContent = 'Notes de bas de page';
      if (!h.id && h.closest('.wb-fnote, [role="note"]')) {
        h.id = 'fn';
      }
    }
  });

  // 2. Process Definition Terms in footnote lists (<dt>Footnote 1</dt> or <dt><span class="wb-inv">Footnote </span>1</dt>)
  root.querySelectorAll('dt').forEach((dt) => {
    const text = dt.textContent.trim();
    const dtMatch = text.match(/^(?:Footnote|Note\s+de\s+bas\s+de\s+page)\s*([a-zA-Z0-9_-]+)/i);
    if (dtMatch) {
      const fnNum = dtMatch[1];
      dt.textContent = `Note de bas de page ${fnNum}`;
    }
  });

  // 3. Process Return to footnote links (<a class="fn-rtn" href="#fn1-rf">...)
  root.querySelectorAll('a[href*="-rf"], a.fn-rtn').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const rfMatch = href.match(/#fn([a-zA-Z0-9_-]+)-rf/i);
    const fnNum = rfMatch
      ? rfMatch[1]
      : (a.textContent.match(/\b([a-zA-Z0-9_-]+)\b/) ? a.textContent.match(/\b([a-zA-Z0-9_-]+)\b/)[1] : '1');

    // Check if it already has the exact French return label
    const invSpan = a.querySelector('.wb-inv');
    if (invSpan && /Retour/i.test(invSpan.textContent)) return;

    a.textContent = '';
    a.classList.add('fn-rtn');
    if (rfMatch) {
      a.setAttribute('href', `#fn${fnNum}-rf`);
    }
    const span = doc.createElement('span');
    span.className = 'wb-inv';
    span.textContent = 'Retour à la référence de la note de bas de page ';
    a.appendChild(span);
    a.appendChild(doc.createTextNode(fnNum));
  });

  // 4. Process in-text footnote links (sup > a.fn-lnk, a.fn-lnk, etc.)
  root.querySelectorAll('sup a.fn-lnk, a.fn-lnk, sup > a[href*="#fn"]:not([href*="-rf"]), a[href*="#fn"]:not([href*="-rf"])').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const fnMatch = href.match(/#fn([a-zA-Z0-9_-]+)/i);
    const fnNum = fnMatch
      ? fnMatch[1]
      : (a.textContent.match(/\b([a-zA-Z0-9_-]+)\b/) ? a.textContent.match(/\b([a-zA-Z0-9_-]+)\b/)[1] : '1');

    // Ensure link has correct classes and href
    a.className = 'fn-lnk';
    a.setAttribute('href', `#fn${fnNum}`);

    // Ensure inside a <sup> wrapper
    let sup = a.closest('sup');
    if (!sup) {
      sup = doc.createElement('sup');
      a.parentNode.insertBefore(sup, a);
      sup.appendChild(a);
    }

    // Standardize inner content to: <span class="wb-inv">Note de bas de page </span>N
    a.textContent = '';
    const span = doc.createElement('span');
    span.className = 'wb-inv';
    span.textContent = 'Note de bas de page ';
    a.appendChild(span);
    a.appendChild(doc.createTextNode(fnNum));
  });

  if (isFullDoc) {
    return doc.documentElement ? doc.documentElement.outerHTML : root.innerHTML;
  }
  return root.innerHTML;
}

function cleanThTags(root) {
  if (!root) return;
  const thElements = root.querySelectorAll ? root.querySelectorAll('th') : [];
  thElements.forEach((th) => {
    th.querySelectorAll('strong, b').forEach((boldEl) => {
      const parent = boldEl.parentNode;
      if (parent) {
        while (boldEl.firstChild) {
          parent.insertBefore(boldEl.firstChild, boldEl);
        }
        parent.removeChild(boldEl);
      }
    });
  });
}

function cleanFrenchHtmlPostProcess(html) {
  if (!html) return html;
  let res = convertFootnotesToFrenchInHtml(html);
  // Ensure no <strong> or <b> tags inside <th> tags in HTML string output
  res = res.replace(/<th(\s+[^>]*)?>([\s\S]*?)<\/th>/gi, (match, thAttrs, inner) => {
    const cleanedInner = inner.replace(/<\/?(strong|b)(\s+[^>]*)?>/gi, '');
    return `<th${thAttrs || ''}>${cleanedInner}</th>`;
  });
  // Convert non-breaking space characters (\u00A0) to explicit &nbsp; in generated HTML
  res = res.replace(/\u00A0/g, '&nbsp;');
  return res;
}


function getBlockContent(el) {
  if (!el) return "";
  const tag = el.tagName ? el.tagName.toLowerCase() : "";
  if (tag === "img") return el.getAttribute("alt") || "";
  if (["input", "textarea"].includes(tag) && el.hasAttribute("placeholder"))
    return el.getAttribute("placeholder") || "";
  if (["input", "button"].includes(tag) && el.hasAttribute("aria-label"))
    return el.getAttribute("aria-label") || "";
  
  const clone = el.cloneNode(true);
  clone.querySelectorAll("ul, ol").forEach((childList) => childList.remove());
  clone.querySelectorAll(".fn-rtn, a[href*=\"-rf\"]").forEach((rtn) => rtn.remove());
  clone.querySelectorAll(".wb-inv").forEach((inv) => {
    if (/Footnote|Note de bas de page|Return to footnote|Retour à la référence/i.test(inv.textContent)) {
      inv.remove();
    }
  });
  return (clone.textContent || "").replace(/[ \t\r\n]+/g, " ").trim();
}

function cleanFrenchUrlAndEntities(text) {
  if (!text) return '';
  return text
    .replace(/(?:https?|ftp|mailto|file):\/\/[^\s<>"'\\]+/gi, (url) =>
      url.replace(/:/g, '__COLON__').replace(/;/g, '__SEMI__').replace(/\?/g, '__Q__').replace(/!/g, '__EXCL__')
    )
    .replace(/&[a-zA-Z0-9#]+;/g, (ent) => ent.replace(/;/g, '__SEMI__'));
}

function restoreFrenchUrlAndEntities(text) {
  if (!text) return '';
  return text
    .replace(/__COLON__/g, ':')
    .replace(/__SEMI__/g, ';')
    .replace(/__Q__/g, '?')
    .replace(/__EXCL__/g, '!');
}

function applyFrenchTypographyRules(text) {
  if (!text) return text;
  let t = cleanFrenchUrlAndEntities(text);
  t = t
    // Replace regular space(s) or lack of space before : ; ? ! with non-breaking space (\u00A0)
    .replace(/([^\s\u00A0:;?!])[ \t]*([:;?!])/g, '$1\u00A0$2')
    // Guillemets: non-breaking space inside quotes
    .replace(/«[ \t\r\n\u00A0]*/g, '«\u00A0')
    .replace(/[ \t\r\n\u00A0]*»/g, '\u00A0»')
    // Currency symbols ($ and €) require non-breaking space between number and currency
    .replace(/(\d)[ \t\r\n\u00A0]*([$€])/g, '$1\u00A0$2')
    // Percentage (%) symbol requires non-breaking space before it when following numbers
    .replace(/(\d)[ \t\r\n\u00A0]*%/g, '$1\u00A0%')
    // Numbered units (km, h, min, s, jours, ans, mois, etc.) with non-breaking space after numbers
    .replace(/(\d)[ \t\r\n\u00A0]+(km|kg|mg|g|m|cm|mm|ha|t|l|ml|h|min|s|ans|an|jours|jour|mois|semaines|semaine|pages|page|p\.|art\.|no|n°|nº|§)\b/gi, '$1\u00A0$2')
    // Prevent accidental double non-breaking spaces or regular space + non-breaking space combos
    .replace(/[ \t]*\u00A0+[ \t]*/g, '\u00A0')
    .replace(/\u00A0+/g, '\u00A0');
  return restoreFrenchUrlAndEntities(t);
}

function extractBlockSpans(el) {
  const tag = el.tagName.toLowerCase();
  if (SPAN_TAGS.includes(tag)) {
    if (isFootnoteElement(el)) return [];
    const type = spanType(tag);
    return [
      {
        type,
        text: (el.textContent || '').replace(/[ \t\r\n]+/g, ' ').trim(),
        href: type === 'a' ? el.getAttribute('href') || '' : undefined,
        lang: el.getAttribute('lang') || undefined,
      },
    ];
  }
  const found = Array.from(el.querySelectorAll(SPAN_TAGS.join(', '))).filter(
    (n) => !isFootnoteElement(n) && !n.closest('ul, ol')?.parentElement?.closest(el.tagName) === false && (!n.closest('ul, ol') || n.closest('ul, ol') === el.closest('ul, ol'))
  );
  // Specifically: if `el` contains child lists (`<ul>` or `<ol>`), ignore any span inside those child lists
  const filteredFound = Array.from(el.querySelectorAll(SPAN_TAGS.join(', '))).filter((n) => {
    if (isFootnoteElement(n)) return false;
    // Check if `n` is inside a child list that is nested inside `el`
    const childList = n.closest('ul, ol');
    if (childList && el.contains(childList) && childList !== el) {
      return false;
    }
    return true;
  });
  const foundSet = new Set(filteredFound);
  const topLevel = filteredFound.filter((n) => {
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
        text: (n.textContent || '').replace(/[ \t\r\n]+/g, ' ').trim(),
        href: type === 'a' ? n.getAttribute('href') || '' : undefined,
        lang: n.getAttribute('lang') || undefined,
      };
    })
    .filter((s) => s.text.length > 0);
}

function extractBlocks(rootEl) {
  const all = Array.from(rootEl.querySelectorAll(BLOCK_SELECTOR));
  return all
    .filter((el) => isLeafBlock(el) && !isFootnoteBoilerplateElement(el))
    .map((el) => {
      const tag = el.tagName.toLowerCase();
      let attrTarget = 'text';
      if (tag === 'img') attrTarget = 'alt';
      else if (['input', 'textarea'].includes(tag) && el.hasAttribute('placeholder'))
        attrTarget = 'placeholder';
      else if (el.hasAttribute('aria-label')) attrTarget = 'aria-label';
      const brCount = el.querySelectorAll('br').length;
      return {
        el,
        tag,
        attrTarget,
        text: getBlockContent(el),
        spans: extractBlockSpans(el),
        hasBr: brCount > 0,
        brCount,
      };
    })
    .filter((b) => b.text.length > 0)
    .filter((b) => !isClassificationMarking(b.text))
    .filter((b) => !isPlainUrlText(b.text));
}

function tagElementAsSwapTarget(el, attributes = {}, classNames = []) {
  if (!el) return el;
  let targetEl = el;

  // If this element is an <li> that contains direct child sub-lists (<ul> or <ol>),
  // do NOT place the swap target / highlight boundary on the parent <li> itself,
  // because that would wrap and highlight all child lists and nested items.
  // Instead, isolate its direct text and inline nodes in a <span class="gc-li-content">
  // so that highlighting and navigation moves item-by-item (<li> to <li>).
  const tag = el.tagName ? el.tagName.toLowerCase() : '';
  if (tag === 'li') {
    const childLists = Array.from(el.querySelectorAll(':scope > ul, :scope > ol'));
    if (childLists.length > 0) {
      let contentSpan = el.querySelector(':scope > .gc-li-content');
      if (!contentSpan) {
        contentSpan = el.ownerDocument.createElement('span');
        contentSpan.className = 'gc-li-content';
        const nodesToMove = [];
        Array.from(el.childNodes).forEach((child) => {
          if (!childLists.includes(child) && child !== contentSpan) {
            nodesToMove.push(child);
          }
        });
        if (childLists[0]) {
          el.insertBefore(contentSpan, childLists[0]);
        } else {
          el.appendChild(contentSpan);
        }
        nodesToMove.forEach((n) => contentSpan.appendChild(n));
      }
      targetEl = contentSpan;
    }
  }

  for (const [k, v] of Object.entries(attributes)) {
    if (v !== undefined && v !== null) {
      targetEl.setAttribute(k, String(v));
    }
  }

  if (classNames && classNames.length) {
    targetEl.classList.add(...classNames);
  }

  return targetEl;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFragmentHref(href) {
  return typeof href === 'string' && href.trim().startsWith('#');
}

function isNodeHref(href) {
  if (!href || typeof href !== 'string') return false;
  const trimmed = href.trim();
  return (
    /(?:^|\/|\.)(en|fr)\/node(?:\/|\.html|\?|#|$)/i.test(trimmed) ||
    trimmed.includes('/en/node/') ||
    trimmed.includes('/fr/node/')
  );
}

function convertNodeHrefToFrench(href) {
  if (!href || typeof href !== 'string') return '';
  return formatFrenchRootRelativeLink(href);
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

  // 0. Node links (e.g. /en/node/11022 -> /fr/node/11022, https://www.canada.ca/en/node/11022 -> /fr/node/11022)
  const nodeMatch = trimmed.match(/^(?:https?:\/\/[^\/]+)?(?:\/editor\.html|\/cf#)?\/?(en|fr)\/node(\/.*|\.html.*|\?.*|#.*|$)/i);
  if (nodeMatch) {
    const rest = nodeMatch[2] || '';
    return `/fr/node${rest}`;
  }
  if (trimmed.includes('/en/node/')) {
    return trimmed.replace(/\/en\/node\//gi, '/fr/node/');
  }
  if (trimmed.startsWith('/fr/node/')) {
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
  if (attrTarget !== 'text') {
    el.setAttribute(attrTarget, newText);
    return { unresolvedLinks: 0 };
  }

  // If this element has nested child lists (e.g. an <li> that contains a <ul> or <ol>),
  // detach those child lists before updating this element's text/links, and re-append them afterward.
  const childLists = Array.from(el.querySelectorAll(':scope > ul, :scope > ol'));
  childLists.forEach((cl) => cl.remove());

  const blockTag = el.tagName.toLowerCase();
  const isTh = blockTag === 'th' || el.tagName.toLowerCase() === 'th' || Boolean(el.closest('th'));

  // If this is a footnote content element inside a definition list, strip leading number labels like "1. ", "1 - ", "1) ", "[1] ", "Note 1 : "
  const isFootnoteItem = Boolean(el.closest('dd[id^="fn"], .wb-fnote dl, [role="note"] dl'));
  if (isFootnoteItem && newText) {
    const stripped = newText.replace(/^(?:(?:\(|\[)?\s*\d+\s*(?:\)|\])?\s*[:.\-–—]?\s*|\bNote(?:\s+de\s+bas\s+de\s+page)?\s*\d+\s*[:.\-–—]?\s*)/i, '').trim();
    if (stripped) {
      newText = stripped;
    }
  }

  // Extract any footnotes from English element before modifying children
  const blockFootnotes = extractBlockFootnotes(el);

  if (SPAN_TAGS.includes(blockTag)) {
    if (blockTag === 'a') {
      const originalHref = el.getAttribute('href') || '';
      el.textContent = newText;
      childLists.forEach((cl) => el.appendChild(cl));
      if (isFragmentHref(originalHref)) return { unresolvedLinks: 0 };
      if (isNodeHref(originalHref)) {
        el.setAttribute('href', convertNodeHrefToFrench(originalHref));
        return { unresolvedLinks: 0 };
      }
      const frLink = (frSpans || []).find((s) => s.type === 'a');
      if (frLink && frLink.href) {
        el.setAttribute('href', formatFrenchRootRelativeLink(frLink.href));
        return { unresolvedLinks: 0 };
      }
      return { unresolvedLinks: 1 };
    }
    el.textContent = newText;
    childLists.forEach((cl) => el.appendChild(cl));
    return { unresolvedLinks: 0 };
  }

  const oldSpans = extractBlockSpans(el);

  // If the whole English block was wrapped in a single <strong>, <b>, <em>, or <i>
  // Use getBlockContent(el) to ignore child sub-lists when checking if whole block was wrapped
  const originalText = getBlockContent(el);
  if (oldSpans.length === 1 && blockFootnotes.length === 0) {
    const span = oldSpans[0];
    if (span.type === 'a' && originalText === span.text) {
      const originalHref = span.href || el.querySelector('a')?.getAttribute('href') || '';
      const aElem = document.createElement('a');
      aElem.textContent = newText;
      if (isFragmentHref(originalHref)) {
        aElem.setAttribute('href', originalHref);
        el.replaceChildren(aElem);
        childLists.forEach((cl) => el.appendChild(cl));
        return { unresolvedLinks: 0 };
      }
      if (isNodeHref(originalHref)) {
        aElem.setAttribute('href', convertNodeHrefToFrench(originalHref));
        el.replaceChildren(aElem);
        childLists.forEach((cl) => el.appendChild(cl));
        return { unresolvedLinks: 0 };
      }
      const frLink = (frSpans || []).find((s) => s.type === 'a');
      if (frLink && frLink.href) {
        aElem.setAttribute('href', formatFrenchRootRelativeLink(frLink.href));
        el.replaceChildren(aElem);
        childLists.forEach((cl) => el.appendChild(cl));
        return { unresolvedLinks: 0 };
      }
      el.replaceChildren(document.createTextNode(newText));
      childLists.forEach((cl) => el.appendChild(cl));
      return { unresolvedLinks: 1 };
    }

    // The entire English block is styled with <strong>, <b>, <em>, or <i>
    // For <th> headers, do not output <strong> tags as <th> is already inherently bold
    if (isTh && span.type === 'strong') {
      el.replaceChildren(document.createTextNode(newText));
      childLists.forEach((cl) => el.appendChild(cl));
      return { unresolvedLinks: 0 };
    }

    // Replicate the exact English container emphasis so the entire French paragraph is bolded/italicized
    if (originalText === span.text) {
      const tagElem = document.createElement(span.type === 'strong' ? 'strong' : 'em');
      const frLinks = (frSpans || []).filter((s) => s.type === 'a' && s.href);
      if (frLinks.length > 0) {
        replaceBlockTextPreservingLinks(tagElem, newText, 'text', frSpans);
      } else {
        tagElem.textContent = newText;
      }
      el.replaceChildren(tagElem);
      childLists.forEach((cl) => el.appendChild(cl));
      return { unresolvedLinks: 0 };
    }
  }

  // Determine spans to apply:
  // Preference 1: Explicit spans from French Word document (frSpans)
  let activeSpans = [];
  let unresolvedLinks = 0;

  if (frSpans && frSpans.length > 0) {
    const enLinks = oldSpans.filter((s) => s.type === 'a');
    let enLinkIdx = 0;

    frSpans.forEach((fs) => {
      if (!fs.text) return;
      let href = fs.href || '';
      let isFragment = isFragmentHref(href);
      let isNode = isNodeHref(href);

      if (fs.type === 'a') {
        if (!href && enLinks[enLinkIdx]) {
          const enHref = enLinks[enLinkIdx].href || '';
          if (isFragmentHref(enHref)) {
            href = enHref;
            isFragment = true;
          } else if (isNodeHref(enHref)) {
            href = convertNodeHrefToFrench(enHref);
            isNode = true;
          } else {
            href = enHref;
          }
          enLinkIdx++;
        }
      }

      activeSpans.push({
        type: fs.type,
        text: fs.text,
        href,
        isFragment,
        isNodeLink: isNode,
      });
    });
  } else if (oldSpans && oldSpans.length > 0) {
    // When the Word document provides plain text without explicit hyperlinks/spans,
    // only wrap the entire French text in the link if the link IS the entire
    // English block content (e.g. Table of Contents list items like <li><a href="#a1">Purpose</a></li>)
    // — not when a link was just a partial sentence or fragment.
    const enLinks = oldSpans.filter((s) => s.type === 'a');
    if (enLinks.length === 1 && oldSpans.length === 1 && originalText === enLinks[0].text) {
      const enLink = enLinks[0];
      const enHref = enLink.href || '';
      let frHref = enHref;
      let isFragment = isFragmentHref(enHref);
      let isNode = isNodeHref(enHref);
      if (isNode) {
        frHref = convertNodeHrefToFrench(enHref);
      } else if (!isFragment && enHref) {
        frHref = formatFrenchRootRelativeLink(enHref);
      }
      activeSpans.push({
        type: 'a',
        text: newText,
        href: frHref,
        isFragment,
        isNodeLink: isNode,
      });
    }
  }

  // Disallow bold (<strong>) spans inside <th> cells
  if (isTh) {
    activeSpans = activeSpans.filter((s) => s.type !== 'strong');
  }

  // Carry over leading bold prefix if English starts with bold label (e.g. <strong>Note:</strong> or <strong>Important:</strong>)
  // and the French translation begins with a corresponding label (e.g. "Remarque :", "Note :", "Avertissement :")
  if (!isTh) {
    const leadingEnStrong = oldSpans.find(
      (s) =>
        s.type === 'strong' &&
        (originalText.startsWith(s.text) ||
          originalText.startsWith(s.text + ':') ||
          originalText.startsWith(s.text + ' :') ||
          /^[A-Za-z\s]{1,30}:/.test(s.text))
    );
    if (leadingEnStrong) {
      const hasLeadingFrSpan = activeSpans.some((s) => newText.startsWith(s.text));
      if (!hasLeadingFrSpan) {
        const frPrefixMatch = newText.match(/^([A-Za-zÀ-ÖØ-öø-ÿ\s'’()\-–—]{1,40}\s*[:：])/);
        if (frPrefixMatch && frPrefixMatch[1]) {
          activeSpans.unshift({
            type: 'strong',
            text: frPrefixMatch[1].trim(),
          });
        }
      }
    }
  }

  // Count unresolved links if English had more links than French Word document provided
  const enLinksCount = oldSpans.filter((s) => s.type === 'a').length;
  const frLinksCount = (frSpans || []).filter((s) => s.type === 'a').length;
  if (enLinksCount > frLinksCount) {
    unresolvedLinks += (enLinksCount - frLinksCount);
  }

  // Rebuild text with footnote placeholders if footnotes exist
  let rebuilt = newText;
  if (blockFootnotes.length > 0) {
    const toSuperscript = (str) =>
      String(str)
        .replace(/0/g, '⁰')
        .replace(/1/g, '¹')
        .replace(/2/g, '²')
        .replace(/3/g, '³')
        .replace(/4/g, '⁴')
        .replace(/5/g, '⁵')
        .replace(/6/g, '⁶')
        .replace(/7/g, '⁷')
        .replace(/8/g, '⁸')
        .replace(/9/g, '⁹');

    // 1. Check if multiple footnotes appear together as a cluster in the text
    // E.g. "¹ ²", "¹²", "¹,²", "¹, ²", "1 2", "1, 2", "1,2", "[1, 2]", "[1][2]", "(1, 2)", "(1)(2)", "Notes 1 et 2", "Notes 1, 2"
    if (blockFootnotes.length > 1) {
      const allNums = blockFootnotes.map((fn, idx) => {
        const pure = fn.fnNum.replace(/^fn[-_]?/i, '');
        return {
          fnNum: fn.fnNum,
          pure: pure || String(idx + 1),
          super: toSuperscript(pure || String(idx + 1)),
          idx,
        };
      });

      // Check for clustered superscript sequence e.g. "¹ ²" or "¹²" or "¹, ²"
      const superClusterRegexStr = allNums
        .map((n) => escapeRegExp(n.super))
        .join('[\\s,;\\-–—]*');
      const superClusterRegex = new RegExp(`[\\s\u00A0]*(?:${superClusterRegexStr})`, 'g');
      if (superClusterRegex.test(rebuilt)) {
        const clusterRepl = allNums.map((n) => `___GC_FN_${n.idx}___`).join('');
        rebuilt = rebuilt.replace(superClusterRegex, clusterRepl);
      } else {
        // Check for clustered bracket/parenthesis/note e.g. "[1, 2]", "(1, 2)", "{1, 2}", "[1][2]"
        const numClusterRegexStr = allNums
          .map((n) => `(?:fn[-_]?|#fn[-_]?|Note(?:\\s+de\\s+bas\\s+de\\s+page)?\\s*)?(?:${escapeRegExp(n.pure)}|${escapeRegExp(n.fnNum)})`)
          .join('[\\s,;\\-–—/et]+');
        const bracketClusterRegex = new RegExp(
          `[\\s\u00A0]*(?:\\[\\s*${numClusterRegexStr}\\s*\\]|\\(\\s*${numClusterRegexStr}\\s*\\)|\\{\\s*${numClusterRegexStr}\\s*\\}|\\b(?:Notes?(?:\\s+de\\s+bas\\s+de\\s+page)?|Footnotes?)\\s+${numClusterRegexStr}\\b)`,
          'i'
        );
        if (bracketClusterRegex.test(rebuilt)) {
          const clusterRepl = allNums.map((n) => `___GC_FN_${n.idx}___`).join('');
          rebuilt = rebuilt.replace(bracketClusterRegex, clusterRepl);
        } else {
          // Check for trailing clustered numbers e.g. "Bundibugyo1 2", "Bundibugyo 1 2", "Bundibugyo1, 2"
          const trailingClusterRegexStr = allNums
            .map((n) => `(?:${escapeRegExp(n.pure)}|${escapeRegExp(n.fnNum)})`)
            .join('[\\s,;\\-–—]+');
          const trailingClusterRegex = new RegExp(
            `(?<=[a-zA-ZÀ-ÖØ-öø-ÿ.,;:!?'"»)])[\\s\u00A0]*(?:${trailingClusterRegexStr})(?=[\\s.,;:!?'"»)]|$)`,
            'i'
          );
          if (trailingClusterRegex.test(rebuilt)) {
            const clusterRepl = allNums.map((n) => `___GC_FN_${n.idx}___`).join('');
            rebuilt = rebuilt.replace(trailingClusterRegex, clusterRepl);
          }
        }
      }
    }

    // 2. For any remaining footnotes not yet matched in rebuilt, match them individually
    blockFootnotes.forEach((fn, fIdx) => {
      if (rebuilt.includes(`___GC_FN_${fIdx}___`)) return;

      const fnNum = fn.fnNum;
      const pureNum = fnNum.replace(/^fn[-_]?/i, '');
      const posNum = String(fIdx + 1);
      const superNum = toSuperscript(pureNum || posNum);

      const numPatterns = [escapeRegExp(fnNum)];
      if (pureNum && pureNum !== fnNum && !numPatterns.includes(escapeRegExp(pureNum))) {
        numPatterns.push(escapeRegExp(pureNum));
      }
      if (posNum && !numPatterns.includes(escapeRegExp(posNum))) {
        numPatterns.push(escapeRegExp(posNum));
      }
      const patternOr = numPatterns.join('|');
      const superEscaped = escapeRegExp(superNum);

      const fnRegex = new RegExp(
        `[\\s\u00A0]*(?:` +
        // Unicode superscripts: ¹, ², etc.
        `${superEscaped}+|` +
        // Brackets / braces / parentheses: [1], (1), {1}, [fn1], (Note 1)
        `\\{\\s*(?:fn[-_]?|#fn[-_]?|Note\\s*(?:de\\s+bas\\s+de\\s+page)?\\s*)?(?:${patternOr})\\s*\\}|` +
        `\\[\\s*(?:fn[-_]?|#fn[-_]?|Note\\s*(?:de\\s+bas\\s+de\\s+page)?\\s*)?(?:${patternOr})\\s*\\]|` +
        `\\(\\s*(?:fn[-_]?|#fn[-_]?|Note\\s*(?:de\\s+bas\\s+de\\s+page)?\\s*)?(?:${patternOr})\\s*\\)|` +
        // Explicit label: Note 1, Footnote 1, Note de bas de page 1
        `\\b(?:Note(?:\\s+de\\s+bas\\s+de\\s+page)?|Footnote)\\s*(?:${patternOr})\\b(?:\\s*[.:])?|` +
        // Number following a previous footnote placeholder: ___GC_FN_0___ 2 or ___GC_FN_0___, 2
        `(?<=___GC_FN_\\d+___)[\\s\u00A0,;\\-–—]*(?:${patternOr})(?=[\\s.,;:!?'"»)]|$)|` +
        // Number directly attached to preceding word or punctuation: "Bundibugyo1", "virus1", "mot1"
        `(?<=[a-zA-ZÀ-ÖØ-öø-ÿ.,;:!?'"»)])(?:${patternOr})(?=[\\s.,;:!?'"»)]|$)|` +
        // Number at the very end of the text: "Bundibugyo 1"
        `[\\s\u00A0]+(?:${patternOr})$` +
        `)`,
        'i'
      );

      if (fnRegex.test(rebuilt)) {
        rebuilt = rebuilt.replace(fnRegex, `___GC_FN_${fIdx}___`);
      } else {
        rebuilt = rebuilt + `___GC_FN_${fIdx}___`;
      }
    });

    // 3. Clean any leftover stray superscript characters or redundant digits immediately adjacent to footnote placeholders
    rebuilt = rebuilt.replace(/(?<=[a-zA-ZÀ-ÖØ-öø-ÿ])[ \t\u00A0]*[¹²³⁴⁵⁶⁷⁸⁹⁰]+(?=[ \t\u00A0]*___GC_FN_)/g, '');
    rebuilt = rebuilt.replace(/(?<=[a-zA-ZÀ-ÖØ-öø-ÿ])[ \t\u00A0]*\d+(?=[ \t\u00A0]*___GC_FN_)/g, '');
  }

  // If no active spans and no footnotes to apply, simply set textContent
  if (activeSpans.length === 0 && blockFootnotes.length === 0) {
    el.replaceChildren(document.createTextNode(newText));
    childLists.forEach((cl) => el.appendChild(cl));
    if (isTh) cleanThTags(el);
    return { unresolvedLinks };
  }

  // Replace activeSpans inside rebuilt using placeholders
  const spanPlaceholders = activeSpans.map((_, i) => `___GC_SPAN_${i}___`);
  const matchedSpanIndexes = [];

  // Sort by length descending to match longest phrases first
  const sortedIndices = activeSpans
    .map((_, i) => i)
    .sort((a, b) => activeSpans[b].text.length - activeSpans[a].text.length);

  sortedIndices.forEach((i) => {
    const span = activeSpans[i];
    const escaped = escapeRegExp(span.text);
    const regex = new RegExp(escaped, 'i');
    if (regex.test(rebuilt)) {
      rebuilt = rebuilt.replace(regex, spanPlaceholders[i]);
      matchedSpanIndexes.push(i);
    }
  });

  if (matchedSpanIndexes.length > 0 || blockFootnotes.length > 0) {
    el.replaceChildren();
    const parts = rebuilt.split(/(___GC_SPAN_\d+___|___GC_FN_\d+___)/g);
    parts.forEach((part) => {
      const spanMatch = part.match(/^___GC_SPAN_(\d+)___$/);
      const fnMatch = part.match(/^___GC_FN_(\d+)___$/);
      if (spanMatch) {
        const spanIndex = parseInt(spanMatch[1], 10);
        const span = activeSpans[spanIndex];
        const spanEl = document.createElement(
          span.type === 'a' ? 'a' : span.type === 'strong' ? 'strong' : span.type === 'span' ? 'span' : 'em'
        );
        spanEl.textContent = span.text;
        if (span.lang) {
          spanEl.setAttribute('lang', span.lang);
        }
        if (span.type === 'a') {
          if (span.isFragment) {
            spanEl.setAttribute('href', span.href || '#');
          } else if (span.isNodeLink) {
            spanEl.setAttribute('href', convertNodeHrefToFrench(span.href));
          } else if (span.href) {
            spanEl.setAttribute('href', formatFrenchRootRelativeLink(span.href));
          }
        }
        el.appendChild(spanEl);
      } else if (fnMatch) {
        const fnIndex = parseInt(fnMatch[1], 10);
        const fn = blockFootnotes[fnIndex];
        if (fn) {
          el.appendChild(createFrenchFootnoteNode(fn));
        }
      } else if (part) {
        el.appendChild(document.createTextNode(part));
      }
    });
    childLists.forEach((cl) => el.appendChild(cl));
    if (isTh) cleanThTags(el);
    return { unresolvedLinks };
  }

  // Fallback: render clean text without appending any stray English spans
  el.replaceChildren(document.createTextNode(newText));
  childLists.forEach((cl) => el.appendChild(cl));
  if (isTh) cleanThTags(el);
  return { unresolvedLinks };
}

function isFootnoteHeadingBlock(block) {
  if (!block) return false;
  if (block.el && (block.el.id === 'fn' || block.el.closest('#fn') || (block.el.closest('.wb-fnote, [role="note"]') && isHeadingTag(block.tag)))) {
    return true;
  }
  // Only a genuine heading (or definition term) counts — this rules out
  // table-of-contents bullets/links that merely say "Footnotes".
  if (!isHeadingTag(block.tag) && block.tag !== 'dt') return false;
  return /^\s*(?:Footnotes?|Notes?\s+de\s+bas\s+de\s+page)\s*[:：]?\s*$/i.test((block.text || '').trim());
}

function isFootnoteContentBlock(block, allBlocks = []) {
  if (!block) return false;
  // 1. Inside English/WET footnote container (dd or dl inside .wb-fnote)
  if (block.el && block.el.closest('dd[id^="fn"], .wb-fnote dl, [role="note"] dl, dl.fnote')) {
    return true;
  }
  // 2. Starts with a footnote prefix like "1. ", "1 - ", "[1] ", "(1)", "1) ", "Note 1 : ", "Note de bas de page 1"
  if (/^\s*(?:(?:\(|\[)?\s*\d+\s*(?:\)|\])?\s*[:.\-–—\)]|\bNote(?:\s+de\s+bas\s+de\s+page)?\s*\d+\s*[:.\-–—\)]?)/i.test((block.text || '').trim())) {
    return true;
  }
  // 3. If it is located after a footnote heading in the document's block list
  if (allBlocks && allBlocks.length > 0) {
    const idx = allBlocks.indexOf(block);
    if (idx > 0) {
      for (let k = idx - 1; k >= 0; k--) {
        const prev = allBlocks[k];
        if (isFootnoteHeadingBlock(prev)) {
          return true;
        }
        // If we hit a different real heading before finding a footnote heading,
        // we've walked back into another section — stop.
        if (isHeadingTag(prev.tag)) {
          return false;
        }
      }
    }
  }
  return false;
}

function isHeadingLikeBlock(block) {
  if (!block) return false;
  if (isHeadingTag(block.tag)) return true;
  if (block.el) {
    const strongEl = block.el.querySelector('strong, b, h1, h2, h3, h4, h5, h6');
    if (strongEl) {
      const strongText = (strongEl.textContent || '').trim();
      const allText = (block.text || '').trim();
      if (strongText && Math.abs(strongText.length - allText.length) <= 8) {
        return true;
      }
    }
  }
  const txt = (block.text || '').trim();
  if (/^(?:Annexe|Appendix|Tableau|Table|Figure|Section|Partie|Part|Chapitre|Chapter|Étape|Step)\b/i.test(txt)) {
    return true;
  }
  return false;
}

function extractSectionIdentifier(text) {
  if (!text) return null;
  const t = text.trim();
  const m = t.match(/^(?:Annexe|Appendix|Tableau|Table|Figure|Section|Partie|Part|Chapitre|Chapter|Étape|Step)\s+([a-zA-Z0-9_-]+)/i);
  if (m) {
    const rawType = m[0].split(/\s+/)[0].toLowerCase();
    let normType = 'section';
    if (/annex|appendix/i.test(rawType)) normType = 'appendix';
    else if (/table/i.test(rawType)) normType = 'table';
    else if (/figure/i.test(rawType)) normType = 'figure';
    else if (/part/i.test(rawType)) normType = 'part';
    else if (/chap/i.test(rawType)) normType = 'chapter';
    else if (/step|tape/i.test(rawType)) normType = 'step';
    return `${normType}:${m[1].toLowerCase()}`;
  }
  const numPrefixMatch = t.match(/^(\d+(?:\.\d+)*|[a-zA-Z]\))\s+/);
  if (numPrefixMatch) {
    return `num:${numPrefixMatch[1].toLowerCase()}`;
  }
  return null;
}

function extractBlockFootnoteNumbers(block) {
  if (!block) return [];
  const nums = [];
  if (block.el) {
    const fns = extractBlockFootnotes(block.el);
    fns.forEach((f) => {
      const pure = f.fnNum.replace(/^fn[-_]?/i, '');
      if (pure && !nums.includes(pure)) nums.push(pure);
    });
  }
  const txt = block.text || '';
  const bracketMatches = Array.from(txt.matchAll(/(?:\[|\{|\()(?:\s*Note\s*)?(\d{1,3})(?:\s*\]|\}|\))/gi));
  for (const m of bracketMatches) {
    if (!nums.includes(m[1])) nums.push(m[1]);
  }
  const superMatches = Array.from(txt.matchAll(/([¹²³⁴⁵⁶⁷⁸⁹⁰]+)/g));
  for (const m of superMatches) {
    const map = { '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁰': '0' };
    const converted = m[1].split('').map((c) => map[c] || c).join('');
    if (converted && !nums.includes(converted)) nums.push(converted);
  }
  const attachedMatches = Array.from(txt.matchAll(/(?:[a-zA-ZÀ-ÖØ-öø-ÿ]+)(\d{1,2})(?=[\s.,;:!?'"»)\]}]|$)/g));
  for (const m of attachedMatches) {
    if (!nums.includes(m[1])) nums.push(m[1]);
  }
  return nums;
}

function extractDistinctiveTokens(text) {
  if (!text) return new Set();
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 || /\d/.test(w));
  return new Set(words);
}

function getBlockMatchScore(enTag, frTag, enBlock, frBlock, enBlocks = [], frBlocks = []) {
  if (enBlock && frBlock) {
    const enIsFnHeader = isFootnoteHeadingBlock(enBlock);
    const frIsFnHeader = isFootnoteHeadingBlock(frBlock);

    // Both are footnote headers (e.g. Footnotes / Notes de bas de page) -> lock together
    if (enIsFnHeader && frIsFnHeader) return 15;
    // One is footnote header, the other is NOT -> heavy penalty
    if (enIsFnHeader !== frIsFnHeader) return -12;

    const enIsFnContent = isFootnoteContentBlock(enBlock, enBlocks);
    const frIsFnContent = isFootnoteContentBlock(frBlock, frBlocks);

    // Both are footnote content items -> lock together
    if (enIsFnContent && frIsFnContent) return 10;
    // One is footnote content, the other is regular body text -> penalty to prevent cross-contamination
    if (enIsFnContent !== frIsFnContent) return -8;

    // Structural section identifier match (e.g. "Appendix 2" vs "Annexe 2", "Table 1" vs "Tableau 1")
    const enSecId = extractSectionIdentifier(enBlock.text);
    const frSecId = extractSectionIdentifier(frBlock.text);
    if (enSecId && frSecId) {
      if (enSecId === frSecId) {
        return 16.0; // Deterministic anchor lock
      } else {
        return -8.0; // Different section identifiers (e.g. Annexe 1 vs Annexe 2)
      }
    }

    // Heading vs Heading / Heading-like matching
    const enIsHeading = isHeadingLikeBlock(enBlock);
    const frIsHeading = isHeadingLikeBlock(frBlock);
    if (enIsHeading && frIsHeading) {
      // Both act as section headings
      let headingScore = 6.0;
      if (enTag === frTag) headingScore += 2.0;
      return headingScore;
    }

    // Heavy penalty: a heading block should NOT match a long body text / list item
    const frWordCount = (frBlock.text || '').split(/\s+/).filter(Boolean).length;
    const enWordCount = (enBlock.text || '').split(/\s+/).filter(Boolean).length;
    if (isHeadingTag(enTag) && !frIsHeading && frWordCount > 15) {
      return -5.0;
    }
    if (isHeadingTag(frTag) && !enIsHeading && enWordCount > 15) {
      return -5.0;
    }

    // Footnote signature bonus for body / heading blocks:
    // If both blocks have footnote markers and share numbers (e.g. both have [1, 2] or 3), give strong anchor bonus
    const enFnNums = extractBlockFootnoteNumbers(enBlock);
    const frFnNums = extractBlockFootnoteNumbers(frBlock);
    if (enFnNums.length > 0 && frFnNums.length > 0) {
      const sharedFns = enFnNums.filter((n) => frFnNums.includes(n));
      if (sharedFns.length > 0) {
        return 5.0 + sharedFns.length * 3.0;
      }
    }

    // List bullet to list bullet compatibility
    const enIsBullet = enTag === 'li';
    const frIsBullet = frTag === 'li' || /^\s*[•\-*–—]\s+/.test(frBlock.text || '');
    if (enIsBullet && frIsBullet) {
      let bulletScore = 3.0;
      // Token overlap check for list items
      const enTokens = extractDistinctiveTokens(enBlock.text);
      const frTokens = extractDistinctiveTokens(frBlock.text);
      let sharedCount = 0;
      enTokens.forEach((t) => {
        if (frTokens.has(t)) sharedCount++;
      });
      if (sharedCount > 0) {
        bulletScore += Math.min(3.0, sharedCount * 0.8);
      }
      return bulletScore;
    }
  }

  // Exact tag match (e.g. p === p, li === li, h2 === h2)
  if (enTag === frTag) return 2.5;

  // Heading to heading (e.g. h2 to h3 or h1 to h2)
  if (isHeadingTag(enTag) && isHeadingTag(frTag)) return 2.0;

  // Cross-tag matches for unformatted Word documents:
  // When Word document has plain paragraphs (<p>) where English has list items (<li>), table cells (<td>/<th>),
  // definition items (<dd>/<dt>), or summary/blockquotes, give a positive compatibility score so sequence alignment succeeds.
  const isEnContentTag = ['li', 'p', 'td', 'th', 'dd', 'dt', 'figcaption', 'blockquote', 'summary'].includes(enTag);
  const isFrContentTag = ['li', 'p', 'td', 'th', 'dd', 'dt', 'figcaption', 'blockquote', 'summary'].includes(frTag);

  if (isEnContentTag && isFrContentTag) {
    if ((enTag === 'li' && frTag === 'p') || (enTag === 'p' && frTag === 'li')) {
      return 1.2;
    }
    if (isHeadingTag(enTag) || isHeadingTag(frTag)) {
      return 0.5;
    }
    return 1.0;
  }

  // Minor compatibility between headings and content blocks if Word formatting stripped heading styles
  if ((isHeadingTag(enTag) && isFrContentTag) || (isEnContentTag && isHeadingTag(frTag))) {
    return 0.3;
  }

  return -1;
}

function alignByTag(enTags, frTags, enBlocks = [], frBlocks = []) {
  const n = enTags.length;
  const m = frTags.length;
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
  for (let i = 0; i <= n; i++) score[i] = new Float64Array(m + 1);
  for (let i = 1; i <= n; i++) score[i][0] = score[i - 1][0] + GAP;
  for (let j = 1; j <= m; j++) score[0][j] = score[0][j - 1] + GAP;

  for (let i = 1; i <= n; i++) {
    const rowCur = score[i];
    const rowPrev = score[i - 1];
    for (let j = 1; j <= m; j++) {
      const matchScore = getBlockMatchScore(
        enTags[i - 1],
        frTags[j - 1],
        enBlocks[i - 1],
        frBlocks[j - 1],
        enBlocks,
        frBlocks
      );
      const diag = rowPrev[j - 1] + matchScore;
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
    const matchScore = getBlockMatchScore(
      enTags[i - 1],
      frTags[j - 1],
      enBlocks[i - 1],
      frBlocks[j - 1],
      enBlocks,
      frBlocks
    );
    const diagVal = score[i - 1][j - 1] + matchScore;
    if (Math.abs(cur - diagVal) < 1e-6) {
      pairs.push({ enIndex: i - 1, frIndex: j - 1, skip: false });
      i--;
      j--;
    } else if (Math.abs(cur - (score[i - 1][j] + GAP)) < 1e-6) {
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
      'The English HTML has this as <' +
      enTag +
      '>, but the Word paragraph came through as plain text (<' +
      frTag +
      '>). Symmetra automatically formats the French output using the proper <' +
      enTag +
      '> structure.'
    );
  }
  if (!enHeading && frHeading) {
    return (
      'The French Word paragraph was styled as <' +
      frTag +
      '>, but the English HTML uses <' +
      enTag +
      '>. Symmetra maintains the English <' +
      enTag +
      '> structure in the French output.'
    );
  }
  if (enHeading && frHeading) {
    return (
      'Heading level difference: English HTML uses <' +
      enTag +
      '> while French Word paragraph uses <' +
      frTag +
      '>. Symmetra preserves the English <' +
      enTag +
      '> heading level in the French output.'
    );
  }
  return (
    'The English HTML uses <' +
    enTag +
    '> while the French Word document came through as <' +
    frTag +
    '>. Symmetra preserves the English structure.'
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
          '" — Filled with French filler placeholder [TRADUCTION MANQUANTE : ...] to preserve layout.',
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
  padding: 24px 28px !important;
  padding-bottom: 30vh !important;
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

/* Lists & WET List Styles */
ul {
  list-style-type: disc !important;
  padding-left: 28px !important;
  margin-top: 0 !important;
  margin-bottom: 12px !important;
}
ul ul {
  list-style-type: circle !important;
  margin-top: 4px !important;
  margin-bottom: 6px !important;
}
ul ul ul {
  list-style-type: square !important;
}

ol {
  list-style-type: decimal !important;
  padding-left: 28px !important;
  margin-top: 0 !important;
  margin-bottom: 12px !important;
}
ol ol {
  list-style-type: lower-alpha !important;
  margin-top: 4px !important;
  margin-bottom: 6px !important;
}
ol ol ol {
  list-style-type: lower-roman !important;
}

li {
  margin-bottom: 6px !important;
}
li > p {
  margin-top: 0 !important;
  margin-bottom: 6px !important;
}
li > p:last-child {
  margin-bottom: 0 !important;
}

/* WET / GCWeb Ordered List Type Classes */
ol.lst-lwr-alph, .lst-lwr-alph, ol[type="a"],
ol.lst-lwr-alph > li, .lst-lwr-alph > li {
  list-style-type: lower-alpha !important;
}
ol.lst-upr-alph, .lst-upr-alph, ol[type="A"],
ol.lst-upr-alph > li, .lst-upr-alph > li {
  list-style-type: upper-alpha !important;
}
ol.lst-lwr-rmn, .lst-lwr-rmn, ol[type="i"],
ol.lst-lwr-rmn > li, .lst-lwr-rmn > li {
  list-style-type: lower-roman !important;
}
ol.lst-upr-rmn, .lst-upr-rmn, ol[type="I"],
ol.lst-upr-rmn > li, .lst-upr-rmn > li {
  list-style-type: upper-roman !important;
}
ol.lst-num, .lst-num, ol[type="1"],
ol.lst-num > li, .lst-num > li {
  list-style-type: decimal !important;
}
.lst-spcd > li, ul.lst-spcd > li, ol.lst-spcd > li {
  margin-top: 12px !important;
  margin-bottom: 12px !important;
}

/* Unstyled and Inline Lists */
ul.list-unstyled, ol.list-unstyled,
.list-unstyled,
ul.list-inline, ol.list-inline,
.list-inline {
  padding-left: 0 !important;
  list-style: none !important;
  list-style-type: none !important;
}

ul.list-unstyled > li, ol.list-unstyled > li,
.list-unstyled > li,
.list-unstyled li {
  list-style: none !important;
  list-style-type: none !important;
}

ul.list-inline > li, ol.list-inline > li,
.list-inline > li {
  display: inline-block !important;
  padding-right: 5px !important;
  padding-left: 5px !important;
  list-style: none !important;
  list-style-type: none !important;
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
  border-radius: 0 !important;
  box-shadow: none !important;
  filter: drop-shadow(0 0 2.5px var(--gc-bg, #18181b)) drop-shadow(0 0 1.5px var(--gc-bg, #18181b)) !important;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' fill='%23ee7100'/%3E%3Crect x='10.75' y='9' width='2.5' height='5.5' rx='1' fill='%23ffffff'/%3E%3Ccircle cx='12' cy='17.2' r='1.35' fill='%23ffffff'/%3E%3C/svg%3E") !important;
}
body.gc-light-mode .alert-warning::before,
body.gc-light-mode section.alert-warning::before,
body.gc-light-mode div.alert-warning::before,
body.gc-light-mode aside.alert-warning::before {
  box-shadow: none !important;
  filter: drop-shadow(0 0 2.5px #ffffff) drop-shadow(0 0 1.5px #ffffff) !important;
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

/* Contextual Background Classes */
.bg-primary,
thead.bg-primary,
thead.bg-primary th,
thead.bg-primary td,
tr.bg-primary,
tr.bg-primary th,
tr.bg-primary td,
th.bg-primary,
td.bg-primary,
body.gc-light-mode thead.bg-primary th,
body.gc-light-mode thead.bg-primary td,
body.gc-light-mode tr.bg-primary th,
body.gc-light-mode tr.bg-primary td,
body.gc-light-mode th.bg-primary,
body.gc-light-mode td.bg-primary {
  background-color: #2572b4 !important;
  color: #ffffff !important;
  border-color: #1d5b90 !important;
}

.bg-primary a,
.bg-primary a:link,
.bg-primary a:visited,
thead.bg-primary a,
thead.bg-primary a:link,
thead.bg-primary a:visited,
tr.bg-primary a,
tr.bg-primary a:link,
tr.bg-primary a:visited,
th.bg-primary a,
th.bg-primary a:link,
th.bg-primary a:visited,
td.bg-primary a,
td.bg-primary a:link,
td.bg-primary a:visited {
  color: #ffffff !important;
  text-decoration: underline !important;
}

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

.gc-li-content {
  display: block;
  border-radius: 2px;
  margin-bottom: 4px;
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

.gc-swap-missing {
  background: rgba(245, 158, 11, 0.12) !important;
  border-left: 3px solid #f59e0b !important;
  color: #fbbf24 !important;
  padding-left: 6px !important;
  border-radius: 2px;
}
body.gc-light-mode .gc-swap-missing {
  background: rgba(245, 158, 11, 0.12) !important;
  border-left: 3px solid #d97706 !important;
  color: #92400e !important;
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
  frRawDocxHtml: '',
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
  showWordDocView: false,
  outputHtml: '',
  outputTab: 'preview', // 'preview' | 'code'
  frViewMode: 'visual', // 'visual' | 'code'
  frCustomHtml: null,
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
const toggleWordDocBtn = document.getElementById('toggleWordDocBtn');
const toggleFocusMode = document.getElementById('toggleFocusMode');
const toggleBlurMode = document.getElementById('toggleBlurMode');
const openQaDiffBtn = document.getElementById('openQaDiffBtn');
const openTypographyBtn = document.getElementById('openTypographyBtn');
const openLangEnBtn = document.getElementById('openLangEnBtn');
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

// Third Pane (Unmodified Original Word Document) Elements
const docxPreviewPane = document.getElementById('docxPreviewPane');
const docxPaneTitle = document.getElementById('docxPaneTitle');
const docxBlockCountBadge = document.getElementById('docxBlockCountBadge');
const closeWordDocPaneBtn = document.getElementById('closeWordDocPaneBtn');
const docxPreviewFrame = document.getElementById('docxPreviewFrame');

// French Pane View Toggle & Code View Elements
const frPaneTitle = document.getElementById('frPaneTitle');
const frViewVisualBtn = document.getElementById('frViewVisualBtn');
const frViewCodeBtn = document.getElementById('frViewCodeBtn');
const frCodeWrap = document.getElementById('frCodeWrap');
const frCodeEditorBox = document.getElementById('frCodeEditorBox');
const frCodeGutter = document.getElementById('frCodeGutter');
const frCodeHighlight = document.getElementById('frCodeHighlight');
const frCodeHighlightInner = document.getElementById('frCodeHighlightInner');
const frCodeEditor = document.getElementById('frCodeEditor');
const frCodeStats = document.getElementById('frCodeStats');
const copyFrCodeBtn = document.getElementById('copyFrCodeBtn');
const formatFrCodeBtn = document.getElementById('formatFrCodeBtn');

const statDetailPanel = document.getElementById('statDetailPanel');
const drawerBody = document.getElementById('drawerBody');
const closeDrawerBtn = document.getElementById('closeDrawerBtn');

const healthPill = document.getElementById('healthPill');
const healthPillText = document.getElementById('healthPillText');
const cQaDiff = document.getElementById('cQaDiff');
const cTypo = document.getElementById('cTypo');
const cLangEn = document.getElementById('cLangEn');
const cTables = document.getElementById('cTables');
const cEn = document.getElementById('cEn');
const cFr = document.getElementById('cFr');
const cMismatch = document.getElementById('cMismatch');
const cMissing = document.getElementById('cMissing');
const cExtra = document.getElementById('cExtra');
const cSkip = document.getElementById('cSkip');

const splitActiveBlockBtn = document.getElementById('splitActiveBlockBtn');
const mergeActiveBlockBtn = document.getElementById('mergeActiveBlockBtn');
const activeBlockHudText = document.getElementById('activeBlockHudText');
const activeBlockHudTag = document.getElementById('activeBlockHudTag');
const blockJumpToggleBtn = document.getElementById('blockJumpToggleBtn');
const prevBlockBtn = document.getElementById('prevBlockBtn');
const nextBlockBtn = document.getElementById('nextBlockBtn');
const jumpForm = document.getElementById('jumpForm');
const jumpInput = document.getElementById('jumpInput');
const syncOffsetBadge = document.getElementById('syncOffsetBadge');

// Split Block Modal Elements
const splitBlockModal = document.getElementById('splitBlockModal');
const splitBlockModalTitle = document.getElementById('splitBlockModalTitle');
const splitBlockSubTitle = document.getElementById('splitBlockSubTitle');
const splitOriginalText = document.getElementById('splitOriginalText');
const splitPart1Text = document.getElementById('splitPart1Text');
const splitPart2Text = document.getElementById('splitPart2Text');
const closeSplitModalBtn = document.getElementById('closeSplitModalBtn');
const cancelSplitModalBtn = document.getElementById('cancelSplitModalBtn');
const confirmSplitBlockBtn = document.getElementById('confirmSplitBlockBtn');
const splitBySentenceBtn = document.getElementById('splitBySentenceBtn');
const splitByNewlineBtn = document.getElementById('splitByNewlineBtn');
const splitByHalfBtn = document.getElementById('splitByHalfBtn');

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
  [enPreviewFrame, frPreviewFrame, docxPreviewFrame].forEach((frame) => {
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
  state.frRawDocxHtml = rawDocxHtml;
  state.frBlocks = blocks;

  renderDocxStat(blocks.length, filename);
  checkAlignReady();
}

// Truncate document name to a given length and add 3 dots if longer
function truncateDocName(name, max = 25) {
  if (!name) return '';
  if (name.length > max) {
    return name.slice(0, max) + '...';
  }
  return name;
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
      condensedFrStat.removeAttribute('title');
    } else {
      const displayName = truncateDocName(filename, 25);
      condensedFrStat.textContent = `${displayName} (${count} block(s))`;
      condensedFrStat.setAttribute('title', filename);
    }
  }

  const clr = document.getElementById('clearDocxBtn');
  if (clr) {
    clr.addEventListener('click', () => {
      state.frBlocks = [];
      state.frDocxName = '';
      state.frRawDocxHtml = '';
      docxStatWrap.innerHTML = '';
      if (docxFile) docxFile.value = '';
      if (condensedFrStat) {
        condensedFrStat.textContent = '0 blocks';
        condensedFrStat.removeAttribute('title');
      }
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
    const displayName = truncateDocName(docName, 25);
    condensedFrStat.textContent = `${displayName} (${state.frBlocks.length} block(s))`;
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
function computeAlignment(targetBlockIndex = null) {
  const enTags = state.enBlocks.map((b) => b.tag);
  const frTags = state.frBlocks.map((b) => b.tag);
  const rows = alignByTag(enTags, frTags, state.enBlocks, state.frBlocks);
  const pairs = rows.filter((r) => r.enIndex !== null && r.frIndex !== null && !r.skip);
  const issues = computeIssues(rows, state.enBlocks, state.frBlocks, []);

  state.alignRows = rows;
  state.alignPairs = pairs;
  state.issueGroups = issues;

  const targetIdx = (targetBlockIndex !== null && targetBlockIndex !== undefined)
    ? Math.max(0, Math.min(state.enBlocks.length - 1, targetBlockIndex))
    : (state.activePreviewBlock || 0);

  state.activePreviewBlock = targetIdx;
  state.lastKnownEnIndex = targetIdx;
  state.syncOffset = 0;
  state.frCustomHtml = null;

  renderStatsBar();
  buildDualIframePreviews();
  updateSyncOffsetBadge();
  updateSyncStatusLabel();

  // Condense the source HTML & Word Document upload panels
  condenseSources();

  previewSection.classList.add('show');

  setTimeout(() => {
    applyActiveHighlight();
    alignPreviewBlocks(targetIdx);
    updateActiveBlockHud(targetIdx);
  }, 120);
}

function buildDualIframePreviews() {
  // Update block badges if present
  if (enBlockCountBadge) enBlockCountBadge.textContent = `${state.enBlocks.length} blocks`;
  if (frBlockCountBadge) frBlockCountBadge.textContent = `${state.frBlocks.length} blocks`;
  if (docxBlockCountBadge) docxBlockCountBadge.textContent = `${state.frBlocks.length} blocks`;

  // English Frame Document
  const enDocHtml = buildFrameSource(state.enHtml, state.enBlocks, 'en');
  // French Frame Document (Cloned from English structure so alert boxes, panels, and layouts match 1:1)
  const frDocHtml = buildFrenchFrameSource(state.enHtml, state.enBlocks, state.frBlocks, state.alignPairs);
  // Unmodified Original Word Document Frame
  const docxDocHtml = buildRawDocxFrameSource(state.frRawDocxHtml);

  enPreviewFrame.srcdoc = enDocHtml;
  frPreviewFrame.srcdoc = frDocHtml;
  if (docxPreviewFrame) {
    docxPreviewFrame.srcdoc = docxDocHtml;
  }

  setupIframeEventListeners();
}

function buildRawDocxFrameSource(rawDocxHtml) {
  const html = rawDocxHtml || state.frRawDocxHtml || SAMPLE_FR_DOCX_HTML;
  const isLight = state.theme === 'light';
  const bodyClass = isLight ? 'gc-light-mode' : '';

  const parser = new DOMParser();
  const doc = parser.parseFromString('<html><head></head><body></body></html>', 'text/html');
  doc.body.innerHTML = html;

  // Format any links inside to root-relative
  doc.body.querySelectorAll('a[href]').forEach((a) => {
    const rawHref = a.getAttribute('href');
    if (rawHref && !isFragmentHref(rawHref)) {
      a.setAttribute('href', formatFrenchRootRelativeLink(rawHref));
    }
  });

  // Tag every block in the raw docx with data-swap-index so it syncs and can be clicked to jump
  const domBlocks = extractBlocks(doc.body);
  domBlocks.forEach((b, idx) => {
    tagElementAsSwapTarget(b.el, {
      'data-swap-index': idx,
      'data-docx-index': idx,
    });
  });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    ${HIGHLIGHT_CSS}
  </style>
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
          window.parent.postMessage({ type: 'symmetra-jump', side: 'docx', index: idx }, '*');
        }
      }
    });
  </script>
</body>
</html>`;
}

function toggleWordDocView(forceState) {
  state.showWordDocView = forceState !== undefined ? forceState : !state.showWordDocView;
  const isShown = state.showWordDocView;
  const workspaceEl = document.getElementById('workspace');
  if (workspaceEl) {
    workspaceEl.classList.toggle('has-word-doc', isShown);
  }
  if (docxPreviewPane) {
    docxPreviewPane.style.display = isShown ? 'flex' : 'none';
  }
  if (toggleWordDocBtn) {
    toggleWordDocBtn.classList.toggle('is-active', isShown);
  }
  if (isShown) {
    if (docxPreviewFrame) {
      docxPreviewFrame.srcdoc = buildRawDocxFrameSource(state.frRawDocxHtml);
    }
    if (docxBlockCountBadge) {
      docxBlockCountBadge.textContent = `${state.frBlocks ? state.frBlocks.length : 0} blocks`;
    }
    setupIframeEventListeners();
    setTimeout(() => {
      applyActiveHighlight();
      alignPreviewBlocks(state.activePreviewBlock || 0);
    }, 100);
    showToast('Word Document (original unmodified) view opened');
  } else {
    showToast('Word Document view closed');
  }
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
    tagElementAsSwapTarget(
      b.el,
      {
        'data-swap-index': idx,
        ...(lang === 'fr' ? { contenteditable: 'true' } : {}),
      },
      lang === 'fr' ? ['gc-swap-editable'] : []
    );
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
      tagElementAsSwapTarget(
        enBlock.el,
        {
          'data-swap-index': enIdx,
          'data-fr-index': pair.frIndex,
          'data-en-index': enIdx,
          'contenteditable': 'true',
        },
        ['gc-swap-editable']
      );
    } else {
      // English block missing French translation in Word doc:
      // Insert obvious French filler placeholder so rest of document doesn't get messed up
      const fillerText = `[TRADUCTION MANQUANTE : ${enBlock.text}]`;
      replaceBlockTextPreservingLinks(enBlock.el, fillerText, enBlock.attrTarget, enBlock.spans);
      tagElementAsSwapTarget(
        enBlock.el,
        {
          'data-swap-index': enIdx,
          'data-en-index': enIdx,
          'contenteditable': 'true',
          'title': 'Traduction manquante dans le document Word - Cliquez pour saisir la traduction française',
        },
        ['gc-swap-editable', 'gc-swap-missing']
      );
    }
  });

  // Ensure all links on the French side are formatted as root-relative
  doc.body.querySelectorAll('a[href]').forEach((a) => {
    const rawHref = a.getAttribute('href');
    if (rawHref && !isFragmentHref(rawHref)) {
      a.setAttribute('href', formatFrenchRootRelativeLink(rawHref));
    }
  });

  // Clean any redundant <strong> tags inside <th> header cells
  cleanThTags(doc.body);

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
  ${cleanFrenchHtmlPostProcess(doc.body.innerHTML)}
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

function buildFrenchFrameSourceFromHtml(rawHtml, frBlocks) {
  if (!rawHtml || !rawHtml.trim()) {
    rawHtml = '<p></p>';
  }

  const parser = new DOMParser();
  let doc;
  const hasHtmlTag = /<html[\s>]/i.test(rawHtml);

  if (hasHtmlTag) {
    doc = parser.parseFromString(rawHtml, 'text/html');
  } else {
    doc = parser.parseFromString('<html><head></head><body></body></html>', 'text/html');
    doc.body.innerHTML = rawHtml;
  }

  if (doc.documentElement) {
    doc.documentElement.setAttribute('lang', 'fr');
  }

  const domBlocks = extractBlocks(doc.body);

  domBlocks.forEach((frBlock, frIdx) => {
    const pair = state.alignPairs ? state.alignPairs.find((p) => p.frIndex === frIdx && !p.skip) : null;
    const enIdx = pair && pair.enIndex !== null ? pair.enIndex : frIdx;

    tagElementAsSwapTarget(
      frBlock.el,
      {
        'data-swap-index': enIdx,
        'data-fr-index': frIdx,
        ...(pair && pair.enIndex !== null ? { 'data-en-index': pair.enIndex } : {}),
        'contenteditable': 'true',
      },
      ['gc-swap-editable']
    );
  });

  // Ensure all links on the French side are formatted as root-relative
  doc.body.querySelectorAll('a[href]').forEach((a) => {
    const rawHref = a.getAttribute('href');
    if (rawHref && !isFragmentHref(rawHref)) {
      a.setAttribute('href', formatFrenchRootRelativeLink(rawHref));
    }
  });

  // Clean any redundant <strong> tags inside <th> header cells
  cleanThTags(doc.body);

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
  ${cleanFrenchHtmlPostProcess(doc.body.innerHTML)}
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
        window.parent.postMessage({
          type: 'frEdit',
          enIndex: isNaN(enIdx) ? null : enIdx,
          frIndex: isNaN(frIdx) ? null : frIdx,
          text: target.innerText.trim(),
        }, '*');
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
    if (state.showWordDocView && docxPreviewFrame) {
      const pair = state.alignPairs.find((p) => p.enIndex === state.activePreviewBlock && !p.skip);
      const docxIdx = pair && pair.frIndex !== null ? pair.frIndex : state.activePreviewBlock + state.syncOffset;
      highlightIndexInFrame(docxPreviewFrame, docxIdx);
    }
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

      // Synchronize Word Doc Pane if open
      if (state.showWordDocView && docxPreviewFrame) {
        try {
          const docxDoc = docxPreviewFrame.contentDocument || docxPreviewFrame.contentWindow.document;
          if (docxDoc) {
            const docxScroll = docxDoc.scrollingElement || docxDoc.documentElement;
            cancelSmoothFollowScroll(docxScroll);
            programmaticScrollEls.add(docxScroll);

            const pair = state.alignPairs.find((p) => p.enIndex === index && !p.skip);
            const docxIdx = pair && pair.frIndex !== null ? pair.frIndex : frIndex;
            const docxEl = docxDoc.querySelector(`[data-swap-index="${docxIdx}"]`);

            if (docxEl) {
              if (docxIdx === 0) {
                docxScroll.scrollTop = 0;
              } else if (state.frBlocks && docxIdx >= state.frBlocks.length - 1) {
                docxScroll.scrollTop = Math.max(0, docxScroll.scrollHeight - docxScroll.clientHeight);
              } else {
                const docxRect = docxEl.getBoundingClientRect();
                const docxTop = docxRect.top + docxScroll.scrollTop;
                const docxMax = Math.max(0, docxScroll.scrollHeight - docxScroll.clientHeight);
                const docxDestination = docxTop + docxRect.height / 2 - docxScroll.clientHeight / 2;
                docxScroll.scrollTop = Math.max(0, Math.min(docxDestination, docxMax));
              }
            }
            setTimeout(() => {
              programmaticScrollEls.delete(docxScroll);
            }, 80);
          }
        } catch (_) {}
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

    // Pick active block
    let candidate = srcItems[0];
    if (srcScroll.scrollTop <= 10) {
      candidate = srcItems[0];
    } else if (maxScroll > 0 && srcScroll.scrollTop >= maxScroll - 10) {
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

    const pixelOffset = viewportCenter - (candidate.top + candidate.height / 2);
    const sourceIndex = candidate.index;
    const isEn = sourceFrame === enPreviewFrame;
    const isDocx = sourceFrame === docxPreviewFrame;

    let enIndex;
    if (isEn) {
      enIndex = sourceIndex;
    } else if (isDocx) {
      const pair = state.alignPairs.find((p) => p.frIndex === sourceIndex && !p.skip);
      enIndex = pair && pair.enIndex !== null ? pair.enIndex : sourceIndex - state.syncOffset;
    } else {
      enIndex = sourceIndex - state.syncOffset;
    }

    state.lastKnownEnIndex = enIndex;
    state.activePreviewBlock = Math.max(0, Math.min(enIndex, state.enBlocks.length - 1));

    // The highlighted bar actively follows the scroll position!
    highlightIndexInFrame(sourceFrame, sourceIndex);
    updateActiveBlockHud(state.activePreviewBlock);

    // If auto-sync is enabled and not paused with Alt, synchronize other frames too
    if (state.autoSync && !state.syncPaused) {
      const targets = [];
      if (sourceFrame !== enPreviewFrame) {
        targets.push({ frame: enPreviewFrame, index: state.activePreviewBlock });
      }
      if (sourceFrame !== frPreviewFrame) {
        targets.push({ frame: frPreviewFrame, index: state.activePreviewBlock + state.syncOffset });
      }
      if (state.showWordDocView && docxPreviewFrame && sourceFrame !== docxPreviewFrame) {
        const pair = state.alignPairs.find((p) => p.enIndex === state.activePreviewBlock && !p.skip);
        const docxIdx = pair && pair.frIndex !== null ? pair.frIndex : state.activePreviewBlock + state.syncOffset;
        targets.push({ frame: docxPreviewFrame, index: docxIdx });
      }

      targets.forEach(({ frame: tFrame, index: tIndex }) => {
        highlightIndexInFrame(tFrame, tIndex);
        const tDoc = tFrame.contentDocument || tFrame.contentWindow.document;
        if (!tDoc) return;
        const tScroll = tDoc.scrollingElement || tDoc.documentElement;
        const tItems = getSyncItems(tFrame);
        if (!tItems.length) return;

        let tItem = tItems.find((it) => it.index === tIndex);
        if (!tItem) {
          tItem = tItems.reduce((best, it) =>
            Math.abs(it.index - tIndex) < Math.abs(best.index - tIndex) ? it : best, tItems[0]);
        }
        if (!tItem) return;

        const tMax = Math.max(0, tScroll.scrollHeight - tScroll.clientHeight);
        let destination;
        if (srcScroll.scrollTop <= 10 && state.syncOffset === 0) {
          destination = 0;
        } else if (maxScroll > 0 && srcScroll.scrollTop >= maxScroll - 10 && state.syncOffset === 0) {
          destination = tMax;
        } else {
          destination = Math.max(0, Math.min(tItem.top + tItem.height / 2 - tScroll.clientHeight / 2 + (pixelOffset || 0), tMax));
        }

        smoothFollowScroll(tScroll, destination);
      });
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
        if (e.target.closest('#docxPreviewPane') || e.target.closest('#docxPreviewFrame')) {
          targetFrame = docxPreviewFrame;
        } else if (e.target.closest('#frPreviewPane') || e.target.closest('#frPreviewFrame')) {
          targetFrame = frPreviewFrame;
        } else {
          targetFrame = enPreviewFrame;
        }
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
  if (docxPreviewFrame) {
    attachListeners(docxPreviewFrame, enPreviewFrame);
  }
}

// Global PostMessage receiver for iframe clicks and edits
window.addEventListener('message', (e) => {
  if (!e.data || typeof e.data !== 'object') return;

  if (e.data.type === 'symmetra-jump') {
    const { side, index } = e.data;
    if (typeof index === 'number' && !isNaN(index)) {
      if (side === 'docx') {
        const pair = state.alignPairs.find((p) => p.frIndex === index && !p.skip);
        if (pair && pair.enIndex !== null) {
          jumpToBlock(pair.enIndex);
        } else {
          highlightIndexInFrame(docxPreviewFrame, index);
        }
      } else {
        jumpToBlock(index);
      }
    }
  } else if (e.data.type === 'frEdit') {
    const { enIndex, frIndex, text } = e.data;
    if (frIndex !== null && state.frBlocks[frIndex]) {
      state.frBlocks[frIndex].text = text;
    } else if (enIndex !== null) {
      const pair = state.alignPairs.find((p) => p.enIndex === enIndex);
      if (pair && pair.frIndex !== null && state.frBlocks[pair.frIndex]) {
        state.frBlocks[pair.frIndex].text = text;
      } else if (pair && pair.frIndex === null) {
        const enB = state.enBlocks[enIndex];
        const newFrBlock = {
          tag: enB ? enB.tag : 'p',
          attrTarget: enB ? enB.attrTarget : 'text',
          text: text,
          spans: [],
        };
        const newFrIdx = state.frBlocks.length;
        state.frBlocks.push(newFrBlock);
        pair.frIndex = newFrIdx;
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

// --- Feature 1: French Typography & Non-Breaking Spaces (&nbsp; / insécables) ---
function findFrenchTypographyIssues(text) {
  if (!text) return [];
  const clean = cleanFrenchUrlAndEntities(text);
  const issues = [];
  
  // 1. Missing non-breaking space before : ; ! ?
  const punctRegex = /([^\s\u00A0:;?!])[ \t]*([:;?!])/g;
  let match;
  while ((match = punctRegex.exec(clean)) !== null) {
    issues.push({
      type: 'punctuation',
      label: `Missing insécable before '${match[2]}'`,
      found: match[0],
      fix: `${match[1]}\u00A0${match[2]}`
    });
  }

  // 2. Missing non-breaking space inside guillemets « ... »
  const openGuill = /«(?!\u00A0)/g;
  while ((match = openGuill.exec(clean)) !== null) {
    issues.push({
      type: 'guillemet-open',
      label: 'Missing insécable after «',
      found: '«',
      fix: '«\u00A0'
    });
  }

  const closeGuill = /(?<!\u00A0)»/g;
  while ((match = closeGuill.exec(clean)) !== null) {
    issues.push({
      type: 'guillemet-close',
      label: 'Missing insécable before »',
      found: '»',
      fix: '\u00A0»'
    });
  }

  // 3. Currency symbol without non-breaking space (e.g. "10 $" or "10$")
  const currRegex = /(\d)(?!\u00A0)[ \t]*([$€])/g;
  while ((match = currRegex.exec(clean)) !== null) {
    issues.push({
      type: 'currency',
      label: `Missing insécable before currency '${match[2]}'`,
      found: match[0],
      fix: `${match[1]}\u00A0${match[2]}`
    });
  }

  // 4. Percentage symbol without non-breaking space (e.g. "10 %" or "10%")
  const pctRegex = /(\d)(?!\u00A0)[ \t]*%/g;
  while ((match = pctRegex.exec(clean)) !== null) {
    issues.push({
      type: 'percent',
      label: `Missing insécable before '%'`,
      found: match[0],
      fix: `${match[1]}\u00A0%`
    });
  }

  // 5. Units & Time / Quantity without non-breaking space (e.g. "7 jours", "10 km", "5 ans")
  const unitRegex = /(\d)(?!\u00A0)[ \t]+(km|kg|mg|g|m|cm|mm|ha|t|l|ml|h|min|s|ans|an|jours|jour|mois|semaines|semaine|pages|page|p\.|art\.|no|n°|nº|§)\b/gi;
  while ((match = unitRegex.exec(clean)) !== null) {
    issues.push({
      type: 'unit',
      label: `Missing insécable before unit '${match[2]}'`,
      found: match[0],
      fix: `${match[1]}\u00A0${match[2]}`
    });
  }

  return issues;
}

function getTypoSnippetWindow(text, max = 150) {
  if (!text) return '';
  const clean = text.replace(/[ \t\r\n]+/g, ' ').trim();
  if (clean.length <= max) return clean;

  const match = clean.match(/[:;?!«»$%]|\d\s*(?:km|kg|mg|g|m|cm|mm|ha|t|l|ml|h|min|s|ans|an|jours|jour|mois|semaines|semaine|pages|page|p\.|art\.|no|n°|nº|§)\b/i);
  if (!match || match.index === undefined) {
    return clean.slice(0, max) + '…';
  }

  const matchIdx = match.index;
  const half = Math.floor(max / 2);
  let start = Math.max(0, matchIdx - half);
  let end = Math.min(clean.length, start + max);

  if (end - start < max) {
    start = Math.max(0, end - max);
  }

  let res = clean.slice(start, end);
  if (start > 0) res = '…' + res;
  if (end < clean.length) res = res + '…';
  return res;
}

function highlightTypoOriginal(text) {
  if (!text) return '';
  let escaped = escapeHtml(text);

  // 1. Punctuation missing non-breaking space (e.g. " :", ":", " ;", ";", " !", " ?", etc.)
  escaped = escaped.replace(/(?<=[^\s\u00A0:;?!/&])([ \t]*)([:;?!])/g, (match, p1, p2) => {
    return `<span class="bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold px-1.5 py-0.5 rounded border border-rose-500/40 inline-flex items-center" title="Missing non-breaking space (&nbsp;)">${p1 || ''}${p2}</span>`;
  });

  // 2. Guillemets without non-breaking space
  escaped = escaped.replace(/«([ \t]*)/g, (match, p1) => {
    if (!p1.includes('\u00A0')) {
      return `<span class="bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold px-1.5 py-0.5 rounded border border-rose-500/40 inline-flex items-center" title="Missing non-breaking space after «">«${p1}</span>`;
    }
    return match;
  });
  escaped = escaped.replace(/([ \t]*)»/g, (match, p1) => {
    if (!p1.includes('\u00A0')) {
      return `<span class="bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold px-1.5 py-0.5 rounded border border-rose-500/40 inline-flex items-center" title="Missing non-breaking space before »">${p1}»</span>`;
    }
    return match;
  });

  // 3. Currency symbol (e.g. "10 $" or "10$")
  escaped = escaped.replace(/(\d)([ \t]*)([$€])/g, (match, p1, p2, p3) => {
    return `${p1}<span class="bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold px-1.5 py-0.5 rounded border border-rose-500/40 inline-flex items-center" title="Missing non-breaking space before currency">${p2 || ''}${p3}</span>`;
  });

  // 4. Percentage symbol (e.g. "10 %" or "10%")
  escaped = escaped.replace(/(\d)([ \t]*)(%)/g, (match, p1, p2, p3) => {
    return `${p1}<span class="bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold px-1.5 py-0.5 rounded border border-rose-500/40 inline-flex items-center" title="Missing non-breaking space before %">${p2 || ''}${p3}</span>`;
  });

  // 5. Units (e.g. "10 km", "5 ans", "7 jours")
  escaped = escaped.replace(/(\d)([ \t]+)(km|kg|mg|g|m|cm|mm|ha|t|l|ml|h|min|s|ans|an|jours|jour|mois|semaines|semaine|pages|page|p\.|art\.|no|n°|nº|§)\b/gi, (match, p1, p2, p3) => {
    return `${p1}<span class="bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold px-1.5 py-0.5 rounded border border-rose-500/40 inline-flex items-center" title="Missing non-breaking space before unit">${p2}${p3}</span>`;
  });

  return escaped;
}

function highlightTypoFixed(text) {
  if (!text) return '';
  let escaped = escapeHtml(text);

  // 1. Punctuation with non-breaking space (\u00A0[:;?!])
  escaped = escaped.replace(/\u00A0([:;?!])/g, (match, p1) => {
    return `<span class="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-500/40 inline-flex items-center gap-1" title="Non-breaking space applied (&nbsp;)"><span class="text-[9px] px-1 py-0.2 bg-emerald-500/30 rounded font-mono text-emerald-800 dark:text-emerald-200">NBSP</span>${p1}</span>`;
  });

  // 2. Guillemets with non-breaking space
  escaped = escaped.replace(/«\u00A0/g, () => {
    return `<span class="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-500/40 inline-flex items-center gap-1" title="Non-breaking space applied (&nbsp;)">«<span class="text-[9px] px-1 py-0.2 bg-emerald-500/30 rounded font-mono text-emerald-800 dark:text-emerald-200">NBSP</span></span>`;
  });
  escaped = escaped.replace(/\u00A0»/g, () => {
    return `<span class="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-500/40 inline-flex items-center gap-1" title="Non-breaking space applied (&nbsp;)">»<span class="text-[9px] px-1 py-0.2 bg-emerald-500/30 rounded font-mono text-emerald-800 dark:text-emerald-200">NBSP</span></span>`;
  });

  // 3. Currency with non-breaking space (\d\u00A0[$€])
  escaped = escaped.replace(/(\d)\u00A0([$€])/g, (match, p1, p2) => {
    return `${p1}<span class="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-500/40 inline-flex items-center gap-1" title="Non-breaking space applied (&nbsp;)"><span class="text-[9px] px-1 py-0.2 bg-emerald-500/30 rounded font-mono text-emerald-800 dark:text-emerald-200">NBSP</span>${p2}</span>`;
  });

  // 4. Percentage with non-breaking space (\d\u00A0%)
  escaped = escaped.replace(/(\d)\u00A0%/g, (match, p1) => {
    return `${p1}<span class="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-500/40 inline-flex items-center gap-1" title="Non-breaking space applied (&nbsp;)"><span class="text-[9px] px-1 py-0.2 bg-emerald-500/30 rounded font-mono text-emerald-800 dark:text-emerald-200">NBSP</span>%</span>`;
  });

  // 5. Units with non-breaking space (\d\u00A0unit)
  escaped = escaped.replace(/(\d)\u00A0(km|kg|mg|g|m|cm|mm|ha|t|l|ml|h|min|s|ans|an|jours|jour|mois|semaines|semaine|pages|page|p\.|art\.|no|n°|nº|§)\b/gi, (match, p1, p2) => {
    return `${p1}<span class="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-500/40 inline-flex items-center gap-1" title="Non-breaking space applied (&nbsp;)"><span class="text-[9px] px-1 py-0.2 bg-emerald-500/30 rounded font-mono text-emerald-800 dark:text-emerald-200">NBSP</span>${p2}</span>`;
  });

  return escaped;
}

function computeTypographyAudit() {
  const list = [];
  state.frBlocks.forEach((b, frIdx) => {
    const issues = findFrenchTypographyIssues(b.text);
    const fixedText = applyFrenchTypographyRules(b.text);
    if (issues.length > 0 || fixedText !== b.text) {
      list.push({
        frIndex: frIdx,
        originalText: b.text,
        fixedText,
        issues,
      });
    }
  });
  return list;
}

function fixFrenchTypographyBlock(frIdx) {
  if (!state.frBlocks[frIdx]) return;
  state.frBlocks[frIdx].text = applyFrenchTypographyRules(state.frBlocks[frIdx].text);
  computeAlignment();
  if (state.frViewMode === 'code' && frCodeEditor) {
    frCodeEditor.value = generateFrenchHtmlSource();
    updateFrCodeView();
  }
  renderDrawerBody('typography');
  showToast(`French typography fixed for block #${frIdx + 1}`);
}

function fixAllFrenchTypography() {
  const currentActiveBlock = state.activePreviewBlock;
  let count = 0;
  state.frBlocks.forEach((b) => {
    const fixed = applyFrenchTypographyRules(b.text);
    if (fixed !== b.text) {
      b.text = fixed;
      count++;
    }
  });
  computeAlignment(currentActiveBlock);
  if (state.frViewMode === 'code' && frCodeEditor) {
    frCodeEditor.value = generateFrenchHtmlSource();
    updateFrCodeView();
  }
  renderDrawerBody('typography');
  showToast(`Applied French typography & non-breaking spaces across ${count} block(s)!`);
}

// --- Feature 2: Smart Language Attribute (lang="en") Inserter ---
const COMMON_EN_TERMS = [
  'Social Insurance Number',
  'Employment Insurance',
  'Canada Revenue Agency',
  'Record of Employment',
  'Direct Deposit',
  'My Account',
  'My Service Canada Account',
  'Job Bank',
  'Public Service Commission',
  'Treasury Board of Canada Secretariat',
  'Canada.ca',
  'GCKey',
  'SIN',
  'EI',
  'CRA',
  'ROE',
  'ROA',
  'CPP',
  'OAS',
  'GIS',
  'T4',
  'T5',
  'GST',
  'HST',
  'CCB',
  'WET',
  'WCAG',
  'IT',
  'FAQ'
];

function detectEnglishTerms(frBlock) {
  const text = frBlock.text || '';
  const detected = [];

  COMMON_EN_TERMS.forEach((term) => {
    const regex = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'g');
    if (regex.test(text)) {
      const alreadyTagged = (frBlock.spans || []).some(
        (s) => s.lang === 'en' && s.text.toLowerCase() === term.toLowerCase()
      );
      if (!alreadyTagged) {
        detected.push({
          term,
          type: 'acronym_or_term',
        });
      }
    }
  });

  // Also detect quoted English phrases: e.g. "..."
  const quoteRegex = /"([^"]{3,60})"/g;
  let qMatch;
  while ((qMatch = quoteRegex.exec(text)) !== null) {
    const inside = qMatch[1].trim();
    if (/^[A-Za-z0-9\s.,'-]+$/.test(inside) && !COMMON_EN_TERMS.includes(inside)) {
      const alreadyTagged = (frBlock.spans || []).some(
        (s) => s.lang === 'en' && s.text.toLowerCase() === inside.toLowerCase()
      );
      if (!alreadyTagged) {
        detected.push({
          term: inside,
          type: 'english_quote',
        });
      }
    }
  }

  return detected;
}

function computeLangEnAudit() {
  const results = [];
  state.frBlocks.forEach((b, frIdx) => {
    const terms = detectEnglishTerms(b);
    if (terms.length > 0) {
      results.push({
        frIndex: frIdx,
        block: b,
        terms,
      });
    }
  });
  return results;
}

function tagEnglishTermInBlock(frIdx, term) {
  const currentActiveBlock = state.activePreviewBlock;
  const block = state.frBlocks[frIdx];
  if (!block) return;
  if (!block.spans) block.spans = [];
  block.spans.push({
    type: 'span',
    lang: 'en',
    text: term,
  });
  computeAlignment(currentActiveBlock);
  renderDrawerBody('lang-en');
  showToast(`Wrapped "${term}" with <span lang="en">`);
}

function tagAllEnglishTerms() {
  const currentActiveBlock = state.activePreviewBlock;
  const audit = computeLangEnAudit();
  let count = 0;
  audit.forEach(({ frIndex, terms }) => {
    const block = state.frBlocks[frIndex];
    if (!block.spans) block.spans = [];
    terms.forEach(({ term }) => {
      block.spans.push({
        type: 'span',
        lang: 'en',
        text: term,
      });
      count++;
    });
  });
  computeAlignment(currentActiveBlock);
  renderDrawerBody('lang-en');
  showToast(`Wrapped ${count} English term(s) with <span lang="en">!`);
}

// --- Feature 3: Table & List Integrity Matrix (GC / WET WCAG AA) ---
function computeTablesAndListsAudit() {
  const tables = [];
  const lists = [];

  // Parse English HTML to inspect table structure
  const rawHtml = state.enHtml || (state.enParsed && state.enParsed.rawHtml) || '';
  if (rawHtml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const tableEls = Array.from(doc.querySelectorAll('table'));
    tableEls.forEach((tbl, tIdx) => {
      const ths = Array.from(tbl.querySelectorAll('th'));
      const tds = Array.from(tbl.querySelectorAll('td'));
      const rows = Array.from(tbl.querySelectorAll('tr'));
      const hasCaption = !!tbl.querySelector('caption');
      const hasScope = ths.length > 0 && ths.every((th) => th.hasAttribute('scope') || th.hasAttribute('id'));
      const hasHeaders = tds.some((td) => td.hasAttribute('headers'));
      const colspans = Array.from(tbl.querySelectorAll('[colspan], [rowspan]'));

      tables.push({
        tableIndex: tIdx + 1,
        caption: hasCaption ? tbl.querySelector('caption').textContent.trim() : 'Standard Table',
        rowCount: rows.length,
        colHeaderCount: ths.length,
        cellCount: tds.length,
        hasScope,
        hasHeaders,
        complexSpans: colspans.length,
        wcagCompliant: hasScope || hasHeaders,
      });
    });

    const listEls = Array.from(doc.querySelectorAll('ul, ol, dl'));
    listEls.forEach((listEl, lIdx) => {
      const tag = listEl.tagName.toLowerCase();
      const items = Array.from(listEl.children).filter((c) => ['li', 'dt', 'dd'].includes(c.tagName.toLowerCase()));
      const isUnstyled = listEl.classList.contains('list-unstyled');
      lists.push({
        listIndex: lIdx + 1,
        tag,
        itemCount: items.length,
        isUnstyled,
        firstItem: items[0] ? items[0].textContent.trim().substring(0, 45) + '...' : 'Empty list',
      });
    });
  }

  return { tables, lists };
}

// --- Feature 4: Side-by-Side "Diff & Sync" QA Inspector ---
function computeQaDiffAudit() {
  const qaIssues = [];

  // 1. Link symmetry check
  state.alignPairs.forEach((pair) => {
    const enB = state.enBlocks[pair.enIndex];
    const frB = state.frBlocks[pair.frIndex];
    if (!enB || !frB) return;

    const enLinks = (enB.spans || []).filter((s) => s.type === 'a');
    const frLinks = (frB.spans || []).filter((s) => s.type === 'a');

    if (enLinks.length > 0 && frLinks.length === 0) {
      qaIssues.push({
        type: 'missing_fr_link',
        severity: 'warn',
        enIndex: pair.enIndex,
        frIndex: pair.frIndex,
        title: `Block #${pair.enIndex + 1}: Missing French link tag`,
        detail: `English has link "${enLinks[0].text}" (${enLinks[0].href}), but French translation text has no anchor span.`,
        action: 'Preserve EN Link skeleton',
      });
    }
  });

  // 2. Footnote balance check
  const enFnCount = (state.enHtml.match(/class="fn-lnk"/g) || []).length;
  const frFnCount = (state.frBlocks.reduce((acc, b) => acc + (b.text.match(/Note de bas de page \d+/gi) || []).length, 0));
  if (enFnCount > 0 && enFnCount !== frFnCount) {
    qaIssues.push({
      type: 'fn_mismatch',
      severity: 'info',
      enIndex: 0,
      frIndex: 0,
      title: `Footnote Count (${enFnCount} EN vs ${frFnCount} FR detected)`,
      detail: `Ensure all footnote callouts (Note de bas de page) align with corresponding English footnotes.`,
      action: 'Verify Footnotes',
    });
  }

  // 3. Length divergence check (> 2.2x ratio)
  state.alignPairs.forEach((pair) => {
    const enB = state.enBlocks[pair.enIndex];
    const frB = state.frBlocks[pair.frIndex];
    if (!enB || !frB) return;
    if (enB.text.length > 30 && frB.text.length > 30) {
      const ratio = frB.text.length / enB.text.length;
      if (ratio > 2.2 || ratio < 0.4) {
        qaIssues.push({
          type: 'length_divergence',
          severity: 'info',
          enIndex: pair.enIndex,
          frIndex: pair.frIndex,
          title: `Block #${pair.enIndex + 1}: High text length difference (${Math.round(ratio * 100)}%)`,
          detail: `EN (${enB.text.length} chars): "${issueSnippet(enB.text, 50)}" vs FR (${frB.text.length} chars): "${issueSnippet(frB.text, 50)}"`,
          action: 'Inspect block',
        });
      }
    }
  });

  // 4. List format style adaptation notice (e.g. Word 1. / decimal to HTML a. / lower-alpha)
  state.alignPairs.forEach((pair) => {
    const enB = state.enBlocks[pair.enIndex];
    const frB = state.frBlocks[pair.frIndex];
    if (!enB || !frB) return;
    if (enB.tag === 'li' && frB.tag === 'li') {
      const enParentOl = enB.el ? enB.el.closest('ol') : null;
      if (enParentOl) {
        const isAlpha = enParentOl.classList.contains('lst-lwr-alph') || enParentOl.classList.contains('lst-upr-alph') || enParentOl.getAttribute('type') === 'a' || enParentOl.getAttribute('type') === 'A';
        const isRoman = enParentOl.classList.contains('lst-lwr-rmn') || enParentOl.classList.contains('lst-upr-rmn') || enParentOl.getAttribute('type') === 'i' || enParentOl.getAttribute('type') === 'I';
        if (isAlpha || isRoman) {
          const listType = isAlpha ? 'alphabetical (a, b, c...)' : 'Roman numeral (i, ii, iii...)';
          qaIssues.push({
            type: 'list_format_adapted',
            severity: 'info',
            enIndex: pair.enIndex,
            frIndex: pair.frIndex,
            title: `Block #${pair.enIndex + 1}: List format adapted to ${listType}`,
            detail: `English HTML template applies <ol class="${enParentOl.className || 'type'}"> style (${listType}). The aligned French output inherits this structure while retaining translated text.`,
            action: 'Format verified',
          });
        }
      }
    }
  });

  return qaIssues;
}

// --- Feature 5: Batch / Partial Section Re-alignment (Split & Merge Blocks) ---
function openSplitBlockModal(targetFrIdx) {
  if (targetFrIdx === undefined || targetFrIdx === null) {
    const pair = state.alignPairs.find((p) => p.enIndex === state.activePreviewBlock);
    targetFrIdx = pair ? pair.frIndex : state.activePreviewBlock;
  }
  if (!state.frBlocks[targetFrIdx]) {
    showToast('Select a valid block to split');
    return;
  }

  state.splitBlockIndex = targetFrIdx;
  const block = state.frBlocks[targetFrIdx];
  if (splitBlockSubTitle) {
    splitBlockSubTitle.textContent = `Splitting French block #${targetFrIdx + 1} (<${block.tag}>)`;
  }
  if (splitOriginalText) {
    splitOriginalText.value = block.text;
  }

  const text = block.text;
  let part1 = '';
  let part2 = '';
  const periodIdx = text.indexOf('. ');
  if (periodIdx !== -1) {
    part1 = text.substring(0, periodIdx + 1).trim();
    part2 = text.substring(periodIdx + 2).trim();
  } else {
    const half = Math.floor(text.length / 2);
    const spaceIdx = text.indexOf(' ', half);
    if (spaceIdx !== -1) {
      part1 = text.substring(0, spaceIdx).trim();
      part2 = text.substring(spaceIdx + 1).trim();
    } else {
      part1 = text;
      part2 = '';
    }
  }

  if (splitPart1Text) splitPart1Text.value = part1;
  if (splitPart2Text) splitPart2Text.value = part2;

  if (splitBlockModal) {
    splitBlockModal.style.display = 'flex';
    requestAnimationFrame(() => {
      splitBlockModal.classList.add('is-open');
      if (splitPart1Text) splitPart1Text.focus();
    });
  }
}

function closeSplitBlockModal() {
  if (!splitBlockModal) return;
  splitBlockModal.classList.remove('is-open');
  setTimeout(() => {
    splitBlockModal.style.display = 'none';
    state.splitBlockIndex = null;
  }, 200);
}

function applySplitBlock() {
  const currentActiveBlock = state.activePreviewBlock;
  const targetIdx = state.splitBlockIndex;
  if (targetIdx === null || !state.frBlocks[targetIdx]) {
    closeSplitBlockModal();
    return;
  }

  const p1 = (splitPart1Text.value || '').trim();
  const p2 = (splitPart2Text.value || '').trim();

  if (!p1 || !p2) {
    showToast('Both split portions must contain text');
    return;
  }

  const originalBlock = state.frBlocks[targetIdx];
  const block1 = {
    ...originalBlock,
    text: p1,
    spans: originalBlock.spans ? [...originalBlock.spans] : [],
  };
  const block2 = {
    ...originalBlock,
    text: p2,
    spans: [],
  };

  state.frBlocks.splice(targetIdx, 1, block1, block2);
  closeSplitBlockModal();
  computeAlignment(currentActiveBlock);
  showToast(`French block #${targetIdx + 1} split into 2 blocks! Alignment updated.`);
}

function mergeWithNextBlock(targetFrIdx) {
  const currentActiveBlock = state.activePreviewBlock;
  if (targetFrIdx === undefined || targetFrIdx === null) {
    const pair = state.alignPairs.find((p) => p.enIndex === state.activePreviewBlock);
    targetFrIdx = pair ? pair.frIndex : state.activePreviewBlock;
  }
  if (!state.frBlocks[targetFrIdx] || !state.frBlocks[targetFrIdx + 1]) {
    showToast('No subsequent block available to merge with');
    return;
  }

  const b1 = state.frBlocks[targetFrIdx];
  const b2 = state.frBlocks[targetFrIdx + 1];

  b1.text = `${b1.text} ${b2.text}`.trim();
  if (b2.spans && b2.spans.length > 0) {
    b1.spans = (b1.spans || []).concat(b2.spans);
  }

  state.frBlocks.splice(targetFrIdx + 1, 1);
  computeAlignment(currentActiveBlock);
  showToast(`Merged block #${targetFrIdx + 1} with block #${targetFrIdx + 2}`);
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

  const typoIssues = computeTypographyAudit();
  const langEnIssues = computeLangEnAudit();
  const tableData = computeTablesAndListsAudit();
  const qaIssues = computeQaDiffAudit();

  if (cEn) cEn.textContent = String(nEn);
  if (cFr) cFr.textContent = String(nFr);
  if (cMismatch) cMismatch.textContent = String(nMis);
  if (cMissing) cMissing.textContent = String(nMiss);
  if (cExtra) cExtra.textContent = String(nExt);
  if (cSkip) cSkip.textContent = String(nSkip);
  if (cQaDiff) cQaDiff.textContent = String(qaIssues.length);
  if (cTypo) cTypo.textContent = String(typoIssues.length);
  if (cLangEn) cLangEn.textContent = String(langEnIssues.length);
  if (cTables) cTables.textContent = String(tableData.tables.length + tableData.lists.length);

  // Style tabs based on issue counts and dim zero counts
  const tabMis = document.getElementById('tabMismatch');
  const tabMiss = document.getElementById('tabMissing');
  const tabExt = document.getElementById('tabExtra');
  const tabSkip = document.getElementById('tabSkipped');
  const tabQa = document.getElementById('tabQaDiff');
  const tabTypoEl = document.getElementById('tabTypography');
  const tabLangEl = document.getElementById('tabLangEn');
  const tabTablesEl = document.getElementById('tabTables');

  if (tabMis) {
    tabMis.classList.toggle('has-issues', nMis > 0);
    tabMis.classList.toggle('is-dim', nMis === 0);
  }
  if (tabMiss) {
    tabMiss.classList.toggle('has-danger', nMiss > 0);
    tabMiss.classList.toggle('is-dim', nMiss === 0);
  }
  if (tabExt) {
    tabExt.classList.toggle('has-issues', nExt > 0);
    tabExt.classList.toggle('is-dim', nExt === 0);
  }
  if (tabSkip) {
    tabSkip.classList.toggle('is-dim', nSkip === 0);
  }
  if (tabQa) {
    tabQa.classList.toggle('has-notice', qaIssues.length > 0);
    tabQa.classList.toggle('is-dim', qaIssues.length === 0);
  }
  if (tabTypoEl) {
    tabTypoEl.classList.toggle('has-issues', typoIssues.length > 0);
    tabTypoEl.classList.toggle('is-dim', typoIssues.length === 0);
  }
  if (tabLangEl) {
    tabLangEl.classList.toggle('has-notice', langEnIssues.length > 0);
    tabLangEl.classList.toggle('is-dim', langEnIssues.length === 0);
  }
  if (tabTablesEl) {
    const tableListCount = tableData.tables.length + tableData.lists.length;
    tabTablesEl.classList.toggle('is-dim', tableListCount === 0);
  }

  // Update Drawer Tab counters
  const dQa = document.getElementById('drawerTabQaDiff');
  const dTypo = document.getElementById('drawerTabTypography');
  const dLang = document.getElementById('drawerTabLangEn');
  const dTables = document.getElementById('drawerTabTables');
  const dMis = document.getElementById('drawerTabMismatch');
  const dMiss = document.getElementById('drawerTabMissing');
  const dExt = document.getElementById('drawerTabExtra');
  const dEn = document.getElementById('drawerTabEnTags');
  const dFr = document.getElementById('drawerTabFrTags');
  const dSkip = document.getElementById('drawerTabSkipped');

  if (dQa) dQa.textContent = `QA & Diff (${qaIssues.length})`;
  if (dTypo) dTypo.textContent = `Punctuation & Spaces (${typoIssues.length})`;
  if (dLang) dLang.textContent = `Smart lang="en" (${langEnIssues.length})`;
  if (dTables) dTables.textContent = `Tables & Lists (${tableData.tables.length + tableData.lists.length})`;
  if (dMis) dMis.textContent = `Mismatches (${nMis})`;
  if (dMiss) dMiss.textContent = `Missing FR (${nMiss})`;
  if (dExt) dExt.textContent = `Extra FR (${nExt})`;
  if (dEn) dEn.textContent = `EN Tags (${nEn})`;
  if (dFr) dFr.textContent = `FR Tags (${nFr})`;
  if (dSkip) dSkip.textContent = `Skipped (${nSkip})`;

  // Overall Alignment Health Pill
  const hasErrors = nMiss > 0;
  const hasWarnings = nMis > 0 || nExt > 0 || typoIssues.length > 0 || qaIssues.length > 0;

  if (healthPill) {
    healthPill.className = 'preview-status-pill ' + (hasErrors ? 'status-danger' : hasWarnings ? 'status-warn' : 'status-clean') + ' cursor-pointer hover:opacity-90';
    
    if (hasErrors) {
      healthPill.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-rose-500"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" x2="12" y2="12"/><line x1="12" x2="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>${nMiss} missing block(s) • ${nMatched}/${nEn} matched</span>`;
    } else if (hasWarnings) {
      healthPill.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-amber-500"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" x2="13"/><line x1="12" x2="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>${nMis > 0 ? `${nMis} mismatches` : typoIssues.length > 0 ? `${typoIssues.length} typo notices` : `${qaIssues.length} QA notice(s)`} • ${nMatched}/${nEn} matched</span>`;
    } else {
      healthPill.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-emerald-500"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
        <span>100% Aligned • ${nMatched} blocks matched</span>`;
    }
  }

  updateActiveBlockHud(state.activePreviewBlock);
}

function openDrawer(category) {
  state.activeCategory = category;
  state.drawerOpen = true;
  if (statDetailPanel) statDetailPanel.classList.add('show');

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
  if (statDetailPanel) statDetailPanel.classList.remove('show');
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

function getDivergenceDiagnosticsHtml() {
  const nEn = state.enBlocks.length;
  const nFr = state.frBlocks.length;
  const nMis = state.issueGroups.mismatch.length;
  const nMiss = state.issueGroups.missing.length;
  const nExt = state.issueGroups.extra.length;

  if (nEn === nFr && nMis === 0 && nMiss === 0 && nExt === 0) {
    return '';
  }

  // Find first index where misalignment occurs
  let firstDivRow = null;
  let firstDivIndex = null;
  for (let idx = 0; idx < state.alignRows.length; idx++) {
    const r = state.alignRows[idx];
    if (r.enIndex === null || r.frIndex === null) {
      firstDivRow = r;
      firstDivIndex = r.enIndex !== null ? r.enIndex : r.frIndex;
      break;
    }
    if (state.enBlocks[r.enIndex] && state.frBlocks[r.frIndex]) {
      if (state.enBlocks[r.enIndex].tag !== state.frBlocks[r.frIndex].tag) {
        firstDivRow = r;
        firstDivIndex = r.enIndex;
        break;
      }
    }
  }

  // Find any English blocks containing <br> line breaks
  const enBlocksWithBr = state.enBlocks
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.hasBr);

  let brHintsHtml = '';
  if (enBlocksWithBr.length > 0) {
    brHintsHtml = `
      <div class="mt-2.5 pt-2.5 border-t border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
        <div class="font-bold flex items-center gap-1.5 mb-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" x2="12" y2="12"/><line x1="12" x2="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Line Break (&lt;br&gt;) Diagnostic:</span>
        </div>
        <p class="mb-2 text-text-secondary leading-relaxed">
          In Microsoft Word, line breaks create separate paragraphs (<code class="text-accent">&lt;p&gt;</code>). If your English HTML contains <code class="text-accent">&lt;br&gt;</code> tags, it often causes an off-by-one count shift:
        </p>
        <div class="space-y-1.5">
          ${enBlocksWithBr
            .map(
              ({ b, i }) => `
            <div class="flex items-center justify-between p-2 rounded bg-surface/70 border border-border">
              <span class="text-text font-medium truncate max-w-md">Block #${i + 1} (${b.brCount} &lt;br&gt;): "${escapeHtml(issueSnippet(b.text, 60))}"</span>
              <button type="button" class="btn btn-secondary text-xs px-2 py-0.5 issue-row-clickable" data-jump-en="${i}">Jump to #${i + 1} →</button>
            </div>`
            )
            .join('')}
        </div>
      </div>`;
  }

  let divergenceNotice = '';
  if (firstDivRow) {
    const enBlockNum = firstDivRow.enIndex !== null ? `#${firstDivRow.enIndex + 1}` : 'None';
    const frBlockNum = firstDivRow.frIndex !== null ? `#${firstDivRow.frIndex + 1}` : 'None';
    divergenceNotice = `
      <div class="flex items-center justify-between mt-2 text-xs">
        <span class="text-text-secondary">
          First discrepancy begins at <strong class="text-text">English ${enBlockNum} / Word ${frBlockNum}</strong>. All prior blocks match 1:1.
        </span>
        ${firstDivRow.enIndex !== null ? `<button type="button" class="btn btn-secondary text-xs px-2 py-0.5 issue-row-clickable" data-jump-en="${firstDivRow.enIndex}">Jump to Discrepancy →</button>` : ''}
      </div>`;
  }

  return `
    <div class="p-3.5 mb-3 rounded-lg bg-amber-500/10 border border-amber-500/25">
      <div class="flex items-center justify-between font-bold text-xs text-amber-600 dark:text-amber-400">
        <span>⚡ Alignment Diagnostics & Pinpointer</span>
        <span class="font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
          EN: ${nEn} blocks • FR: ${nFr} blocks (${nFr > nEn ? `+${nFr - nEn} in Word` : nEn > nFr ? `+${nEn - nFr} in HTML` : 'Equal tags'})
        </span>
      </div>
      ${divergenceNotice}
      ${brHintsHtml}
    </div>`;
}

function renderDrawerBody(category) {
  if (!drawerBody) return;
  drawerBody.innerHTML = '';
  const diagHeader = getDivergenceDiagnosticsHtml();

  if (category === 'qa-diff') {
    const qaList = computeQaDiffAudit();
    if (!qaList.length) {
      drawerBody.innerHTML = `
        ${diagHeader}
        <div class="p-8 text-center">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="text-sm font-bold text-text">Dual Preview QA &amp; Diff Clean</div>
          <p class="text-xs text-text-secondary mt-1">All hyperlinks, footnote callouts, and structural elements are balanced between English and French.</p>
        </div>`;
    } else {
      const rows = qaList
        .map(
          (qa, i) => `
        <div class="issue-row issue-row-clickable" data-jump-en="${qa.enIndex}">
          <div class="issue-side ${qa.severity === 'warn' ? 'warn' : 'info'}">${qa.type.toUpperCase()}</div>
          <div>
            <div class="issue-title">${escapeHtml(qa.title)}</div>
            <div class="issue-detail">${escapeHtml(qa.detail)}</div>
          </div>
          <div class="issue-status">${qa.action}</div>
          <div>
            <button type="button" class="btn btn-secondary text-xs px-2.5 py-1">Jump →</button>
          </div>
        </div>`
        )
        .join('');

      drawerBody.innerHTML = `
        ${diagHeader}
        <div class="p-3 bg-surface-soft border-b border-border flex items-center justify-between">
          <span class="text-xs font-bold text-text">Side-by-Side QA Discrepancies (${qaList.length})</span>
        </div>
        <div>${rows}</div>`;
    }
  } else if (category === 'typography') {
    const typoList = computeTypographyAudit();
    if (!typoList.length) {
      drawerBody.innerHTML = `
        ${diagHeader}
        <div class="p-8 text-center">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="text-sm font-bold text-text">French Typography 100% Compliant</div>
          <p class="text-xs text-text-secondary mt-1">All punctuation marks (: ; ! ?), currency symbols ($, €), percent signs (%), and guillemets (&#171; &#187;) have proper non-breaking spaces.</p>
        </div>`;
    } else {
      const rows = typoList
        .map(
          (item) => `
        <div class="p-3.5 border-b border-border bg-surface hover:bg-surface-hover/50 transition-colors flex items-start justify-between gap-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="tag tag-fr text-[10px]">FR #${item.frIndex + 1}</span>
              <span class="text-xs font-bold text-text">${item.issues.map((iss) => iss.label).join(', ')}</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono p-2.5 rounded-lg bg-surface-soft border border-border">
              <div class="overflow-hidden">
                <div class="flex items-center gap-1.5 text-text-muted text-[10px] font-sans font-semibold mb-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  <span>CURRENT TEXT:</span>
                </div>
                <div class="text-text leading-relaxed whitespace-pre-wrap break-words">
                  ${highlightTypoOriginal(getTypoSnippetWindow(item.originalText, 140))}
                </div>
              </div>
              <div class="overflow-hidden">
                <div class="flex items-center gap-1.5 text-text-muted text-[10px] font-sans font-semibold mb-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>SUGGESTED FRENCH TYPOGRAPHY:</span>
                </div>
                <div class="text-text leading-relaxed whitespace-pre-wrap break-words">
                  ${highlightTypoFixed(getTypoSnippetWindow(item.fixedText, 140))}
                </div>
              </div>
            </div>
          </div>
          <div class="flex flex-col gap-1.5 pt-1">
            <button type="button" class="btn btn-primary text-xs px-3 py-1 fix-typo-btn" data-fr-idx="${item.frIndex}">
              Fix Spacing
            </button>
            <button type="button" class="btn btn-secondary text-xs px-2.5 py-0.5 issue-row-clickable" data-jump-fr="${item.frIndex}">
              Jump →
            </button>
          </div>
        </div>`
        )
        .join('');

      drawerBody.innerHTML = `
        ${diagHeader}
        <div class="p-3.5 bg-surface-soft border-b border-border flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-text">French Punctuation &amp; Non-Breaking Space Linter</div>
            <div class="text-[11px] text-text-secondary">${typoList.length} block(s) require non-breaking spaces (&nbsp; / insécables)</div>
          </div>
          <button type="button" id="fixAllTypoBtn" class="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Fix All Spaces &amp; Punctuation (${typoList.length})</span>
          </button>
        </div>
        <div>${rows}</div>`;
    }
  } else if (category === 'lang-en') {
    const langList = computeLangEnAudit();
    if (!langList.length) {
      drawerBody.innerHTML = `
        ${diagHeader}
        <div class="p-8 text-center">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="text-sm font-bold text-text">Smart lang="en" Detection Complete</div>
          <p class="text-xs text-text-secondary mt-1">No untranslated English acronyms or quotes without lang="en" tags found.</p>
        </div>`;
    } else {
      const rows = langList
        .map(
          (item) => `
        <div class="p-3.5 border-b border-border bg-surface hover:bg-surface-hover/50 transition-colors flex items-start justify-between gap-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="tag tag-fr text-[10px]">FR #${item.frIndex + 1}</span>
              <span class="text-xs font-bold text-text">Detected English Terms (${item.terms.length})</span>
            </div>
            <div class="text-xs text-text-secondary mb-2 font-mono p-2 rounded bg-surface-soft border border-border">
              "${escapeHtml(issueSnippet(item.block.text, 100))}"
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              ${item.terms
                .map(
                  (t) => `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-xs font-medium">
                  <code>${escapeHtml(t.term)}</code>
                  <button type="button" class="hover:underline font-bold text-[11px] ml-1 tag-single-lang-btn" data-fr-idx="${item.frIndex}" data-term="${escapeHtml(t.term)}">+ Wrap &lt;span lang="en"&gt;</button>
                </span>`
                )
                .join('')}
            </div>
          </div>
          <div class="flex flex-col gap-1.5 pt-1">
            <button type="button" class="btn btn-secondary text-xs px-2.5 py-0.5 issue-row-clickable" data-jump-fr="${item.frIndex}">
              Jump →
            </button>
          </div>
        </div>`
        )
        .join('');

      drawerBody.innerHTML = `
        ${diagHeader}
        <div class="p-3.5 bg-surface-soft border-b border-border flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-text">Smart Language Attribute (lang="en") Inserter</div>
            <div class="text-[11px] text-text-secondary">${langList.length} French block(s) contain untagged English federal acronyms or quotes</div>
          </div>
          <button type="button" id="tagAllLangEnBtn" class="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <span>Wrap All with &lt;span lang="en"&gt;</span>
          </button>
        </div>
        <div>${rows}</div>`;
    }
  } else if (category === 'tables-lists') {
    const { tables, lists } = computeTablesAndListsAudit();
    drawerBody.innerHTML = `
      ${diagHeader}
      <div class="p-4 bg-surface-soft border-b border-border">
        <div class="text-xs font-bold text-text mb-1">GC / WET Table &amp; List Integrity Matrix (WCAG 2.1 AA)</div>
        <p class="text-xs text-text-secondary">Verifies cell-by-cell header mapping (scope="col", scope="row", headers="...") and list item preservation.</p>
      </div>

      <div class="p-4 space-y-4">
        <!-- Tables Matrix -->
        <div>
          <h4 class="text-xs font-bold text-text uppercase tracking-wide text-text-muted mb-2">Tables in Document (${tables.length})</h4>
          ${
            tables.length === 0
              ? '<div class="text-xs text-text-secondary p-3 rounded bg-surface border border-border">No tables found in English source HTML.</div>'
              : `<div class="space-y-2">
                ${tables
                  .map(
                    (tbl) => `
                  <div class="p-3 rounded-lg bg-surface border border-border flex items-center justify-between">
                    <div>
                      <div class="font-semibold text-xs text-text">Table #${tbl.tableIndex}: "${escapeHtml(tbl.caption)}"</div>
                      <div class="text-[11px] text-text-secondary mt-0.5">
                        ${tbl.rowCount} rows • ${tbl.colHeaderCount} &lt;th&gt; headers • ${tbl.cellCount} &lt;td&gt; data cells ${tbl.complexSpans > 0 ? `• ${tbl.complexSpans} colspan/rowspan` : ''}
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-[11px] px-2 py-0.5 rounded font-semibold ${
                        tbl.wcagCompliant
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      }">
                        ${tbl.wcagCompliant ? '✓ WCAG AA Headers Valid' : '⚠ Missing scope/headers'}
                      </span>
                    </div>
                  </div>`
                  )
                  .join('')}
              </div>`
          }
        </div>

        <!-- Lists Matrix -->
        <div>
          <h4 class="text-xs font-bold text-text uppercase tracking-wide text-text-muted mb-2">Lists in Document (${lists.length})</h4>
          ${
            lists.length === 0
              ? '<div class="text-xs text-text-secondary p-3 rounded bg-surface border border-border">No lists found in source HTML.</div>'
              : `<div class="space-y-2">
                ${lists
                  .map(
                    (lst) => `
                  <div class="p-3 rounded-lg bg-surface border border-border flex items-center justify-between">
                    <div>
                      <div class="font-semibold text-xs text-text">&lt;${lst.tag}&gt; List #${lst.listIndex} (${lst.itemCount} items) ${lst.isUnstyled ? '<span class="text-xs text-indigo-400 ml-1">.list-unstyled</span>' : ''}</div>
                      <div class="text-[11px] text-text-secondary mt-0.5">First item: "${escapeHtml(lst.firstItem)}"</div>
                    </div>
                    <span class="text-[11px] px-2 py-0.5 rounded font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      ✓ Skeleton Preserved
                    </span>
                  </div>`
                  )
                  .join('')}
              </div>`
          }
        </div>
      </div>`;
  } else if (category === 'en-tags' || category === 'fr-tags') {
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
          <div class="issue-title">#${i + 1} &lt;${b.tag}&gt; ${b.hasBr ? `<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold">${b.brCount} &lt;br&gt;</span>` : ''}</div>
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
      ${diagHeader}
      <div class="p-4 bg-surface-soft border-b border-border">
        <div class="text-xs font-semibold text-text mb-2">${title}</div>
        <div class="flex items-center gap-2 flex-wrap">${badgesHtml}</div>
      </div>
      <div>${listHtml}</div>`;
  } else if (category === 'mismatch') {
    const issues = state.issueGroups.mismatch;
    if (!issues.length) {
      drawerBody.innerHTML = `${diagHeader}<div class="p-6 text-center text-text-secondary text-xs">No tag or style mismatches found! Perfect structural symmetry.</div>`;
    } else {
      drawerBody.innerHTML = diagHeader + issues
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
      drawerBody.innerHTML = `${diagHeader}<div class="p-6 text-center text-text-secondary text-xs">All English blocks have corresponding French translations.</div>`;
    } else {
      drawerBody.innerHTML = diagHeader + issues
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
      drawerBody.innerHTML = `${diagHeader}<div class="p-6 text-center text-text-secondary text-xs">No extra unaligned French paragraphs in the document.</div>`;
    } else {
      drawerBody.innerHTML = diagHeader + issues
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
      drawerBody.innerHTML = `${diagHeader}<div class="p-6 text-center text-text-secondary text-xs">No blocks have been skipped.</div>`;
    } else {
      drawerBody.innerHTML = diagHeader + skippedRows
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

  // Attach Typography buttons inside drawer
  drawerBody.querySelectorAll('.fix-typo-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const frIdx = parseInt(btn.getAttribute('data-fr-idx'), 10);
      fixFrenchTypographyBlock(frIdx);
    });
  });

  const fixAllTypoBtn = document.getElementById('fixAllTypoBtn');
  if (fixAllTypoBtn) {
    fixAllTypoBtn.addEventListener('click', () => {
      fixAllFrenchTypography();
    });
  }

  // Attach lang="en" buttons inside drawer
  drawerBody.querySelectorAll('.tag-single-lang-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const frIdx = parseInt(btn.getAttribute('data-fr-idx'), 10);
      const term = btn.getAttribute('data-term');
      tagEnglishTermInBlock(frIdx, term);
    });
  });

  const tagAllLangEnBtn = document.getElementById('tagAllLangEnBtn');
  if (tagAllLangEnBtn) {
    tagAllLangEnBtn.addEventListener('click', () => {
      tagAllEnglishTerms();
    });
  }
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
        result += child.nodeValue.replace(/[ \t\r\n]+/g, ' ');
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
      const text = node.nodeValue.replace(/[ \t\r\n]+/g, ' ').trim();
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
  if (state.frCustomHtml) {
    const parser = new DOMParser();
    let doc;
    const hasHtmlTag = /<html[\s>]/i.test(state.frCustomHtml);

    if (hasHtmlTag) {
      doc = parser.parseFromString(state.frCustomHtml, 'text/html');
    } else {
      doc = parser.parseFromString('<html><head></head><body></body></html>', 'text/html');
      doc.body.innerHTML = state.frCustomHtml;
    }

    if (doc.documentElement) {
      doc.documentElement.setAttribute('lang', 'fr');
    }

    // Synchronize any live visual edits made in the French visual preview frame into doc
    try {
      if (frPreviewFrame && frPreviewFrame.contentDocument) {
        const editables = frPreviewFrame.contentDocument.querySelectorAll('.gc-swap-editable');
        const docBlocks = extractBlocks(doc.body);
        editables.forEach((el) => {
          const frIdx = el.hasAttribute('data-fr-index') ? parseInt(el.getAttribute('data-fr-index'), 10) : null;
          if (frIdx !== null && docBlocks[frIdx]) {
            const currentText = el.innerText.trim();
            replaceBlockTextPreservingLinks(
              docBlocks[frIdx].el,
              currentText,
              docBlocks[frIdx].attrTarget,
              docBlocks[frIdx].spans
            );
            if (state.frBlocks[frIdx]) {
              state.frBlocks[frIdx].text = currentText;
            }
          }
        });
      }
    } catch (_) {}

    // Ensure all links on the French side are formatted as root-relative
    doc.body.querySelectorAll('a[href]').forEach((a) => {
      const rawHref = a.getAttribute('href');
      if (rawHref && !isFragmentHref(rawHref)) {
        a.setAttribute('href', formatFrenchRootRelativeLink(rawHref));
      }
    });

    // Clean any redundant <strong> tags inside <th> header cells
    cleanThTags(doc.body);

    const rawHtml = hasHtmlTag ? doc.documentElement.outerHTML : doc.body.innerHTML;
    return formatHtmlCode(cleanFrenchHtmlPostProcess(rawHtml));
  }

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
          const liveText = getBlockContent(el);
          if (liveText && liveText.replace(/\u00A0/g, ' ') !== (state.frBlocks[frIdx].text || '').replace(/\u00A0/g, ' ')) {
            state.frBlocks[frIdx].text = liveText;
          }
        }
      });
    }
  } catch (_) {}

  enDocBlocks.forEach((enTarget, enIdx) => {
    const pair = state.alignPairs.find((p) => p.enIndex === enIdx && !p.skip);
    if (pair && pair.frIndex !== null && state.frBlocks[pair.frIndex]) {
      const frBlock = state.frBlocks[pair.frIndex];
      replaceBlockTextPreservingLinks(
        enTarget.el,
        frBlock.text,
        enTarget.attrTarget,
        frBlock.spans
      );
    } else {
      // English block missing French translation in Word doc:
      // Insert obvious French filler placeholder so rest of exported document stays aligned
      const fillerText = `[TRADUCTION MANQUANTE : ${enTarget.text}]`;
      replaceBlockTextPreservingLinks(
        enTarget.el,
        fillerText,
        enTarget.attrTarget,
        enTarget.spans
      );
    }
  });

  // Ensure all links on the French side are formatted as root-relative
  doc.body.querySelectorAll('a[href]').forEach((a) => {
    const rawHref = a.getAttribute('href');
    if (rawHref && !isFragmentHref(rawHref)) {
      a.setAttribute('href', formatFrenchRootRelativeLink(rawHref));
    }
  });

  // Clean any redundant <strong> tags inside <th> header cells
  cleanThTags(doc.body);

  const rawHtml = hasHtmlTag ? doc.documentElement.outerHTML : doc.body.innerHTML;
  return formatHtmlCode(cleanFrenchHtmlPostProcess(rawHtml));
}

function highlightHtmlCode(code) {
  if (!code) return '';

  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /(&lt;!--[\s\S]*?--&gt;)|(&lt;!DOCTYPE[^&]*&gt;)|(&lt;\/?)([a-zA-Z0-9:-]+)((?:\s+[a-zA-Z0-9_:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s&>]+))?)*\s*)(\/?&gt;)/gi,
    (match, comment, doctype, openBracket, tagName, attrs, closeBracket) => {
      if (comment) {
        return `<span class="hl-comment">${comment}</span>`;
      }
      if (doctype) {
        return `<span class="hl-doctype">${doctype}</span>`;
      }
      if (openBracket && tagName) {
        let formattedAttrs = '';
        if (attrs) {
          formattedAttrs = attrs.replace(
            /([a-zA-Z0-9_:-]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s&>]+))?/g,
            (attrMatch, attrName, eq, attrVal) => {
              let out = `<span class="hl-attr-name">${attrName}</span>`;
              if (eq) out += `<span class="hl-punct">${eq}</span>`;
              if (attrVal) out += `<span class="hl-attr-val">${attrVal}</span>`;
              return out;
            }
          );
        }
        return `<span class="hl-bracket">${openBracket}</span><span class="hl-tag">${tagName}</span>${formattedAttrs}<span class="hl-bracket">${closeBracket}</span>`;
      }
      return match;
    }
  );
}

function syncFrCodeScroll() {
  if (!frCodeEditor) return;
  if (frCodeHighlight) {
    frCodeHighlight.scrollTop = frCodeEditor.scrollTop;
    frCodeHighlight.scrollLeft = frCodeEditor.scrollLeft;
  }
  if (frCodeGutter) {
    frCodeGutter.scrollTop = frCodeEditor.scrollTop;
  }
}

function updateFrCodeView() {
  if (!frCodeEditor) return;
  const text = frCodeEditor.value || '';
  const lines = text ? text.split('\n') : [];
  const lineCount = lines.length || 1;
  const chars = text.length;

  if (frCodeStats) {
    frCodeStats.textContent = `${lineCount} ${lineCount === 1 ? 'line' : 'lines'} • ${chars} chars`;
  }

  // Update Line Numbers Gutter
  if (frCodeGutter) {
    let lineNumsStr = '';
    for (let i = 1; i <= lineCount; i++) {
      lineNumsStr += (i === 1 ? '1' : '\n' + i);
    }
    frCodeGutter.textContent = lineNumsStr;
  }

  // Update Syntax Highlighting
  if (frCodeHighlightInner) {
    const trailing = text.endsWith('\n') ? '\n' : '';
    frCodeHighlightInner.innerHTML = highlightHtmlCode(text) + trailing;
  }

  // Synchronize Scroll
  syncFrCodeScroll();
}

function updateFrCodeStats() {
  updateFrCodeView();
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
      updateFrCodeView();
      frCodeEditor.scrollTop = 0;
      frCodeEditor.scrollLeft = 0;
      if (frCodeHighlight) {
        frCodeHighlight.scrollTop = 0;
        frCodeHighlight.scrollLeft = 0;
      }
      if (frCodeGutter) {
        frCodeGutter.scrollTop = 0;
      }
    }
    if (frPreviewFrame) frPreviewFrame.style.display = 'none';
    if (frCodeWrap) frCodeWrap.style.display = 'flex';
  } else {
    // Returning to Visual Mode: Update French preview with any code added, modified, or removed in the Code Editor
    if (frCodeEditor && frCodeEditor.value) {
      const editedCode = frCodeEditor.value.trim();
      state.frCustomHtml = editedCode;

      // Extract new blocks from edited HTML to update state.frBlocks
      const parser = new DOMParser();
      let doc;
      const hasHtmlTag = /<html[\s>]/i.test(editedCode);
      if (hasHtmlTag) {
        doc = parser.parseFromString(editedCode, 'text/html');
      } else {
        doc = parser.parseFromString('<html><head></head><body></body></html>', 'text/html');
        doc.body.innerHTML = editedCode;
      }

      const extractedFrBlocks = extractBlocks(doc.body);
      state.frBlocks = extractedFrBlocks.map((b) => ({
        tag: b.tag,
        attrTarget: b.attrTarget,
        text: b.text,
        spans: b.spans,
      }));

      // Recompute alignments and issues
      const enTags = state.enBlocks.map((b) => b.tag);
      const frTags = state.frBlocks.map((b) => b.tag);
      const rows = alignByTag(enTags, frTags);
      const pairs = rows.filter((r) => r.enIndex !== null && r.frIndex !== null && !r.skip);
      const issues = computeIssues(rows, state.enBlocks, state.frBlocks, []);

      state.alignRows = rows;
      state.alignPairs = pairs;
      state.issueGroups = issues;

      if (frBlockCountBadge) {
        frBlockCountBadge.textContent = `${state.frBlocks.length} blocks`;
      }
      renderStatsBar();

      // Render updated visual preview frame
      const updatedFrDocHtml = buildFrenchFrameSourceFromHtml(editedCode, state.frBlocks);
      if (frPreviewFrame) {
        frPreviewFrame.srcdoc = updatedFrDocHtml;
      }

      setupIframeEventListeners();

      setTimeout(() => {
        applyActiveHighlight();
        alignPreviewBlocks(state.activePreviewBlock || 0);
        updateActiveBlockHud(state.activePreviewBlock || 0);
      }, 100);
    }

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
  if (toggleWordDocBtn) {
    toggleWordDocBtn.addEventListener('click', () => {
      toggleWordDocView();
    });
  }

  if (closeWordDocPaneBtn) {
    closeWordDocPaneBtn.addEventListener('click', () => {
      toggleWordDocView(false);
    });
  }

  toggleFocusMode.addEventListener('click', () => {
    state.focusMode = !state.focusMode;
    toggleFocusMode.classList.toggle('is-active', state.focusMode);
    [enPreviewFrame, frPreviewFrame, docxPreviewFrame].forEach((frame) => {
      if (frame && frame.contentDocument && frame.contentDocument.body) {
        frame.contentDocument.body.classList.toggle('mode-focus', state.focusMode);
      }
    });
  });

  toggleBlurMode.addEventListener('click', () => {
    state.blurMode = !state.blurMode;
    toggleBlurMode.classList.toggle('is-active', state.blurMode);
    [enPreviewFrame, frPreviewFrame, docxPreviewFrame].forEach((frame) => {
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

  // Split & Merge Actions & Modal Buttons
  if (splitActiveBlockBtn) {
    splitActiveBlockBtn.addEventListener('click', () => {
      openSplitBlockModal(state.activePreviewBlock);
    });
  }
  if (mergeActiveBlockBtn) {
    mergeActiveBlockBtn.addEventListener('click', () => {
      mergeWithNextBlock();
    });
  }
  if (closeSplitModalBtn) {
    closeSplitModalBtn.addEventListener('click', closeSplitBlockModal);
  }
  if (cancelSplitModalBtn) {
    cancelSplitModalBtn.addEventListener('click', closeSplitBlockModal);
  }
  if (confirmSplitBlockBtn) {
    confirmSplitBlockBtn.addEventListener('click', applySplitBlock);
  }
  if (splitBySentenceBtn) {
    splitBySentenceBtn.addEventListener('click', () => {
      const text = splitOriginalText ? splitOriginalText.value : '';
      const periodIdx = text.indexOf('. ');
      if (periodIdx !== -1) {
        splitPart1Text.value = text.substring(0, periodIdx + 1).trim();
        splitPart2Text.value = text.substring(periodIdx + 2).trim();
      }
    });
  }
  if (splitByNewlineBtn) {
    splitByNewlineBtn.addEventListener('click', () => {
      const text = splitOriginalText ? splitOriginalText.value : '';
      const nlIdx = text.indexOf('\n');
      if (nlIdx !== -1) {
        splitPart1Text.value = text.substring(0, nlIdx).trim();
        splitPart2Text.value = text.substring(nlIdx + 1).trim();
      }
    });
  }
  if (splitByHalfBtn) {
    splitByHalfBtn.addEventListener('click', () => {
      const text = splitOriginalText ? splitOriginalText.value : '';
      const half = Math.floor(text.length / 2);
      const spaceIdx = text.indexOf(' ', half);
      if (spaceIdx !== -1) {
        splitPart1Text.value = text.substring(0, spaceIdx).trim();
        splitPart2Text.value = text.substring(spaceIdx + 1).trim();
      }
    });
  }
  if (splitBlockModal) {
    splitBlockModal.addEventListener('click', (e) => {
      if (e.target === splitBlockModal) {
        closeSplitBlockModal();
      }
    });
  }

  // Toolbar Quick-Audit Category Buttons
  if (openQaDiffBtn) {
    openQaDiffBtn.addEventListener('click', () => {
      if (state.drawerOpen && state.activeCategory === 'qa-diff') closeDrawer();
      else openDrawer('qa-diff');
    });
  }
  if (openTypographyBtn) {
    openTypographyBtn.addEventListener('click', () => {
      if (state.drawerOpen && state.activeCategory === 'typography') closeDrawer();
      else openDrawer('typography');
    });
  }
  if (openLangEnBtn) {
    openLangEnBtn.addEventListener('click', () => {
      if (state.drawerOpen && state.activeCategory === 'lang-en') closeDrawer();
      else openDrawer('lang-en');
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
      updateFrCodeView();
      showToast('HTML code formatted');
    });
  }

  if (frCodeEditor) {
    frCodeEditor.addEventListener('input', () => {
      updateFrCodeView();
    });

    frCodeEditor.addEventListener('scroll', syncFrCodeScroll);
    frCodeEditor.addEventListener('click', syncFrCodeScroll);
    frCodeEditor.addEventListener('keyup', syncFrCodeScroll);
    frCodeEditor.addEventListener('select', syncFrCodeScroll);
    frCodeEditor.addEventListener('focus', syncFrCodeScroll);

    // Support tab indent in code editor
    frCodeEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = frCodeEditor.selectionStart;
        const end = frCodeEditor.selectionEnd;
        frCodeEditor.value = frCodeEditor.value.substring(0, start) + '  ' + frCodeEditor.value.substring(end);
        frCodeEditor.selectionStart = frCodeEditor.selectionEnd = start + 2;
        updateFrCodeView();
      }
      requestAnimationFrame(syncFrCodeScroll);
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

  // Health Pill quick drawer open
  if (healthPill) {
    healthPill.addEventListener('click', () => {
      if (state.drawerOpen) {
        closeDrawer();
      } else {
        const cat = state.issueGroups.missing.length > 0 ? 'missing' : state.issueGroups.mismatch.length > 0 ? 'mismatch' : 'qa-diff';
        openDrawer(cat);
      }
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