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
});
