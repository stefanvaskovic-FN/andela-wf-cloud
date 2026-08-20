// astro.config.mjs — Webflow Cloud + Astro
//
// Skafoldovano po zvanicnom Webflow template-u:
// github.com/Webflow-Examples/hello-world-astro
//
// Kljucno: output MORA biti 'server' i adapter mora biti commitovan. Sa
// output:'static' build ne emituje workera, pa na mount path odgovara samo
// Cloudflare static asset handler, koji za research/index.html vraca 307 na
// /research/ (html_handling: auto-trailing-slash). Webflow edge onda 301
// vraca na /research, i to je beskonacna petlja koju nijedan base ili
// build.format ne moze da prekine. Sa 'server' worker sam resava rutiranje.
//
// `base` ostaje '/research' jer withBase() (src/lib/base.ts) cita
// import.meta.env.BASE_URL iz ove vrednosti.
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://www.andela.com',
  base: '/research',
  output: 'server',
  compressHTML: true,
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
});
