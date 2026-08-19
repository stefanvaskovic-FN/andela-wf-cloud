import topSkillsData from './topSkills.json';

export interface TopSkill {
  id: string;
  home: string;
  pc: number;
}

/**
 * The 8 most cross-role-connected skills in the (subsampled) bleed graph,
 * by posting count. Computed at build time from the same source as
 * public/data/emergent-roles/graph.json — see the porting notes in explorer.ts.
 *
 * This exists specifically so the #graph force-diagram has a real,
 * prerendered text equivalent: a <canvas>/SVG data-viz conveys none of its
 * content to a screen reader or a crawler, so the concrete top skills are
 * listed in a visually-hidden table right next to it (see index.astro).
 */
export const TOP_SKILLS = topSkillsData as TopSkill[];
