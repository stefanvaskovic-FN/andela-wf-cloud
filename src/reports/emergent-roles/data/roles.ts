/**
 * Build-time data for the Emergent Role Explorer.
 *
 * This is the content the page STATES — candidate names, descriptions,
 * headline counts, validation stats — so it's imported here (not fetched)
 * and rendered straight into the prerendered HTML. Crawlers and screen
 * readers see the actual research findings on first paint.
 *
 * The much larger skill-bleed graph (a 200-skill subsample carrying 2,713
 * of the full corpus's 4,093 cross-role edges) is NOT here. It only powers
 * the interactive map after someone scrolls to it, so it lives in
 * public/data/emergent-roles/graph.json and is fetched lazily — see
 * src/reports/emergent-roles/scripts/explorer.ts.
 */
import candsData from './cands.json';
import valData from './val.json';

export interface HomeMix {
  [role: string]: number;
}

export interface Candidate {
  rank: number;
  label: string;
  emergence: number | null;
  bleed: number | null;
  median_vintage: number | null;
  pct_recent: number;
  n_dated: number;
  n_top: number;
  coverage: number;
  n_members: number;
  n_home_roles: number;
  hub_share: number;
  home_mix: HomeMix;
  bridging: string[];
  canon: 'in-canon' | 'in-the-wild';
  desc: string;
  div_rate: number;
  n_div: number;
  n_pure: number;
  ex_title: string;
  ex_role: string;
  ex_matched: string[];
  artifact?: boolean;
}

export interface RecallDetail {
  candidate_index: number;
  matched_skills: string[];
  matched_worlds: string[];
  candidate_label: string;
}

export interface ValidationData {
  recall: {
    recall: number;
    n_recovered: number;
    n_total: number;
    detail: Record<string, RecallDetail | null>;
  };
  null: {
    n_perm: number;
    observed_edges: number;
    observed_candidates: number;
    null_edges_mean: number;
    null_edges_std: number;
    z_edges: number;
    null_candidates_mean: number;
    null_candidates_std: number;
    interpretation: string;
  };
  syn: {
    sampled: number;
    mean_cos: number;
    max_cos: number;
    leak_rate: number;
    suspected: [string, string, number][];
  };
}

export const CANDS = candsData as Candidate[];
export const VAL = valData as ValidationData;

export function tierOf(c: Pick<Candidate, 'emergence' | 'median_vintage'>): 'live' | 'warm' | 'stable' | 'na' {
  if (c.emergence === null || c.emergence === undefined || c.median_vintage == null) return 'na';
  if (c.median_vintage >= 2018) return 'live';
  if (c.median_vintage >= 2010) return 'warm';
  return 'stable';
}

export function tierLabel(t: 'live' | 'warm' | 'stable' | 'na'): string {
  return { live: 'Emerging', warm: 'Recent', stable: 'Settled', na: 'Not scored' }[t];
}

export const fmt = (n: number): string => n.toLocaleString('en-US');

/** Fixed bleed-rank (1 = widest-bleeding), keyed by each role's rank. Display-only. */
export function bleedRankMap(): Map<number, number> {
  const m = new Map<number, number>();
  [...CANDS]
    .sort((a, b) => (b.bleed ?? -1) - (a.bleed ?? -1))
    .forEach((c, i) => m.set(c.rank, i + 1));
  return m;
}

/**
 * Home-mix legend swatch colours (the small coloured squares in each
 * featured card / table detail row showing which established roles a
 * candidate bridges). The first five are Andela primaries; the sixth
 * ("other", grouping any roles beyond the top 5) is a new muted grey the
 * design system doesn't define — extending per andela-design-system's
 * guidance rather than reusing an existing token that means something else.
 * It's a decorative colour swatch always paired with a text label (the role
 * name + percentage), never the sole carrier of meaning, so the 1.49:1
 * contrast-on-white the QA audit flags doesn't apply the way it would to text.
 */
export const MIXCOL = ['#338632', '#307C84', '#7CBFC7', '#7FC87C', '#B0D6CE', '#cbd6d2'];
