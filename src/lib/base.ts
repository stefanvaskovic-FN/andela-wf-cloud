/**
 * Mount-path helper za Webflow Cloud.
 *
 * `base` u astro.config.mjs mora odgovarati Path-u environmenta ('/research').
 * Astro sam prefiksira bundlovani CSS/JS i url() unutar njega, ali NE prepisuje
 * doslovne stringove u HTML atributima ni runtime fetch() pozive — za njih
 * postoji ova funkcija.
 *
 * Pažnja: import.meta.env.BASE_URL u Astro 7 dolazi BEZ trailing slasha
 * ('/research'), a u nekim konfiguracijama SA njim ('/research/'). Zato se
 * ovdje normalizuju obje strane — nikad ne spajati stringove ručno.
 *
 *   withBase('images/logo.png')   -> '/research/images/logo.png'
 *   withBase('/images/logo.png')  -> '/research/images/logo.png'
 *   withBase('/')                 -> '/research'
 *
 * Bez podešenog base-a (BASE_URL === '/') vraća obične root-relativne putanje,
 * pa isti kod radi i lokalno i na mount pathu.
 */
export function withBase(path = ''): string {
  const b = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const p = path.replace(/^\/+/, '');
  return p ? `${b}/${p}` : b || '/';
}
