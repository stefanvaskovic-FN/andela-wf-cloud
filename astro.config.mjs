// astro.config.mjs — Webflow Cloud + Astro
//
// `base` MORA da odgovara Path-u koji je podešen na Webflow Cloud environmentu.
// Webflow Cloud skida prefiks kad traži fajl u dist/ (zato dist/index.html stoji
// na rootu, bez research/ foldera), ali HTML koji ide browseru mora da SADRŽI
// prefiks — browser ga razrješava u odnosu na javni URL. To je posao `base`.
//
// Ne dodavati `trailingSlash` ni `build.format`. Defaulti ('ignore' + 'directory')
// su ono što Webflow Cloud edge očekuje; svako odstupanje pravi 301/307 petlju.
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Koristi se samo za apsolutne canonical / schema.org URL-ove.
  site: 'https://www.andela.com',

  // Mount path Webflow Cloud environmenta.
  base: '/research',

  output: 'static',
});
