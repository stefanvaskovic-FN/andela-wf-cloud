import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.andela.com',
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
});
