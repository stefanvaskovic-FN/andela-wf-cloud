// astro.config.mjs — Webflow Cloud + Astro
//
// Note what is NOT here: no `base`, no `assetsPrefix`, no adapter, no
// webflow.json needed.
//
// Confirmed by real deployed evidence (not guesswork): Webflow Cloud's edge
// strips the environment's configured Path (e.g. "/research-staging" for
// staging, "/research" for production) BEFORE forwarding the request to
// this app's Worker. A request to https://.../research-staging/foo arrives
// here as a request for plain /foo. This means the app must be built
// completely prefix-agnostic — no "research" anywhere in its own routing,
// asset paths, or config — so the SAME build works correctly under
// whatever Path each environment is configured with.
//
// Earlier versions of this file set `base: '/research'` AND, after that
// caused a redirect loop, physically nested pages/assets under a
// `research/` folder to bake the prefix in manually. Both were wrong for
// the same reason: Webflow Cloud already owns that prefix entirely on its
// own edge. Anything this app does to also account for it either collides
// (the base-path redirect loop) or duplicates it incorrectly (nesting
// everything under research/, which then doesn't match what Webflow
// forwards after stripping).

import { defineConfig } from 'astro/config';

export default defineConfig({
  // `site` is only used for building absolute canonical URLs / schema.org
  // data — set to the real production URL people will actually reach.
  site: 'https://www.andela.com',

  // Prerender by default; this is a static research page.
  output: 'static',

  build: {
    // 'file' (not the default 'directory'): emits reports/emergent-roles.html,
    // a single flat file, instead of reports/emergent-roles/index.html. The
    // directory form creates two URLs for the same page (with and without a
    // trailing slash), and Webflow Cloud's own routing/CDN layer
    // canonicalizes that ambiguity in the opposite direction from what
    // Astro expects — a 307 adding the slash, a 301 removing it, forever.
    // This was already confirmed as a real, separate cause of a redirect
    // loop earlier in this project's history, and got dropped by accident
    // during the later "remove base config" rewrite. Do not remove this
    // again without re-testing the exact "/research-staging/reports/..."
    // (a real page) vs "/research-staging/reports" (a non-existent path)
    // comparison that first revealed it — the real pages loop, the 404s
    // don't, and that asymmetry is the signature of this specific bug.
    format: 'file',
  },
});
