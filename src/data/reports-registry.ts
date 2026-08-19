/**
 * The one place that lists every report on the site.
 *
 * The hub page (src/pages/index.astro) reads this to render the /research
 * archive listing. Adding a new report means adding one entry here —
 * nothing else needs to know a new page exists.
 *
 * `slug` MUST match the report's filename under src/pages/reports/ exactly
 * (src/pages/reports/<slug>.astro → /reports/<slug> here; Webflow Cloud's
 * file-based routing is what actually creates the URL. This registry does
 * not control routing — it only controls what the hub lists and what each
 * page reports to search engines via noindex.
 *
 * status:
 *   'draft'     — page builds and is reachable by direct URL (so it can be
 *                 previewed/shared for review), but is marked noindex and
 *                 does not appear on the /research hub.
 *   'published' — indexed, listed on the hub.
 *
 * To fully unpublish something (make it 404, not just unlisted), delete or
 * rename its src/pages/reports/<slug>.astro file instead.
 */
export interface ReportEntry {
  slug: string;
  title: string;
  description: string;
  status: 'draft' | 'published';
  publishedAt: string; // ISO date, used for sorting and dateModified
}

export const REPORTS: ReportEntry[] = [
  {
    slug: 'emergent-roles',
    title: 'Emergent role classification from skill mapping',
    description:
      'Detecting emergent software roles in Fortune 500 hiring through cross-boundary skill bleed: 47,101 postings, 2,026 skills, 23 candidate roles.',
    status: 'published',
    publishedAt: '2026-06-16',
  },
];

export function publishedReports(): ReportEntry[] {
  return REPORTS.filter((r) => r.status === 'published').sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function reportBySlug(slug: string): ReportEntry | undefined {
  return REPORTS.find((r) => r.slug === slug);
}
