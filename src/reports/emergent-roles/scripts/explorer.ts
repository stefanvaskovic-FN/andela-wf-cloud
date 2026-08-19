/**
 * Client-side behaviour for the Emergent Role Explorer research page.
 *
 * Ported from the original prototype's inline <script>. Kept as vanilla DOM
 * manipulation — no framework needed here, see webflow-cloud-astro's
 * porting-guide ("what not to change").
 *
 * Changes from the prototype, per the porting guide and the QA audit:
 * - The skill-bleed graph payload (a 200-skill subsample, 2,713 edges) is
 *   fetched lazily from public/data/emergent-roles/graph.json when the
 *   #graph element scrolls into view, instead of being parsed and evaluated
 *   before the page is interactive.
 * - The catalog table's sortable headers are real <button> elements (added
 *   in the markup) and its expandable rows are keyboard-operable
 *   (tabindex="0", role="button", Enter/Space to toggle).
 * - Every meaningful update (sort, expand/collapse, graph loaded) announces
 *   through the shared #a11y-status live region.
 */
import * as d3 from 'd3';
import { CANDS, VAL, tierOf, tierLabel, fmt, MIXCOL, bleedRankMap, type Candidate } from '../data/roles';

// No BASE_URL/base computation — see astro.config.mjs.

function announce(msg: string) {
  const el = document.getElementById('a11y-status');
  if (el) el.textContent = msg;
}

/* ---------- ranking chart ---------- */
function rankChart() {
  try {
    const host = document.getElementById('rankchart');
    // Prerendered by the Astro page (src/pages/index.astro) so crawlers and
    // screen readers see the ranking without JS. Client script only needs to
    // attach the scroll-triggered bar-fill animation (see reveal()) — skip
    // re-inserting rows that are already there.
    if (!host || host.children.length > 0) return;
    const rows = [...CANDS].sort((a, b) => (b.bleed ?? -1) - (a.bleed ?? -1));
    rows.forEach((c) => {
      const bl = c.bleed;
      const row = document.createElement('div');
      row.className = 'rank-row';
      const pct = bl === null || bl === undefined ? 0 : Math.max(2, bl * 100);
      row.innerHTML =
        `<div class="nm">${c.label}</div>` +
        `<div class="cov">${fmt(c.coverage)}</div>` +
        `<div class="bar-track"><div class="bar-fill" data-w="${pct}" style="width:0;background:var(--a-emerald)"></div></div>` +
        `<div class="sc">${bl === null || bl === undefined ? '–' : bl.toFixed(3)}</div>`;
      host.appendChild(row);
    });
  } catch (e) {
    console.error('rankChart:', e);
  }
}

