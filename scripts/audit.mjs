#!/usr/bin/env node
/**
 * audit.mjs — static HTML audit for SEO, accessibility, and Webflow Cloud
 * path correctness.
 *
 * Runs against BUILT HTML, not source. Source-level checks miss the things
 * that actually break: resolved paths, prerendered content, final head order.
 *
 *   node audit.mjs dist/                     # audit every .html under dist/
 *   node audit.mjs dist/index.html           # single file
 *   node audit.mjs dist/ --base /research    # validate base-path prefixing
 *   node audit.mjs dist/ --json out.json     # machine-readable output
 *   node audit.mjs dist/ --warn-only         # never exit non-zero
 *
 * Exit code 1 if any ERROR-severity finding. Warnings alone exit 0.
 *
 * Requires: cheerio  (npm i -D cheerio)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import * as cheerio from 'cheerio';

/* ------------------------------------------------------------------ config */

const ANDELA_TOKEN_HEXES = new Set([
  '#338632', '#245a23', '#163a16', '#7fc87c', '#d9eed8', '#ecf7ec',
  '#132128', '#205257', '#307c84', '#7cbfc7', '#e0f3f5', '#f0fafb',
  '#b0d6ce', '#e7f2f0', '#000000', '#141413', '#2b373d', '#424d53',
  '#717a7e', '#a1a6a9', '#e7e9ea', '#f5f5f5', '#fafafa', '#ffffff',
  '#fd853a', '#ffe1ce', '#83421a', '#3b45f1', '#bec1f3', '#21278c',
  '#9966ff', '#dccbff', '#452e73', '#e9ffe9', '#007c34', '#eef9fe',
  '#005f87', '#fffaeb', '#8b6800', '#fff0f0', '#990000', '#cb3b43',
  '#9e2d33', '#5e191d', '#e2a9ac', '#f6eaeb',
]);

const GENERIC_LINK_TEXT = [
  'click here', 'here', 'read more', 'more', 'learn more', 'this link',
  'link', 'this', 'details', 'continue', 'go', 'download',
];

const THIRD_PARTY_FONT_HOSTS = [
  'fonts.googleapis.com', 'fonts.gstatic.com', 'use.typekit.net',
  'fast.fonts.net', 'cdn.jsdelivr.net',
];

/* -------------------------------------------------------------- contrast */

function luminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(h.substr(i, 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ---------------------------------------------------------------- harness */

class Report {
  constructor(file) { this.file = file; this.findings = []; }
  add(severity, rule, message, detail) {
    this.findings.push({ severity, rule, message, detail });
  }
  error(rule, message, detail) { this.add('error', rule, message, detail); }
  warn(rule, message, detail) { this.add('warn', rule, message, detail); }
  info(rule, message, detail) { this.add('info', rule, message, detail); }
  get errors() { return this.findings.filter((f) => f.severity === 'error'); }
  get warnings() { return this.findings.filter((f) => f.severity === 'warn'); }
}

const textOf = ($, el) => $(el).text().replace(/\s+/g, ' ').trim();

/** An element's accessible name, approximately. Good enough to catch the
 *  common failures: empty buttons, icon-only links, unlabelled inputs. */
function accessibleName($, el) {
  const $el = $(el);
  const aria = $el.attr('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const labelledby = $el.attr('aria-labelledby');
  if (labelledby) {
    const parts = labelledby.split(/\s+/)
      .map((id) => textOf($, $(`#${id}`)))
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  const title = $el.attr('title');
  const own = textOf($, el);
  if (own) return own;
  const imgAlt = $el.find('img[alt]').attr('alt');
  if (imgAlt && imgAlt.trim()) return imgAlt.trim();
  const svgTitle = textOf($, $el.find('svg > title'));
  if (svgTitle) return svgTitle;
  const val = $el.attr('value');
  if (val && val.trim()) return val.trim();
  if (title && title.trim()) return title.trim();
  return '';
}

/* ------------------------------------------------------------------ checks */

function checkDocument($, r) {
  const html = $('html');
  const lang = html.attr('lang');
  if (!lang) r.error('lang', 'html element has no lang attribute (WCAG 3.1.1)');
  else if (!/^[a-z]{2}(-[A-Za-z0-9]+)*$/.test(lang))
    r.error('lang', `html lang="${lang}" is not a valid language tag`);

  if (!$('meta[charset]').length) r.error('charset', 'No <meta charset>');

  const vp = $('meta[name="viewport"]').attr('content');
  if (!vp) r.error('viewport', 'No viewport meta tag');
  else if (/user-scalable\s*=\s*no/i.test(vp) || /maximum-scale\s*=\s*1\b/.test(vp))
    r.error('viewport', 'Viewport blocks zoom (WCAG 1.4.4)', vp);

  // Duplicate IDs break aria-labelledby, label[for], and anchor links.
  const seen = new Map();
  $('[id]').each((_, el) => {
    const id = $(el).attr('id');
    seen.set(id, (seen.get(id) || 0) + 1);
  });
  for (const [id, n] of seen) {
    if (n > 1) r.error('duplicate-id', `id "${id}" used ${n} times`);
  }
}

function checkTitleAndMeta($, r) {
  const title = textOf($, $('title'));
  if (!title) r.error('title', 'No <title>');
  else {
    if (title.length < 15) r.warn('title', `Title is very short (${title.length} chars)`, title);
    if (title.length > 65) r.warn('title', `Title is ${title.length} chars; likely truncated in SERPs`, title);
  }

  const desc = $('meta[name="description"]').attr('content');
  if (!desc) r.error('meta-description', 'No meta description');
  else {
    if (desc.length < 70) r.warn('meta-description', `Description is short (${desc.length} chars)`);
    if (desc.length > 165) r.warn('meta-description', `Description is ${desc.length} chars; will be truncated`);
  }

  const canon = $('link[rel="canonical"]').attr('href');
  if (!canon) r.error('canonical', 'No canonical link');
  else if (!/^https?:\/\//.test(canon))
    r.error('canonical', 'Canonical must be an absolute URL', canon);

  const robots = $('meta[name="robots"]').attr('content') || '';
  if (/noindex/i.test(robots))
    r.warn('robots', 'Page is set to noindex — intentional?', robots);

  // Open Graph + Twitter. Missing og:image is the most common real-world gap
  // and the most visible one, since it governs every social/Slack unfurl.
  const og = {
    'og:title': $('meta[property="og:title"]').attr('content'),
    'og:description': $('meta[property="og:description"]').attr('content'),
    'og:url': $('meta[property="og:url"]').attr('content'),
    'og:image': $('meta[property="og:image"]').attr('content'),
    'og:type': $('meta[property="og:type"]').attr('content'),
  };
  for (const [k, v] of Object.entries(og)) {
    if (!v) r.error('open-graph', `Missing ${k}`);
  }
  if (og['og:image'] && !/^https?:\/\//.test(og['og:image']))
    r.error('open-graph', 'og:image must be an absolute URL', og['og:image']);
  if (og['og:url'] && canon && og['og:url'] !== canon)
    r.warn('open-graph', 'og:url does not match canonical', `${og['og:url']} vs ${canon}`);

  if (!$('meta[name="twitter:card"]').attr('content'))
    r.warn('twitter', 'No twitter:card — X/Twitter falls back to a small preview');
}

function checkStructuredData($, r) {
  const blocks = $('script[type="application/ld+json"]');
  if (!blocks.length) {
    r.warn('schema', 'No JSON-LD structured data');
    return;
  }
  blocks.each((i, el) => {
    const raw = $(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item['@context']) r.error('schema', `JSON-LD block ${i + 1} missing @context`);
        if (!item['@type']) r.error('schema', `JSON-LD block ${i + 1} missing @type`);
      }
    } catch (e) {
      r.error('schema', `JSON-LD block ${i + 1} is not valid JSON`, e.message);
    }
  });
}

function checkHeadings($, r) {
  const h1s = $('h1');
  if (h1s.length === 0) r.error('h1', 'No h1 on the page');
  if (h1s.length > 1) r.error('h1', `${h1s.length} h1 elements; there should be exactly one`);

  const levels = [];
  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    levels.push({ level: Number(el.tagName[1]), text: textOf($, el) });
  });

  for (let i = 1; i < levels.length; i++) {
    const jump = levels[i].level - levels[i - 1].level;
    if (jump > 1) {
      r.error(
        'heading-order',
        `Heading level skips h${levels[i - 1].level} to h${levels[i].level} (WCAG 1.3.1)`,
        `"${levels[i].text.slice(0, 60)}"`,
      );
    }
  }

  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    if (!textOf($, el) && !$(el).find('img[alt]').length)
      r.error('heading-empty', `Empty <${el.tagName}>`);
  });
}