/* ---------- emergence map: recency (x) × bleed (y) ---------- */
function scatter() {
  try {
    const timelineEl = document.getElementById('timeline');
    const tip = document.getElementById('ttip');
    if (!timelineEl || !tip) return;
    const svg = d3.select('#timeline');
    const W = timelineEl.clientWidth || 1000;
    const H = 470,
      padT = 30,
      padB = 48,
      padR = 26,
      padL = 44,
      laneW = 120,
      gap = 28;
    svg.attr('width', W).attr('height', H);
    const baseY = H - padB,
      plotL = padL + laneW + gap,
      laneX = padL + laneW / 2;

    const dated = CANDS.filter((c) => c.median_vintage);
    const undated = CANDS.filter((c) => !c.median_vintage);
    const x = d3
      .scaleLinear()
      .domain([Math.max(1990, Math.min(2008, (d3.min(dated, (d) => d.median_vintage) ?? 2008) - 1)), 2025])
      .range([plotL + 12, W - padR])
      .clamp(true);
    const y = d3.scaleLinear().domain([0, 1]).range([baseY, padT]);
    const r = d3
      .scaleSqrt()
      .domain([1, d3.max(CANDS, (d) => d.coverage) ?? 1])
      .range([5, 24]);

    svg
      .append('rect')
      .attr('x', x(2018))
      .attr('y', padT - 6)
      .attr('width', W - padR - x(2018))
      .attr('height', baseY - (padT - 6))
      .attr('fill', '#ECF7EC')
      .attr('opacity', 0.5);
    svg
      .append('text')
      .attr('class', 'sc-quad')
      .attr('x', W - padR - 6)
      .attr('y', padT + 8)
      .attr('text-anchor', 'end')
      .attr('fill', '#5ca15a')
      .text('new & cross-cutting');

    svg
      .append('rect')
      .attr('class', 'sc-lane')
      .attr('x', padL - 6)
      .attr('y', padT - 6)
      .attr('width', laneW)
      .attr('height', baseY - (padT - 6))
      .attr('rx', 10);
    svg.append('text').attr('class', 'sc-quad').attr('x', laneX).attr('y', padT - 16).attr('text-anchor', 'middle').text('vintage');
    svg.append('text').attr('class', 'sc-quad').attr('x', laneX).attr('y', padT - 5).attr('text-anchor', 'middle').text('unknown');

    const ax = svg.append('g').attr('class', 'sc-axis');
    ax.append('line').attr('x1', plotL).attr('x2', W - padR).attr('y1', baseY).attr('y2', baseY);
    [2010, 2014, 2018, 2022, 2025].forEach((t) => {
      ax.append('text').attr('x', x(t)).attr('y', baseY + 20).attr('text-anchor', 'middle').text(String(t));
    });
    const minVintage = d3.min(dated, (d) => d.median_vintage) ?? 2025;
    if (minVintage < 1990) {
      ax.append('text').attr('x', x(1990)).attr('y', baseY + 20).attr('text-anchor', 'middle').text('≤1990');
    }
    ax
      .append('text')
      .attr('class', 'axlabel')
      .attr('x', (plotL + W - padR) / 2)
      .attr('y', baseY + 39)
      .attr('text-anchor', 'middle')
      .text('median technology vintage  →  newer');
    ax.append('line').attr('x1', plotL).attr('x2', plotL).attr('y1', padT - 6).attr('y2', baseY);
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      ax.append('text').attr('x', plotL - 9).attr('y', y(v) + 4).attr('text-anchor', 'end').text(v.toFixed(2));
    });
    ax
      .append('text')
      .attr('class', 'axlabel')
      .attr('transform', `translate(13,${(padT + baseY) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('cross-role bleed  →  wider');

    type Positioned = Candidate & { _tx: number; _ty: number; x?: number; y?: number };
    (dated as Positioned[]).forEach((d) => {
      d._tx = x(d.median_vintage as number);
      d._ty = y(d.bleed ?? 0);
    });
    (undated as Positioned[]).forEach((d) => {
      d._tx = laneX;
      d._ty = y(d.bleed ?? 0);
    });
    const all = [...(dated as Positioned[]), ...(undated as Positioned[])];
    all.forEach((d) => {
      d.x = d._tx;
      d.y = d._ty;
    });
    const sim = d3
      .forceSimulation(all as any)
      .force('x', d3.forceX((d: any) => d._tx).strength(0.65))
      .force('y', d3.forceY((d: any) => d._ty).strength(0.65))
      .force('collide', d3.forceCollide((d: any) => r(d.coverage) + 1.5))
      .stop();
    for (let i = 0; i < 220; i++) sim.tick();

    const node = svg.append('g').selectAll('g.sc').data(all as any[]).join('g').attr('class', 'sc');
    node
      .append('circle')
      .attr('class', 'sc-dot')
      .attr('cx', (d: any) => d.x)
      .attr('cy', (d: any) => d.y)
      .attr('r', (d: any) => r(d.coverage))
      .attr('fill', '#338632')
      .attr('fill-opacity', 0.85)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .on('mousemove', (e: MouseEvent, d: any) => {
        const box = (tip.parentElement as HTMLElement).getBoundingClientRect();
        tip.style.opacity = '1';
        tip.style.left = e.clientX - box.left + 14 + 'px';
        tip.style.top = e.clientY - box.top + 10 + 'px';
        tip.innerHTML =
          '<b>' + d.label + '</b><br>' + (d.median_vintage ? 'vintage ' + d.median_vintage : 'vintage unknown') +
          '<br>bleed ' + (d.bleed != null ? d.bleed.toFixed(3) : '–') + '<br>' + fmt(d.coverage) + ' postings';
      })
      .on('mouseleave', () => {
        tip.style.opacity = '0';
      });

    const topBleed = [...CANDS].sort((a, b) => (b.bleed ?? -1) - (a.bleed ?? -1)).slice(0, 3);
    const newest = [...dated].sort((a, b) => (b.median_vintage as number) - (a.median_vintage as number))[0];
    const labelArr = topBleed.concat(newest && !topBleed.includes(newest) ? [newest] : []);
    const labelIdx = new Map(labelArr.map((c, i) => [c.label, i]));
    node
      .filter((d: any) => labelIdx.has(d.label))
      .append('text')
      .attr('x', (d: any) => d.x)
      .attr('y', (d: any) => ((labelIdx.get(d.label) as number) % 2 === 0 ? d.y - r(d.coverage) - 6 : d.y + r(d.coverage) + 14))
      .attr('text-anchor', 'middle')
      .attr('font-size', '11')
      .attr('font-weight', '600')
      .attr('fill', '#132128')
      .attr('style', 'paint-order:stroke;stroke:#fff;stroke-width:3.5px;stroke-linejoin:round')
      .text((d: any) => (d.label.length > 20 ? d.label.slice(0, 19) + '…' : d.label));
  } catch (e) {
    console.error('scatter:', e);
  }
}

/* ---------- featured card / table detail-row markup ---------- */
export function cardHTML(c: Candidate, showRank = true): string {
  const t = tierOf(c);
  const tb = `<span class="badge ${t}" title="Recency band from the bundle's median technology birth year (Emerging: 2018 or later; Recent: 2010 to 2017; Settled: before 2010). The number beside it is the recency score from 0 to 1.">${tierLabel(t)}${c.emergence !== null ? ' · ' + c.emergence.toFixed(3) : ''}</span>`;
  const ab = c.artifact
    ? ' <span class="badge na" title="Flagged in the July 2026 manual audit as a detection artifact: no XR-specific skills; cross-home edges come from Android tooling split across Mobile and VR/AR home roles">flagged artifact</span>'
    : '';
  const cb =
    c.canon === 'in-the-wild'
      ? '<span class="badge wild" title="Detected as a coherent bundle in Fortune 500 hiring, but standard occupation dictionaries (O*NET, ESCO, Lightcast) do not yet name it as a role">In the wild</span>'
      : '<span class="badge canon" title="A role that standard occupation dictionaries (O*NET, ESCO, Lightcast) already recognize by name">In canon</span>';

  const entries = Object.entries(c.home_mix);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const top = entries.slice(0, 5);
  const restPct = Math.round((100 * (total - top.reduce((s, [, v]) => s + v, 0))) / total);
  let segs = '',
    key = '';
  top.forEach(([role, v], i) => {
    const p = (100 * v) / total;
    segs += `<span style="width:${p}%;background:${MIXCOL[i]}"></span>`;
    key += `<span style="margin-right:14px;white-space:nowrap"><i style="background:${MIXCOL[i]}"></i>${role} ${Math.round(p)}%</span>`;
  });
  if (restPct > 0) {
    segs += `<span style="width:${restPct}%;background:${MIXCOL[5]}"></span>`;
    key += `<span style="white-space:nowrap"><i style="background:${MIXCOL[5]}"></i>other ${restPct}%</span>`;
  }
  const chips = c.bridging
    .slice(0, 10)
    .map((s) => `<span class="chip bridge">${s}</span>`)
    .join('');
  const vintage = c.median_vintage
    ? `median ${c.median_vintage}${c.pct_recent > 0 ? ` · ${Math.round(c.pct_recent * 100)}% born ≥2023` : ``} (${c.n_dated}/${c.n_top} dated)`
    : `${c.n_dated}/${c.n_top} skills dated, too thin to score`;

  return `
    <div class="fcard">
      <div class="left">
        <div class="fhead">
          ${showRank ? `<span class="rk">#${c.rank}</span>` : ``}
          <h3>${c.label}</h3>
          ${tb} ${cb}${ab}
        </div>
        <p class="desc">${c.desc}</p>
        <div class="chips-cap">The detected bundle: ${Math.min(10, c.bridging.length)} of its ${c.n_members} skills, each with its canonical home in one of the roles this candidate bridges. These are the skills doing the bleeding, not a full job profile: ubiquitous skills (Python, Git, SQL&hellip;) carry no bleed signal and are excluded by design.</div>
        <div class="chips">${chips}</div>
      </div>
      <div class="right">
        <div class="rlabel">Bridges these roles</div>
        <div class="mix-bar">${segs}</div>
        <div class="mix-key">${key}</div>
        <div style="margin-top:18px">
          <div class="meta-row"><span class="k">Coverage</span><span class="v">${fmt(c.coverage)} postings · ${c.n_members} skills</span></div>
          <div class="meta-row"><span class="k">Vintage</span><span class="v">${vintage}</span></div>
          <div class="meta-row"><span class="k">Cross-role bleed</span><span class="v">${c.bleed != null ? c.bleed.toFixed(3) : '–'} · spans ${c.n_home_roles} established roles</span></div>
          <div class="meta-row"><span class="k">Title gap</span><span class="v">${fmt(c.n_div)} of ${fmt(c.n_pure)} pure-title postings (${Math.round(c.div_rate * 100)}%) already show the bundle</span></div>
        </div>
      </div>
    </div>`;
}

/* ---------- featured cards ---------- */
function featured() {
  try {
    const host = document.getElementById('featured-cards');
    // Prerendered — see rankChart() above for why this is a no-op guard.
    if (!host || host.children.length > 0) return;
    CANDS.slice(0, 6).forEach((c) => host.insertAdjacentHTML('beforeend', cardHTML(c)));
  } catch (e) {
    console.error('featured:', e);
  }
}

/* ---------- catalog table ---------- */
function table() {
  try {
    const tbody = document.querySelector('#catalog-table tbody');
    if (!tbody) return;
    let sortK: keyof Candidate | 'label' = 'bleed';
    let asc = false;
    let openRank: number | null = null;
    const bleedRank = bleedRankMap();

    function summaryMix(m: Record<string, number>) {
      const tot = Object.values(m).reduce((s, x) => s + x, 0);
      return Object.entries(m)
        .slice(0, 3)
        .map(([r, v]) => `${r} ${Math.round((100 * v) / tot)}%`)
        .join(' · ');
    }
    function recencyCell(c: Candidate) {
      if (c.emergence === null || c.median_vintage == null)
        return `<span class="rband na">not scored</span><span class="rdated">${c.n_dated}/${c.n_top} dated</span>`;
      const yr = c.median_vintage;
      const b = yr >= 2018 ? ['emerging', 'Emerging'] : yr >= 2010 ? ['recent', 'Recent'] : ['settled', 'Settled'];
      return `<span class="ryear">${yr}</span><span class="rband ${b[0]}">${b[1]}</span><span class="rdated">${c.n_dated}/${c.n_top} dated</span>`;
    }
    function bleedCell(c: Candidate) {
      const bl = c.bleed;
      if (bl === null || bl === undefined) return `<span class="minibar"><span class="mv">–</span></span>`;
      const w = Math.max(3, bl * 100);
      return (
        `<span class="minibar"><span class="mt"><span class="mf" style="width:${w}%;background:#307C84"></span></span>` +
        `<span class="mv">${bl.toFixed(2)}</span></span>`
      );
    }
    function render() {
      const rows = [...CANDS].sort((a, b) => {
        let av: any = a[sortK as keyof Candidate];
        let bv: any = b[sortK as keyof Candidate];
        if (sortK === 'emergence' || sortK === 'bleed') {
          av = av == null ? -1 : av;
          bv = bv == null ? -1 : bv;
        }
        if (sortK === 'label') return asc ? av.localeCompare(bv) : bv.localeCompare(av);
        return asc ? av - bv : bv - av;
      });
      (tbody as HTMLElement).innerHTML = rows
        .map((c) => {
          const status =
            c.canon === 'in-the-wild'
              ? '<span class="badge wild" title="Detected as a coherent bundle in Fortune 500 hiring, but standard occupation dictionaries (O*NET, ESCO, Lightcast) do not yet name it as a role">in the wild</span>'
              : '<span class="badge canon" title="A role that standard occupation dictionaries (O*NET, ESCO, Lightcast) already recognize by name">in canon</span>';
          const statusFull =
            status +
            (c.artifact
              ? ' <span class="badge na" title="Flagged in the July 2026 manual audit as a detection artifact: no XR-specific skills; cross-home edges come from Android tooling split across Mobile and VR/AR home roles">artifact</span>'
              : '');
          const open = c.rank === openRank;
          const main = `<tr class="crow${open ? ' is-open' : ''}" data-rank="${c.rank}" tabindex="0" role="button" aria-expanded="${open}" aria-label="${c.label}, toggle details">
        <td class="rk"><span class="chev">▸</span>${bleedRank.get(c.rank)}</td>
        <td class="role">${c.label}</td>
        <td>${bleedCell(c)}</td>
        <td>${recencyCell(c)}</td>
        <td class="cov">${fmt(c.coverage)}</td>
        <td class="mix hide-sm">${summaryMix(c.home_mix)}</td>
        <td class="hide-sm">${statusFull}</td>
      </tr>`;
          const detail = open ? `<tr class="detail-row"><td colspan="7">${cardHTML(c, false)}</td></tr>` : '';
          return main + detail;
        })
        .join('');
    }
    (tbody as HTMLElement).addEventListener('click', (e) => {
      const tr = (e.target as HTMLElement).closest('tr.crow') as HTMLElement | null;
      if (!tr) return;
      const r = +(tr.dataset.rank as string);
      const wasOpen = r === openRank;
      openRank = wasOpen ? null : r;
      render();
      announce(wasOpen ? 'Row collapsed' : `Details expanded for ${tr.querySelector('.role')?.textContent ?? 'row'}`);
    });
    (tbody as HTMLElement).addEventListener('keydown', (e) => {
      const tr = (e.target as HTMLElement).closest('tr.crow') as HTMLElement | null;
      if (!tr) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const r = +(tr.dataset.rank as string);
        const wasOpen = r === openRank;
        openRank = wasOpen ? null : r;
        render();
        announce(wasOpen ? 'Row collapsed' : `Details expanded for ${tr.querySelector('.role')?.textContent ?? 'row'}`);
      }
    });
    document.querySelectorAll('#catalog-table th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const k = (th as HTMLElement).dataset.k as keyof Candidate | 'label';
        if (k === sortK) asc = !asc;
        else {
          sortK = k;
          asc = k === 'label';
        }
        document.querySelectorAll('#catalog-table th .ar').forEach((a) => a.remove());
        const ar = document.createElement('span');
        ar.className = 'ar';
        ar.textContent = asc ? ' ▴' : ' ▾';
        th.appendChild(ar);
        render();
        announce(`Table sorted by ${String(k)}, ${asc ? 'ascending' : 'descending'}`);
      });
    });
    render();
  } catch (e) {
    console.error('table:', e);
  }
}

/* ---------- recall list ---------- */
function recall() {
  try {
    const host = document.getElementById('recall-list');
    // Prerendered — see rankChart() above for why this is a no-op guard.
    if (!host || host.children.length > 0) return;
    const det = VAL.recall.detail;
    Object.entries(det).forEach(([known, d]) => {
      if (!d) {
        host.insertAdjacentHTML(
          'beforeend',
          `
        <div class="rrow miss">
          <span class="ck">✗</span>
          <span class="known">${known}</span>
          <span class="arrow">not recovered</span>
          <span class="into" style="color:var(--a-green-black)">no candidate matched this role</span>
        </div>`
        );
        return;
      }
      const sk = (d.matched_skills || []).slice(0, 4).join(', ');
      host.insertAdjacentHTML(
        'beforeend',
        `
      <div class="rrow">
        <span class="ck">✓</span>
        <span class="known">${known}</span>
        <span class="arrow">recovered as</span>
        <span class="into">#${d.candidate_index + 1} ${d.candidate_label}</span>
        <span class="sk" style="margin-left:auto">${sk}</span>
      </div>`
      );
    });
  } catch (e) {
    console.error('recall:', e);
  }
}

/* ---------- bleed graph (D3 force) — lazy-loaded on scroll into view ---------- */
interface GraphNode {
  id: string;
  home: string;
  pc: number;
  cand: number;
}
interface GraphEdge {
  s: string;
  t: string;
  w: number;
  cos: number;
}
interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

let graphLoaded = false;
async function loadAndRenderGraph() {
  if (graphLoaded) return;
  graphLoaded = true;
  const el = document.getElementById('graph');
  if (!el) return;
  const loadingMsg = document.createElement('p');
  loadingMsg.className = 'graph-loading';
  loadingMsg.textContent = 'Loading skill-bleed map…';
  el.appendChild(loadingMsg);
  try {
    const res = await fetch('/data/emergent-roles/graph.json');
    const GRAPH: GraphPayload = await res.json();
    loadingMsg.remove();

    const W = el.clientWidth,
      H = el.clientHeight;
    const svg = d3.select('#graph').append('svg').attr('width', W).attr('height', H)
      .attr('role', 'img')
      .attr('aria-label', `Force-directed graph of ${fmt(GRAPH.nodes.length)} skills and ${fmt(GRAPH.edges.length)} cross-role connections. The most-connected skills are listed in the table just below.`);
    const g = svg.append('g');
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 6]).on('zoom', (e) => g.attr('transform', e.transform.toString())));
    const tip = document.getElementById('gtip');
    const maxC = d3.max(GRAPH.nodes, (n) => n.pc) || 1;
    const radius = d3.scaleSqrt().domain([1, maxC]).range([2.5, 15]);
    const nodes = GRAPH.nodes.map((d) => Object.assign({}, d));
    const edges = GRAPH.edges.map((d) => ({ source: d.s, target: d.t, w: d.w, cos: d.cos }));
    const sim = d3
      .forceSimulation(nodes as any)
      .force(
        'link',
        d3
          .forceLink(edges as any)
          .id((d: any) => d.id)
          .distance((d: any) => 26 + (1 - d.cos) * 60)
          .strength(0.12)
      )
      .force('charge', d3.forceManyBody().strength(-58))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide((d: any) => radius(d.pc) + 2));
    const link = g
      .append('g')
      .attr('stroke', '#1f3a3d')
      .attr('stroke-opacity', 0.1)
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke-width', (d: any) => Math.max(0.3, Math.log10(d.w) - 1));
    const node = g
      .append('g')
      .selectAll('circle')
      .data(nodes as any[])
      .join('circle')
      .attr('r', (d: any) => radius(d.pc))
      .attr('fill', '#338632')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .call(drag(sim) as any);
    node
      .on('mousemove', (e: MouseEvent, d: any) => {
        if (!tip) return;
        tip.style.opacity = '1';
        tip.style.left = (e as any).offsetX + 14 + 'px';
        tip.style.top = (e as any).offsetY + 10 + 'px';
        tip.innerHTML = '<b>' + d.id + '</b><br>home role: ' + d.home + '<br>' + fmt(d.pc) + ' postings';
      })
      .on('mouseleave', () => {
        if (tip) tip.style.opacity = '0';
      });
    sim.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);
      node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);
    });
    function drag(s: d3.Simulation<any, undefined>) {
      return d3
        .drag<SVGCircleElement, any>()
        .on('start', (e, d) => {
          if (!e.active) s.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
        })
        .on('end', (e, d) => {
          if (!e.active) s.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        });
    }
    announce('Skill-bleed map loaded');
  } catch (e) {
    loadingMsg.textContent = 'Could not load the skill-bleed map.';
    console.error('graph:', e);
  }
}

function graphLazyLoad() {
  const el = document.getElementById('graph');
  if (!el) return;
  const io = new IntersectionObserver(
    (ents) => {
      ents.forEach((en) => {
        if (en.isIntersecting) {
          loadAndRenderGraph();
          io.disconnect();
        }
      });
    },
    { threshold: 0.1, rootMargin: '200px' }
  );
  io.observe(el);
}

/* ---------- reveal-on-scroll + bar fill ---------- */
function reveal() {
  try {
    const rc = document.getElementById('rankchart');
    const bio = new IntersectionObserver(
      (ents) => {
        ents.forEach((en) => {
          if (en.isIntersecting) {
            rc?.querySelectorAll<HTMLElement>('.bar-fill').forEach((b) => {
              b.style.width = b.dataset.w + '%';
            });
            bio.disconnect();
          }
        });
      },
      { threshold: 0.2 }
    );
    if (rc) bio.observe(rc);
  } catch (e) {
    console.error('reveal:', e);
  }
}

export function initExplorer() {
  rankChart();
  scatter();
  featured();
  table();
  recall();
  graphLazyLoad();
  reveal();
}