function checkLandmarks($, r) {
  if (!$('main, [role="main"]').length)
    r.error('landmark', 'No <main> landmark — screen reader users cannot skip to content');
  if ($('main, [role="main"]').length > 1)
    r.warn('landmark', 'More than one main landmark');

  // Skip link: first focusable should target an in-page anchor.
  const firstLink = $('body a[href^="#"]').first();
  const hasSkip = firstLink.length &&
    /skip/i.test(textOf($, firstLink) + (firstLink.attr('class') || ''));
  if (!hasSkip)
    r.warn('skip-link', 'No skip link found as the first in-page anchor (WCAG 2.4.1)');
}

function checkImages($, r) {
  $('img').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src') || $el.attr('data-src') || '(no src)';
    const alt = $el.attr('alt');
    const role = $el.attr('role');

    if (alt === undefined && role !== 'presentation' && role !== 'none') {
      r.error('img-alt', 'img has no alt attribute (WCAG 1.1.1)', src);
    } else if (alt !== undefined && alt.trim()) {
      if (/^(image|img|photo|picture|graphic|icon|logo)$/i.test(alt.trim()))
        r.warn('img-alt', `Alt text is generic: "${alt}"`, src);
      if (/\.(png|jpe?g|gif|svg|webp)$/i.test(alt.trim()))
        r.warn('img-alt', `Alt text looks like a filename: "${alt}"`, src);
    }

    // CLS: an img without intrinsic dimensions reflows when it loads.
    const hasDims = ($el.attr('width') && $el.attr('height')) ||
      /(?:^|;)\s*(?:width|aspect-ratio)\s*:/.test($el.attr('style') || '');
    if (!hasDims) r.warn('img-dimensions', 'img has no width/height — causes layout shift', src);

    if (!$el.attr('loading') && !$el.attr('fetchpriority'))
      r.info('img-loading', 'Consider loading="lazy" for below-fold images', src);
  });

  $('svg').each((_, el) => {
    const $el = $(el);
    const hidden = $el.attr('aria-hidden') === 'true';
    const named = $el.attr('aria-label') || $el.find('title').length;
    const role = $el.attr('role');
    if (!hidden && !named && role !== 'presentation' && role !== 'none') {
      r.warn('svg-name', 'Inline <svg> is neither aria-hidden nor named — decorative icons should be aria-hidden="true"');
    }
  });
}

function checkInteractive($, r) {
  // Anchors with no href are not focusable and not operable by keyboard.
  $('a').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    const name = accessibleName($, el);

    if (href === undefined) {
      r.error(
        'a-no-href',
        'Anchor without href is not keyboard focusable — use <button> (WCAG 2.1.1)',
        name || ($el.attr('class') ? `.${$el.attr('class')}` : '<a>'),
      );
    }
    if (!name) {
      r.error('link-name', 'Link has no accessible name (WCAG 2.4.4)', href || '(no href)');
    } else if (GENERIC_LINK_TEXT.includes(name.toLowerCase())) {
      r.warn('link-name', `Non-descriptive link text: "${name}"`, href);
    }
    if (href && /^https?:\/\//.test(href) && $el.attr('target') === '_blank') {
      const rel = $el.attr('rel') || '';
      if (!/noopener/.test(rel))
        r.warn('link-rel', 'target="_blank" without rel="noopener"', href);
    }
  });

  $('button, [role="button"], input[type="submit"], input[type="button"]').each((_, el) => {
    if (!accessibleName($, el)) {
      const cls = $(el).attr('class');
      r.error('button-name', 'Button has no accessible name (WCAG 4.1.2)',
        cls ? `.${cls}` : `<${el.tagName}>`);
    }
  });

  // Clickable non-interactive elements. A div with an onclick is invisible to
  // keyboard and assistive tech.
  $('div[onclick], span[onclick], li[onclick]').each((_, el) => {
    r.error('clickable-div', `<${el.tagName}> has onclick but is not a button or link (WCAG 2.1.1)`);
  });

  $('[tabindex]').each((_, el) => {
    const t = Number($(el).attr('tabindex'));
    if (t > 0) r.warn('tabindex', `Positive tabindex="${t}" disrupts natural focus order`);
  });
}

function checkForms($, r) {
  $('input, select, textarea').each((_, el) => {
    const $el = $(el);
    const type = ($el.attr('type') || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return;

    const id = $el.attr('id');
    const hasLabelFor = id && $(`label[for="${id}"]`).length > 0;
    const wrapped = $el.parents('label').length > 0;
    const aria = $el.attr('aria-label') || $el.attr('aria-labelledby');

    if (!hasLabelFor && !wrapped && !aria) {
      r.error('input-label', `${el.tagName} has no associated label (WCAG 1.3.1, 4.1.2)`,
        id ? `#${id}` : `[type=${type}]`);
    }
    // A placeholder is not a label: it disappears on input and fails contrast.
    if (!hasLabelFor && !wrapped && $el.attr('placeholder') && !aria) {
      r.error('input-label', 'Placeholder used as the only field label', $el.attr('placeholder'));
    }
    if (aria && !hasLabelFor && !wrapped) {
      r.info('input-label', 'Field is labelled by aria only — a visible <label> is better', id ? `#${id}` : type);
    }
  });
}

function checkMediaAndFrames($, r) {
  $('iframe').each((_, el) => {
    if (!$(el).attr('title'))
      r.error('iframe-title', 'iframe has no title attribute (WCAG 4.1.2)', $(el).attr('src'));
  });
  $('video').each((_, el) => {
    const $el = $(el);
    if (!$el.find('track[kind="captions"], track[kind="subtitles"]').length)
      r.error('video-captions', 'video has no captions track (WCAG 1.2.2)');
    if ($el.attr('autoplay') !== undefined && $el.attr('muted') === undefined)
      r.error('autoplay', 'Autoplaying video is not muted (WCAG 1.4.2)');
  });
  $('audio[autoplay]').each(() => {
    r.error('autoplay', 'Autoplaying audio (WCAG 1.4.2)');
  });

  // Canvas is opaque to crawlers and assistive tech alike. An aria-label says
  // a chart exists; it does not convey the data.
  $('canvas').each((_, el) => {
    const $el = $(el);
    const label = $el.attr('aria-label') || $el.attr('aria-labelledby');
    if (!label) {
      r.error('canvas-alt', 'canvas has no accessible name (WCAG 1.1.1)');
    } else {
      const hasFallback = $el.children().length > 0 ||
        $el.closest('figure').find('figcaption, table').length > 0 ||
        $el.parent().find('table, .a-visually-hidden').length > 0;
      if (!hasFallback) {
        r.error('canvas-alt',
          'canvas is named but has no text equivalent for its data — add a figcaption plus a table or "view as table" toggle (WCAG 1.1.1)');
      }
    }
  });
}

function checkTables($, r) {
  $('table').each((_, el) => {
    const $el = $(el);
    if ($el.attr('role') === 'presentation' || $el.attr('role') === 'none') return;
    if (!$el.find('th').length)
      r.error('table-headers', 'Data table has no <th> header cells (WCAG 1.3.1)');
    if (!$el.find('caption').length)
      r.warn('table-caption', 'Table has no <caption>');
  });
}

function checkBasePath($, r, base) {
  if (!base) return;
  const norm = base.endsWith('/') ? base : `${base}/`;
  const attrs = [['a', 'href'], ['img', 'src'], ['script', 'src'],
                 ['link', 'href'], ['source', 'src'], ['video', 'src'],
                 ['iframe', 'src'], ['form', 'action']];

  for (const [tag, attr] of attrs) {
    $(`${tag}[${attr}]`).each((_, el) => {
      const v = $(el).attr(attr);
      if (!v) return;
      // Only root-relative paths are at risk. Protocol-relative, absolute,
      // anchors, data:, mailto: and relative paths are all fine.
      if (!v.startsWith('/') || v.startsWith('//')) return;
      if (v.startsWith(norm) || v === base) return;
      r.error(
        'base-path',
        `Root-relative path does not include the app base "${base}" — will 404 in production`,
        `<${tag} ${attr}="${v}">`,
      );
    });
  }

  $('*[style*="url("]').each((_, el) => {
    const s = $(el).attr('style') || '';
    const m = s.match(/url\((['"]?)(\/[^)'"]+)\1\)/);
    if (m && !m[2].startsWith(norm)) {
      r.error('base-path', `Inline background url() missing base "${base}"`, m[2]);
    }
  });
}

function checkPerformance($, r, html) {
  // Render-blocking third-party resources in <head>.
  $('head link[rel="stylesheet"], head script[src]').each((_, el) => {
    const url = $(el).attr('href') || $(el).attr('src') || '';
    const host = THIRD_PARTY_FONT_HOSTS.find((h) => url.includes(h));
    if (host) {
      const isScript = el.tagName === 'script';
      const deferred = isScript && ($(el).attr('defer') !== undefined || $(el).attr('async') !== undefined);
      if (!deferred) {
        r.error('render-blocking',
          `Render-blocking third-party resource from ${host} — self-host instead`, url);
      }
    } else if (/^https?:\/\//.test(url)) {
      r.warn('third-party', 'Third-party resource in <head>', url);
    }
  });

  let inlineScriptBytes = 0;
  $('script:not([src])').each((_, el) => {
    inlineScriptBytes += Buffer.byteLength($(el).contents().text(), 'utf8');
  });
  if (inlineScriptBytes > 20_000) {
    r.warn('inline-script',
      `${(inlineScriptBytes / 1024).toFixed(0)} KB of inline JS blocks parsing — move to a bundled module`);
  }

  let inlineStyleBytes = 0;
  $('style').each((_, el) => {
    inlineStyleBytes += Buffer.byteLength($(el).contents().text(), 'utf8');
  });
  if (inlineStyleBytes > 15_000) {
    r.warn('inline-style',
      `${(inlineStyleBytes / 1024).toFixed(0)} KB of inline CSS — move to the design system or a scoped stylesheet`);
  }

  const pageBytes = Buffer.byteLength(html, 'utf8');
  if (pageBytes > 150_000) {
    r.warn('page-weight', `HTML document is ${(pageBytes / 1024).toFixed(0)} KB before assets`);
  }

  // Thin content: prerendering is only useful if content is actually there.
  const bodyText = $('body').clone().find('script,style,noscript').remove().end().text();
  const words = bodyText.split(/\s+/).filter(Boolean).length;
  if (words < 150) {
    r.error('thin-content',
      `Only ~${words} words in rendered HTML — content is likely client-rendered and invisible to crawlers`);
  } else if (words < 300) {
    r.warn('thin-content', `~${words} words of rendered text; thin for a research page`);
  }
}

function checkCssTokens($, r) {
  const css = $('style').map((_, el) => $(el).contents().text()).get().join('\n');
  const inline = $('*[style]').map((_, el) => $(el).attr('style')).get().join(';');
  const all = `${css};${inline}`;

  const hexes = [...all.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)]
    .map((m) => {
      let h = m[0].toLowerCase();
      if (h.length === 4) h = '#' + h.slice(1).split('').map((c) => c + c).join('');
      return h;
    });

  const offToken = [...new Set(hexes)].filter((h) => !ANDELA_TOKEN_HEXES.has(h));
  for (const h of offToken) {
    const ratio = contrast(h, '#ffffff');
    const detail = `contrast on white: ${ratio.toFixed(2)}:1`;
    if (ratio < 4.5 && ratio >= 3) {
      r.error('off-token-colour',
        `Hardcoded colour ${h} is not an Andela token and fails AA for normal text`, detail);
    } else {
      r.warn('off-token-colour',
        `Hardcoded colour ${h} is not an Andela token — use a var(--a-*) token`, detail);
    }
  }

  if (/outline\s*:\s*(none|0)/i.test(all)) {
    r.error('focus-outline',
      'CSS removes focus outline (WCAG 2.4.7) — use :focus-visible, never outline:none');
  }
  if (/@font-face/.test(all) && !/font-display/.test(all)) {
    r.warn('font-display', '@font-face without font-display: swap');
  }
}

function checkLiveRegions($, r) {
  const hasLive = $('[aria-live], [role="status"], [role="alert"]').length > 0;
  const looksInteractive = $('button, input, [role="button"]').length > 2 ||
    $('canvas').length > 0;
  if (looksInteractive && !hasLive) {
    r.warn('live-region',
      'Page is interactive but has no aria-live region — dynamic result changes will not be announced (WCAG 4.1.3)');
  }
}

/* -------------------------------------------------------------------- main */

function auditFile(path, opts) {
  const html = readFileSync(path, 'utf8');
  const $ = cheerio.load(html);
  const r = new Report(path);

  checkDocument($, r);
  checkTitleAndMeta($, r);
  checkStructuredData($, r);
  checkHeadings($, r);
  checkLandmarks($, r);
  checkImages($, r);
  checkInteractive($, r);
  checkForms($, r);
  checkMediaAndFrames($, r);
  checkTables($, r);
  checkBasePath($, r, opts.base);
  checkPerformance($, r, html);
  checkCssTokens($, r);
  checkLiveRegions($, r);

  return r;
}

function collectHtml(target) {
  const st = statSync(target);
  if (st.isFile()) return [target];
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (extname(p) === '.html') out.push(p);
    }
  };
  walk(target);
  return out;
}

const COLOUR = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', reset: '\x1b[0m', dim: '\x1b[2m' };

function main() {
  const argv = process.argv.slice(2);
  const target = argv.find((a) => !a.startsWith('--')) || 'dist';
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? null : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true);
  };

  const opts = {
    base: flag('base') === true ? null : flag('base'),
    json: flag('json'),
    warnOnly: !!flag('warn-only'),
    quiet: !!flag('quiet'),
  };

  const files = collectHtml(target);
  if (!files.length) {
    console.error(`No .html files found under ${target}. Run the build first.`);
    process.exit(2);
  }

  const reports = files.map((f) => auditFile(f, opts));
  let totalErrors = 0, totalWarnings = 0;

  for (const r of reports) {
    totalErrors += r.errors.length;
    totalWarnings += r.warnings.length;

    const shown = opts.quiet ? [...r.errors, ...r.warnings] : r.findings;
    const label = relative(process.cwd(), r.file) || r.file;

    if (!shown.length) {
      console.log(`\n\x1b[32m✓\x1b[0m ${label} — clean`);
      continue;
    }

    console.log(`\n${label}`);
    console.log(`${COLOUR.dim}${'─'.repeat(Math.min(label.length, 70))}${COLOUR.reset}`);
    for (const f of shown) {
      const c = COLOUR[f.severity];
      const tag = f.severity.toUpperCase().padEnd(5);
      console.log(`  ${c}${tag}${COLOUR.reset} ${COLOUR.dim}[${f.rule}]${COLOUR.reset} ${f.message}`);
      if (f.detail) console.log(`        ${COLOUR.dim}${f.detail}${COLOUR.reset}`);
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`${files.length} page(s) · ${COLOUR.error}${totalErrors} error(s)${COLOUR.reset} · ${COLOUR.warn}${totalWarnings} warning(s)${COLOUR.reset}`);

  if (opts.json) {
    const path = typeof opts.json === 'string' ? opts.json : 'audit-report.json';
    writeFileSync(path, JSON.stringify({
      generatedAt: new Date().toISOString(),
      base: opts.base,
      summary: { pages: files.length, errors: totalErrors, warnings: totalWarnings },
      pages: reports.map((r) => ({ file: r.file, findings: r.findings })),
    }, null, 2));
    console.log(`JSON written to ${path}`);
  }

  if (totalErrors > 0 && !opts.warnOnly) {
    console.log(`\nFailing because of ${totalErrors} error-severity finding(s).`);
    process.exit(1);
  }
}

main();
