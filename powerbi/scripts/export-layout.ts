// Writes powerbi/layout/manifest.json: every report page of the mock as a list
// of Power BI blocks (Deneb template or native visual), each with its position
// on the 1920x1080 page, its field mapping and its formatting. Positions are
// computed from the app's own layout constants: Page padding, header, gap and
// footer, and the grid templates in src/pages and src/styles.css.
//
// It then validates the manifest and exits with an error if a Deneb block names
// a template that does not exist or leaves a template field unmapped, if any
// field or filter points at a column that is not in the model or a measure that
// is not in measures.dax, if a field's build measure is not in the Build measures
// section of measures.dax (or that section holds one no field uses), or if a
// block leaves the page, overlaps another or runs into the footer, if a
// fixed-height Deneb block is shorter than its spec's meta.json height, or if a
// Deneb block's row columns come from more than one table (the single-table
// check; see ROW_TABLES below). Blocks may only overlap where a read-out card
// sits inside its read-out frame, or the Overview key sits in the domain grid's empty cell.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { REFRESHED } from '../../src/components/Page'
import { DOMAINS, domainById } from '../../src/data/domains'
import { bandFor, scopeDomainScore, teamScore } from '../../src/data/health'
import { LABS, TEAMS } from '../../src/data/labs'
import type { DomainId } from '../../src/data/types'
import { REPORTS } from '../../src/pages/index'
import { lightTheme, slide, type as ty } from '../../src/theme'

const POWERBI = fileURLToPath(new URL('../', import.meta.url))
const TEMPLATES = `${POWERBI}deneb/templates/`
const SPECS = `${POWERBI}deneb/specs/`
const CSV = `${POWERBI}model/csv/`
const MEASURES = `${POWERBI}model/measures.dax`
const STYLES = fileURLToPath(new URL('../../src/styles.css', import.meta.url))
const OUT_DIR = `${POWERBI}layout/`
const OUT = `${OUT_DIR}manifest.json`

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Well = 'dataset' | 'values' | 'rows' | 'columns'

interface Field {
  well: Well
  /** Template field name for Deneb; the column header or label for native visuals. */
  name: string
  /** "<Table>[Column]" from the model CSVs or "[Measure]" from measures.dax. */
  source: string
  /** A build measure (measures.dax, Build measures) wrapping `source`; drag this one into the well. */
  via?: string
  /** Aggregation for a column used as a value in a native visual. */
  aggregation?: 'First' | 'Count' | 'Count (Distinct)'
}

interface Filter {
  level: 'page' | 'visual'
  field: string
  operator: 'is' | 'is not' | 'in' | 'on or after' | 'top'
  value: string | number | boolean | string[]
}

interface Formatting {
  background: string
  border: string
  radius: number
  padding: string
  fontFamily: 'display' | 'body' | 'mono'
  fontSize: keyof typeof ty
  color?: string
}

interface Block {
  id: string
  kind: 'deneb' | 'native'
  visual: string
  x: number
  y: number
  width: number
  height: number
  title: string
  fields: Field[]
  filters: Filter[]
  formatting: Formatting
  notes: string
  /** Text lines a text box or text card is sized for; export-pbip.ts checks the font fits. */
  lines?: number
  /** Deneb spec params set for this block, by name (bar-list unitLabel). */
  params?: Record<string, string | number>
  /** Replaces the spec's own title text for this block (bar-list reused for counts). */
  specTitle?: string
}

// ---------------------------------------------------------------------------
// Layout constants, from src/theme.ts, src/components/Page.tsx and styles.css
// ---------------------------------------------------------------------------

const X0 = slide.padding
const CONTENT_W = slide.width - 2 * slide.padding
/** Footer: a 20px gap above it, 12 padding, 1 border and a 23px status-pill row, its bottom edge on the 48px page margin. */
const FOOTER_H = 36
const FOOTER_Y = slide.height - slide.padding - FOOTER_H
const BODY_BOTTOM = FOOTER_Y - slide.gap
/** The size a Deneb spec is designed for (deneb/specs/<name>.meta.json). */
const specSize = (template: string): { width: number; height: number } =>
  JSON.parse(readFileSync(`${SPECS}${template}.meta.json`, 'utf8')) as { width: number; height: number }
/** The field names a template's dataset block lists. */
const templateDataset = (template: string): string[] =>
  (JSON.parse(readFileSync(`${TEMPLATES}${template}.deneb.json`, 'utf8')) as { usermeta: { dataset: { name: string }[] } }).usermeta.dataset.map(
    (d) => d.name,
  )
/** Lab code and colour columns: in Lab.csv when the model export writes them, carried onto Team and Action as calculated columns. */
const LAB_CHIP_COLUMNS = ['LabCode', 'LabColour'].filter((c) => readFileSync(`${CSV}Lab.csv`, 'utf8').split(/\r?\n/)[0].split(',').includes(c))
/** The optional lab chip fields (labCode, labColour) where the template reads them, bound from the row table. */
const labChip = (template: string, table: 'Lab' | 'Team' | 'Action'): Field[] =>
  LAB_CHIP_COLUMNS.map((c) => ({ well: 'dataset' as const, name: `l${c.slice(1)}`, source: `${table}[${c}]` })).filter((f) =>
    templateDataset(template).includes(f.name),
  )
/** Templates drawn at a fixed height: their block takes the meta.json height, and the rows below re-flow. */
const FIXED_HEIGHT = new Set(['page-text', 'overview-hero', 'domain-cards', 'kpi-tiles', 'lab-cards'])
/** The page-text header: kicker, title and a headline of up to two lines. */
const PAGE_TEXT_H = specSize('page-text').height

type Track = number | { fr: number }

/** Resolve a CSS grid track list (px and fr) into [start, size] pairs, rounded to whole pixels. */
function tracks(start: number, total: number, gap: number, list: Track[]): [number, number][] {
  const fixed = list.reduce<number>((a, t) => a + (typeof t === 'number' ? t : 0), 0)
  const frs = list.reduce<number>((a, t) => a + (typeof t === 'number' ? 0 : t.fr), 0)
  const free = total - fixed - gap * (list.length - 1)
  let at = start
  return list.map((t) => {
    const size = typeof t === 'number' ? t : (free * t.fr) / frs
    const from = Math.round(at)
    const to = Math.round(at + size)
    at += size + gap
    return [from, to - from]
  })
}
const fr = (n = 1): Track => ({ fr: n })

// ---------------------------------------------------------------------------
// Formatting presets (theme names; shared.themeNames resolves them)
// ---------------------------------------------------------------------------

const CARD: Formatting = {
  background: 'surface',
  border: 'line',
  radius: slide.radius,
  padding: '18 20',
  fontFamily: 'body',
  fontSize: 'body',
}
/** Deneb blocks: the spec draws everything, so the Power BI container shows no title, background, border or padding. */
const DENEB_BARE: Formatting = { ...CARD, background: 'none', border: 'none', radius: 0, padding: '0' }

// ---------------------------------------------------------------------------
// Build measures: thin wrappers the templates need (six-quarter sparkline
// columns, lower-case band keys, ISO dates). Their DAX is in the Build measures
// section of measures.dax; here they are only named, and checked against it.
// ---------------------------------------------------------------------------

const buildMeasures: string[] = []
function build(name: string): string {
  if (!buildMeasures.includes(name)) buildMeasures.push(name)
  return name
}

const shifted = (measure: string, q: number) => build(`${measure} Q${q}`)

/** q1 to q6, oldest first; q6 is the measure itself. */
const sixQuarters = (measure: string): Field[] =>
  [1, 2, 3, 4, 5, 6].map((q) =>
    q === 6
      ? { well: 'dataset', name: 'q6', source: `[${measure}]` }
      : { well: 'dataset', name: `q${q}`, source: `[${measure}]`, via: shifted(measure, q) },
  )

const bandKey = () => build('Band Key')
const metricBandKey = () => build('Metric Band Key')
const readinessCount = (word: string) => build(`${word[0].toUpperCase()}${word.slice(1)} Metrics`)

// ---------------------------------------------------------------------------
// Block builders
// ---------------------------------------------------------------------------

const TEMPLATE_TITLES = new Set(
  readdirSync(SPECS)
    .filter((f) => f.endsWith('.vl.json'))
    .filter((f) => {
      const title = (JSON.parse(readFileSync(`${SPECS}${f}`, 'utf8')) as { title?: { orient?: string } }).title
      return title !== undefined && title.orient !== 'bottom'
    })
    .map((f) => f.replace('.vl.json', '')),
)

type Box = [number, number, number, number]

function deneb(
  id: string,
  template: string,
  [x, y, width, height]: Box,
  title: string,
  fields: Field[],
  opts: { filters?: Filter[]; formatting?: Formatting; notes?: string; params?: Block['params']; specTitle?: string } = {},
): Block {
  const titleNote = TEMPLATE_TITLES.has(template)
    ? 'The template draws its own title. Power BI visual title, background, border and padding off.'
    : 'Power BI visual title, background, border and padding off.'
  return {
    id,
    kind: 'deneb',
    visual: template,
    x,
    y,
    width,
    height,
    title,
    fields,
    filters: opts.filters ?? [],
    formatting: opts.formatting ?? DENEB_BARE,
    notes: [titleNote, opts.notes].filter(Boolean).join(' '),
    ...(opts.params ? { params: opts.params } : {}),
    ...(opts.specTitle ? { specTitle: opts.specTitle } : {}),
  }
}

const ds = (name: string, source: string): Field => ({ well: 'dataset', name, source })

/** The page-text block: kicker and title from the Page table (one row, by the page's Page[PageKey] filter) and the page's headline measure; returns it and the body top.
 *  `legendWidth` is the width of the legend at the top right of the header area (lab-legend, or readiness-legend on Lineage). */
function header(page: string, headline: Field, legendWidth = 0): { blocks: Block[]; bodyTop: number } {
  return {
    blocks: [
      // Audit accepted: the header spans the content width so the logo placeholder sits at the page's top right corner; the text column stops at 1284px, and the legend sits beneath the logo.
      deneb(`${page}.header`, 'page-text', [X0, slide.padding, CONTENT_W, PAGE_TEXT_H], 'Page header', [ds('kicker', 'Page[Kicker]'), ds('title', 'Page[Title]'), headline], {
        notes: `Kicker ("<report> · <page>"), title and headline in one block, with the logo placeholder at its top right (the showLogo param, on by default). Page[Kicker] and Page[Title] come from the disconnected Page table, which the page-level Page[PageKey] filter cuts to this page's row; the headline is ${headline.via ? `[${headline.via}]` : headline.source}, so it follows the filters. The block spans the content width, so the logo sits at the top right corner (x ${X0 + CONTENT_W - 120}, y ${slide.padding}); the template limits the text column to 1284px and wraps the headline to two lines.${legendWidth ? ` The ${legendWidth}px legend sits beneath the logo, right-aligned, clear of the text column.` : ''} This is the page's one heading.`,
      }),
    ],
    bodyTop: slide.padding + PAGE_TEXT_H + slide.gap,
  }
}

/** The lab legend at the top right of the header area, on pages whose tables show lab chips alone. */
const LAB_LEGEND = specSize('lab-legend')
/** The legend slot beneath the logo: right-aligned to the content edge, y 96 to 124, clear of the 1284px text column. */
const LEGEND_W = LAB_LEGEND.width
const LEGEND_Y = 96
function labLegend(page: string): Block[] {
  return [
    deneb(`${page}.lab-legend`, 'lab-legend', [X0 + CONTENT_W - LEGEND_W, LEGEND_Y, LEGEND_W, LAB_LEGEND.height], 'Lab legend', [
      ds('labId', 'Lab[LabKey]'),
      ds('lab', 'Lab[LabName]'),
      ...labChip('lab-legend', 'Lab'),
      ds('sortOrder', 'Lab[SortOrder]'),
    ], {
      notes: `The four lab chips with their names, right-aligned beneath the logo placeholder (y ${LEGEND_Y} to ${LEGEND_Y + LAB_LEGEND.height}), its right edge on the content edge at ${X0 + CONTENT_W}; place it after the page-text block so it sits on top. Tables on this page show the lab as a chip alone, so this row names them. With a lab chosen in the Lab filter only that lab is drawn.`,
    }),
  ]
}

/** The readiness legend at the top right of the header area, on the Lineage page only (where the lab legend sits on other pages). */
const READINESS_LEGEND = specSize('readiness-legend')
function readinessLegend(page: string): Block[] {
  return [
    deneb(`${page}.legend`, 'readiness-legend', [X0 + CONTENT_W - LEGEND_W, LEGEND_Y, LEGEND_W, READINESS_LEGEND.height], 'Readiness', [ds('quarters', '[Selected Quarters]')], {
      notes:
        `The three readiness pills (drawn ${READINESS_LEGEND.width}px wide), right-aligned beneath the logo placeholder, keying the readiness pills in the matrix and lineage table below. The pills are constant; [Selected Quarters] is bound only so Deneb has a row to render, as it is never blank. The block sits beneath the logo placeholder from y ${LEGEND_Y}, right-aligned, clear of the 1284px text column.`,
    }),
  ]
}

/** The page footer: one page-footer Deneb block the full content width, so every visual on the page is Deneb. */
function footer(page: string, reportName: string): Block[] {
  return [
    deneb(`${page}.footer`, 'page-footer', [X0, FOOTER_Y, CONTENT_W, FOOTER_H], 'Footer', [ds('left', '[Page Footer Left]'), ds('sources', '[Page Sources Refreshed]')], {
      notes: `A 1px line-coloured rule along the top; on the left "Platform Health · ${reportName} · <page>" from [Page Footer Left] (the Page table's ReportName and PageName), on the right [Page Sources Refreshed]: the source systems behind the page's metrics, the page's domain or every core domain, most recently refreshed first against Config[RefreshDate] (${REFRESHED}), five then "+N more".`,
    }),
  ]
}

// ---------------------------------------------------------------------------
// Expected table rows, from the model CSVs
// ---------------------------------------------------------------------------

const csvRows = (table: string): Record<string, string>[] => {
  const [head, ...lines] = readFileSync(`${CSV}${table}.csv`, 'utf8').split(/\r?\n/).filter((l) => l.length)
  const cols = head.split(',')
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])))
}
const countBy = (rows: Record<string, string>[], key: (r: Record<string, string>) => string) => {
  const m = new Map<string, Set<string>>()
  return rows.reduce((acc, r) => acc.set(r.DomainKey, (acc.get(r.DomainKey) ?? new Set()).add(key(r))), m)
}
const ACTION_ROWS = csvRows('Action')
const METRIC_ROWS = csvRows('Metric')
const ACTION_COUNT = ACTION_ROWS.length
const DOMAINS_WITH_ACTIONS = new Set(ACTION_ROWS.map((r) => r.DomainKey)).size
const MAX_DOMAIN_ACTIONS = Math.max(...[...countBy(ACTION_ROWS, (r) => r.ActionKey).values()].map((v) => v.size))
const MAX_DOMAIN_SOURCES = Math.max(
  ...[...countBy(METRIC_ROWS, (r) => `${r.SourceSystem}|${r.IngestionMode}`).values()].map((v) => v.size),
)
/** lineage-table (deneb/specs/lineage-table.vl.json): 44px to the first row, 17px a row, the metrics in domain order split
 *  into two tables where a domain starts past half way; the block is as tall as the longer side plus an 8px margin. */
const DOMAIN_ORDER = new Map(csvRows('Domain').map((r) => [r.DomainKey, Number(r.SortOrder)]))
const LINEAGE_H = (() => {
  const keys = METRIC_ROWS.map((r) => r.DomainKey).sort((a, b) => (DOMAIN_ORDER.get(a) ?? 0) - (DOMAIN_ORDER.get(b) ?? 0))
  const left = keys.filter((k) => keys.indexOf(k) * 2 < keys.length).length
  return 44 + Math.max(left, keys.length - left) * 17 + 8
})()

/** The open actions list (actions-list): the template sorts by severity then due date and draws as many as fit. */
const actionsListFields = (): Field[] => [
  ds('actionId', 'Action[ActionKey]'),
  ds('domain', 'Action[DomainName]'),
  ds('team', 'Action[TeamName]'),
  ...labChip('actions-list', 'Action'),
  ds('description', 'Action[Description]'),
  ds('due', 'Action[DueDate]'),
  ds('severity', 'Action[Severity]'),
]

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

function overviewPage(reportName: string): Block[] {
  const p = 'overview'
  const h = header(p, ds('headline', '[Overview Headline]'), LAB_LEGEND.width)
  const [hero, grid, bottom] = tracks(h.bodyTop, BODY_BOTTOM - h.bodyTop, slide.gap, [
    specSize('overview-hero').height,
    specSize('domain-cards').height,
    fr(),
  ])
  const [heat, week] = tracks(X0, CONTENT_W, slide.gap, [1210, fr()])
  /** The key fills the sixteenth cell of the 8 by 2 domain grid: the last column (the template insets each card 6px in its cell), bottom-aligned with the second row. */
  const key = specSize('overview-key')
  const cellW = CONTENT_W / 8
  return [
    ...h.blocks,
    ...labLegend(p),
    deneb(`${p}.hero`, 'overview-hero', [X0, hero[0], CONTENT_W, hero[1]], 'Composite health', [
      ds('scope', '[Scope Name]'),
      ds('composite', '[Composite]'),
      { well: 'dataset', name: 'healthyDomains', source: '[Domains Healthy]', via: build('Domains Healthy Display') },
      { well: 'dataset', name: 'watchDomains', source: '[Domains Watch]', via: build('Domains Watch Display') },
      { well: 'dataset', name: 'actDomains', source: '[Domains Act]', via: build('Domains Act Display') },
      ds('coreDomains', '[Core Domains]'),
      { well: 'dataset', name: 'teamsNeedingAction', source: '[Teams Needing Action]', via: build('Teams Needing Action Display') },
      ds('worstDomain', '[Worst Domain]'),
      ...sixQuarters('Score'),
    ], {
      notes:
        'Every field is a measure, so the visual receives one row for the scope set by the Lab and Team filters. The template also prints the Overview headline beside the Domain mix bar; the page header above repeats it, as the brief keeps both. The block takes the template\'s designed 180px, as the app band is; its 164px of content is centred.',
    }),
    deneb(`${p}.domains`, 'domain-cards', [X0, grid[0], CONTENT_W, grid[1]], 'Domains', [
      ds('domainId', 'Domain[DomainKey]'),
      ds('domain', 'Domain[DomainName]'),
      { well: 'dataset', name: 'proposed', source: 'Domain[IsCore]', via: build('Is Proposed') },
      ds('score', '[Score]'),
      { well: 'dataset', name: 'band', source: '[Band]', via: bandKey() },
      { well: 'dataset', name: 'driverLabel', source: '[Worst Metric Key]', via: build('Driver Label') },
      { well: 'dataset', name: 'driverValueFormatted', source: '[Metric Value Formatted]', via: build('Driver Value Formatted') },
      { well: 'dataset', name: 'driverTargetFormatted', source: '[Metric Target Formatted]', via: build('Driver Target Formatted') },
      ...sixQuarters('Score'),
    ], {
      formatting: DENEB_BARE,
      notes: `Eight columns by two 134px rows and a 12px gap under the title band (${grid[1]}px), ${DOMAINS.length} cards; the template draws each card, so the visual has no background or border. The sixteenth cell holds the overview-key block. Sort by Domain[DomainName] (sorted by Domain[SortOrder], the grouped order).`,
    }),
    deneb(`${p}.key`, 'overview-key', [Math.round(X0 + 7 * cellW + 6), grid[0] + grid[1] - key.height, key.width, key.height], 'Key', [ds('quarters', '[Selected Quarters]')], {
      notes: `The band thresholds, the four group tags and the Proposed tag, in the domain grid's empty sixteenth cell (${key.width}x${key.height}). The content is constant; [Selected Quarters] is bound only so Deneb has a row to render. Place it after the domain-cards block so it sits on top.`,
    }),
    deneb(`${p}.heat`, 'heat-matrix', [heat[0], bottom[0], heat[1], bottom[1]], 'Heat by lab', [
      ds('row', 'Lab[LabName]'),
      ...labChip('heat-matrix', 'Lab'),
      ds('domainId', 'Domain[DomainKey]'),
      ds('domain', 'Domain[DomainName]'),
      ds('score', '[Score]'),
      { well: 'dataset', name: 'band', source: '[Band]', via: bandKey() },
    ], {
      filters: [{ level: 'visual', field: 'Domain[IsCore]', operator: 'is', value: true }],
      notes:
        'The model gives one row per lab and core domain. The template\'s Composite column needs extra composite rows the model does not produce, so it stays empty; the lab composite is on the Labs page.',
    }),
    deneb(`${p}.week`, 'actions-list', [week[0], bottom[0], week[1], bottom[1]], 'Priority actions', actionsListFields(), {
      notes: `Open actions by severity then due date, one 20px line a row below 200px of plot height and two-line 58px rows above it, as many as fit, then a "+N more" line; the model has ${ACTION_COUNT} actions. The counts line stays inside overview-hero.`,
    }),
    ...footer(p, reportName),
  ]
}

function labsPage(reportName: string): Block[] {
  const p = 'labs'
  const h = header(p, ds('headline', '[Labs Headline]'), LAB_LEGEND.width)
  const [cards, grid, main] = tracks(h.bodyTop, BODY_BOTTOM - h.bodyTop, slide.gap, [specSize('lab-cards').height, 220, fr()])
  /** Wider than the app's 320px rail, so bump-rank keeps a plot beside its 210px end labels. */
  const [teams, movers] = tracks(X0, CONTENT_W, slide.gap, [fr(), 520])
  return [
    ...h.blocks,
    ...labLegend(p),
    deneb(`${p}.labs`, 'lab-cards', [X0, cards[0], CONTENT_W, cards[1]], 'Labs', [
      ds('labId', 'Lab[LabKey]'),
      ds('lab', 'Lab[LabName]'),
      ...labChip('lab-cards', 'Lab'),
      ds('lead', 'Lab[Lead]'),
      ds('composite', '[Composite]'),
      { well: 'dataset', name: 'band', source: '[Band]', via: bandKey() },
      { well: 'dataset', name: 'healthyTeams', source: '[Teams Healthy]', via: build('Teams Healthy Display') },
      { well: 'dataset', name: 'watchTeams', source: '[Teams Watch]', via: build('Teams Watch Display') },
      { well: 'dataset', name: 'actTeams', source: '[Teams Needing Action]', via: build('Teams Needing Action Display') },
      ...sixQuarters('Score').slice(0, 5),
      ds('q6', '[Composite]'),
    ], {
      formatting: DENEB_BARE,
      notes: `One card per lab, ${LABS.length} in a row, drawn by the template; the sparkline is the lab composite over six quarters. Each card title carries the lab's chip, so the row doubles as the lab legend for the chips on other pages. Clicking a card cross-filters by lab. With a lab chosen in the Lab filter only that lab's card is drawn; the app keeps all four visible.`,
    }),
    deneb(`${p}.grid`, 'lab-sparkline-grid', [X0, grid[0], CONTENT_W, grid[1]], 'Lab by domain', [
      ds('lab', 'Lab[LabName]'),
      ...labChip('lab-sparkline-grid', 'Lab'),
      ds('domainId', 'Domain[DomainKey]'),
      ds('domain', 'Domain[DomainName]'),
      ds('quarter', 'Quarter[QuarterKey]'),
      ds('score', '[Score]'),
      { well: 'dataset', name: 'band', source: '[Band]', via: bandKey() },
    ], {
      filters: [
        { level: 'visual', field: 'Domain[IsCore]', operator: 'is', value: true },
        { level: 'visual', field: '[In Selected Period]', operator: 'is', value: 1 },
      ],
      notes: `Beneath the lab cards, the full content width: a sparkline cell per lab and core domain over the selected quarters, tinted by the latest band, which carries the word in its tooltip. Rows are Lab by core Domain by Quarter, every cell real. The team matrix and movers below give up the height (${grid[1]}px and a gap).`,
    }),
    deneb(`${p}.teams`, 'team-matrix', [teams[0], main[0], teams[1], main[1]], 'Teams', [
      ds('team', 'Team[TeamName]'),
      ds('lab', 'Team[LabName]'),
      ...labChip('team-matrix', 'Team'),
      ds('composite', '[Team Composite]'),
      ds('domain', 'Domain[DomainName]'),
      ds('domainOrder', 'Domain[SortOrder]'),
      ds('score', '[Score]'),
      { well: 'dataset', name: 'band', source: '[Band]', via: bandKey() },
    ], {
      filters: [{ level: 'visual', field: 'Domain[IsCore]', operator: 'is', value: true }],
      notes:
        `One row per team (${TEAMS.length}), weakest composite first, and a heat cell per core domain in Domain[SortOrder] (grouped) order that always shows the score, so colour is never the only cue. Rows are Team by core Domain, every cell real.`,
    }),
    deneb(`${p}.movers`, 'bump-rank', [movers[0], main[0], movers[1], main[1]], `Movers, last N quarters`, [
      ds('team', 'Team[TeamName]'),
      ds('lab', 'Team[LabName]'),
      ...labChip('bump-rank', 'Team'),
      ds('quarter', 'Quarter[QuarterKey]'),
      ds('quarterLabel', 'Quarter[QuarterLabel]'),
      ds('composite', '[Composite]'),
      {
        well: 'dataset',
        name: 'rank',
        source: '[Composite]',
        via: build('Team Rank'),
      },
    ], {
      filters: [{ level: 'visual', field: '[In Selected Period]', operator: 'is', value: 1 }],
      notes:
        'Relaid out: the app rail is 320px wide, which would leave the plot about 94px beside the template\'s 210px end-label column. At 520px the plot keeps about 290px and the end labels stay full size; the team matrix gives up the 200px.',
    }),
    ...footer(p, reportName),
  ]
}

function actionsPage(reportName: string): Block[] {
  const p = 'actions'
  const h = header(p, ds('headline', '[Actions Headline]'), LAB_LEGEND.width)
  const [summary, main] = tracks(h.bodyTop, BODY_BOTTOM - h.bodyTop, slide.gap, [specSize('actions-summary').height, fr()])
  const [open, byDomain] = tracks(X0, CONTENT_W, slide.gap, [fr(), 520])
  return [
    ...h.blocks,
    ...labLegend(p),
    deneb(`${p}.summary`, 'actions-summary', [X0, summary[0], CONTENT_W, summary[1]], 'Actions summary', [
      ds('open', '[Open Actions]'),
      ds('due30', '[Actions Due 30 Days]'),
      ds('pastDue', '[Actions Past Due]'),
      ds('act', '[Actions Act]'),
      ds('thisWeek', '[Actions This Week]'),
      ds('next30', '[Actions Next 30 Days]'),
      ds('later', '[Actions Later]'),
    ], {
      notes: 'Every field is a measure, so the visual receives one row for the scope set by the Lab and Team filters: four tiles (open, due within 30 days, past due, Act severity) and the due-date bar split into past due, this week, next 30 days and later, each bucket named and counted. A blank reads as 0.',
    }),
    deneb(`${p}.table`, 'actions-table', [open[0], main[0], open[1], main[1]], 'Open actions table', [
      ds('actionId', 'Action[ActionKey]'),
      ds('domain', 'Action[DomainName]'),
      ds('team', 'Action[TeamName]'),
      ds('lab', 'Action[LabName]'),
      ...labChip('actions-table', 'Action'),
      ds('description', 'Action[Description]'),
      ds('due', 'Action[DueDate]'),
      ds('severity', 'Action[Severity]'),
      { well: 'dataset', name: 'daysFromRefresh', source: 'Config[RefreshDate]', via: build('Days From Refresh') },
    ], {
      notes: `The app's open actions table: by severity then due date, 28px a row, as many of the ${ACTION_COUNT} as fit, with a status pill that carries the word. The lab is a chip alone; the lab legend in the header names the chips.`,
    }),
    deneb(`${p}.by-domain`, 'bar-list', [byDomain[0], main[0], byDomain[1], main[1]], 'Actions by domain', [
      ds('team', 'Domain[DomainName]'),
      ds('lab', 'Domain[DomainGroupName]'),
      ds('score', '[Open Actions]'),
      { well: 'dataset', name: 'band', source: '[Band]', via: bandKey() },
    ], {
      params: { unitLabel: 'actions' },
      specTitle: 'Actions by domain',
      filters: [{ level: 'visual', field: '[Open Actions]', operator: 'is not', value: 0 }],
      notes: `bar-list with its unitLabel param set to "actions": one bar per domain with open actions (${DOMAINS_WITH_ACTIONS}), most first, in one colour, the count printed beside the bar and the domain group under the name. Band is bound because the template lists it; with a unit label it is not drawn.`,
    }),
    ...footer(p, reportName),
  ]
}

function movementPage(reportName: string): Block[] {
  const p = 'movement'
  const h = header(p, { well: 'dataset', name: 'headline', source: '[Score Delta over Period]', via: build('Movement Headline') }, LAB_LEGEND.width)
  const [charts, teams] = tracks(h.bodyTop, BODY_BOTTOM - h.bodyTop, slide.gap, [426, fr()])
  const [left, right] = tracks(X0, CONTENT_W, slide.gap, [fr(), fr()])
  return [
    ...h.blocks,
    ...labLegend(p),
    // Audit accepted: the x axis is fixed at 60 to 100 so moves read against the band thresholds; scores top out in the 80s, so the right of the plot is headroom, not slack.
    deneb(`${p}.dumbbell`, 'dumbbell-movement', [left[0], charts[0], left[1], charts[1]], 'What moved over the period', [
      ds('domainId', 'Domain[DomainKey]'),
      ds('domain', 'Domain[DomainName]'),
      ds('scope', '[Scope Name]'),
      { well: 'dataset', name: 'from', source: '[Score]', via: build('Score Period Start') },
      ds('to', '[Score]'),
      ds('delta', '[Score Delta over Period]'),
    ], {
      filters: [{ level: 'visual', field: 'Domain[IsCore]', operator: 'is', value: true }],
      notes:
        'Start of the period to now, following the Period filter, as in the app and like the waterfall and the teams table. The template sorts worst mover first. The template draws its own title, "What moved over the period".',
    }),
    deneb(`${p}.waterfall`, 'composite-waterfall', [right[0], charts[0], right[1], charts[1]], 'Why the composite moved', [
      ds('scope', '[Scope Name]'),
      ds('step', 'MovementStep[Step]'),
      ds('label', 'MovementStep[Label]'),
      ds('short', 'MovementStep[Short]'),
      ds('kind', 'MovementStep[Kind]'),
      ds('value', '[Step Value]'),
      ds('running', '[Step Running]'),
      ds('quarters', '[Selected Quarters]'),
    ], {
      notes:
        'One row per MovementStep row: the period start, one delta step per core domain, then now. MovementStep[Short] gives the x axis a short step name (Maturity, Arch.) so neighbouring labels do not touch. MovementStep holds core domains only, so no Domain[IsCore] filter is needed (it would drop the start and end rows). The steps follow the Period filter, and the subtitle reads the period length from quarters.',
    }),
    deneb(`${p}.teams`, 'movement-table', [X0, teams[0], CONTENT_W, teams[1]], 'Movement by team', [
      ds('team', 'Team[TeamName]'),
      ds('lab', 'Team[LabName]'),
      ...labChip('movement-table', 'Team'),
      { well: 'dataset', name: 'from', source: '[Composite]', via: build('Composite Period Start') },
      ds('to', '[Composite]'),
      ds('delta', '[Score Delta over Period]'),
      { well: 'dataset', name: 'bandText', source: '[Band]', via: build('Band Movement') },
      ...[1, 2, 3, 4, 5].map((q): Field => ({ well: 'dataset', name: `q${q}`, source: '[Team Composite]', via: build(`Team Score Q${q}`) })),
      ds('q6', '[Team Composite]'),
    ], {
      notes: `One row per team (${TEAMS.length}), biggest fall first: start of the period, now, the signed change with better, worse or held in words (the template works the word out from the delta), the band movement such as "Watch → Healthy", and a six-quarter composite sparkline in the right-hand column (q1 to q5 from [Team Score Q1] to [Team Score Q5], q6 [Team Composite]: the team in the row at each quarter, so every row draws its own line).`,
    }),
    ...footer(p, reportName),
  ]
}

function domainPage(id: DomainId, reportName: string): Block[] {
  const d = domainById(id)
  if (!d) throw new Error(`Unknown domain ${id}`)
  const p = id
  const h = header(p, ds('headline', '[Domain Headline]'), LAB_LEGEND.width)
  const kpiH = specSize('kpi-tiles').height
  /** The merged bottom strip: actions left, sources right, at the taller of the actions-list and sources-strip heights. */
  const lowH = Math.max(specSize('actions-list').height, specSize('sources-strip').height)
  const [kpi, mid, low] = tracks(h.bodyTop, BODY_BOTTOM - h.bodyTop, slide.gap, [kpiH, fr(), lowH])
  /** Three columns as the app's `1fr 640px 1fr`: 572, 640 and the trend at 572. Maturity swaps metric-heat to the left and gives the ladder the 640 slot. */
  const [left, middle, right] = tracks(X0, CONTENT_W, slide.gap, [fr(), 640, fr()])
  const [acts, srcs] = tracks(X0, CONTENT_W, slide.gap, [fr(), 624])
  const ladderSlot = id === 'maturity' ? middle : left
  const heatSlot = id === 'maturity' ? left : middle

  const concentrate =
    id === 'maturity'
      ? deneb(`${p}.ladder`, 'maturity-ladder', [ladderSlot[0], mid[0], ladderSlot[1], mid[1]], 'Maturity by capability', [
          ds('team', 'Team[TeamName]'),
          ds('lab', 'Team[LabName]'),
          ...labChip('maturity-ladder', 'Team'),
          ds('capability', 'Metric[MetricName]'),
          ds('level', '[Metric Value]'),
        ], {
          filters: [{
            level: 'visual',
            field: 'Metric[MetricKey]',
            operator: 'in',
            value: ['triageMaturity', 'incidentMaturity', 'recoveryMaturity', 'resolutionMaturity', 'serviceMaturity'],
          }],
          notes:
            'Replaces "Domain score by team" on this page and takes the 640px middle slot, the widest in the row, with metric-heat moved to the left; the ladder answers the same question per capability. The template wants about 36px a team; at this height twelve teams get about 24px, so pips sit close.',
        })
      : deneb(`${p}.concentrates`, 'bar-list', [left[0], mid[0], left[1], mid[1]], 'Domain score by team', [
          ds('team', 'Team[TeamName]'),
          ds('lab', 'Team[LabName]'),
          ...labChip('bar-list', 'Team'),
          ds('score', '[Score]'),
          { well: 'dataset', name: 'band', source: '[Band]', via: bandKey() },
        ])

  return [
    ...h.blocks,
    ...labLegend(p),
    deneb(`${p}.kpis`, 'kpi-tiles', [X0, kpi[0], CONTENT_W, kpi[1]], 'Metrics', [
      ds('metricId', 'Metric[MetricKey]'),
      ds('label', 'Metric[MetricName]'),
      ds('value', '[Metric Value]'),
      ds('formatted', '[Metric Value Formatted]'),
      ds('unit', 'Metric[Unit]'),
      ds('target', '[Metric Target]'),
      ds('delta', '[Metric Delta over Period]'),
      { well: 'dataset', name: 'band', source: '[Metric Band]', via: metricBandKey() },
      ds('direction', 'Metric[Direction]'),
      ds('targetFormatted', '[Metric Target Formatted]'),
      ...sixQuarters('Metric Value'),
    ], {
      formatting: DENEB_BARE,
      notes: `${Math.min(d.metrics.length, 5)} tiles of the domain's ${d.metrics.length} metrics, drawn by the template, which caps the band at five (its maxTiles param) and prints "+N more in the heat below" for the rest; sort by Metric[MetricName] (sorted by Metric[SortOrder]). Delta follows the Period filter, as the app's tile does.`,
    }),
    concentrate,
    deneb(`${p}.heat`, 'metric-heat', [heatSlot[0], mid[0], heatSlot[1], mid[1]], 'Metric by team', [
      ds('team', 'Team[TeamName]'),
      ...labChip('metric-heat', 'Team'),
      ds('teamScore', '[Team Domain Score]'),
      ds('metricOrder', 'Metric[SortOrder]'),
      ds('short', 'Metric[ShortName]'),
      ds('formatted', '[Metric Value Formatted]'),
      { well: 'dataset', name: 'band', source: '[Metric Band]', via: metricBandKey() },
    ], {
      filters: [{ level: 'visual', field: 'Metric[IsScored]', operator: 'is', value: true }],
      notes: `One row per team (${TEAMS.length}), worst [Team Domain Score] first, and a column per scored metric of this domain in Metric[SortOrder] order under its short name; each cell prints [Metric Value Formatted], tinted and striped by [Metric Band]. Rows are Team by Metric, every cell real. Clicking a row cross-filters by team.`,
    }),
    deneb(`${p}.trend`, 'trend-target', [right[0], mid[0], right[1], mid[1]], 'Trend, last N quarters', [
      ds('domain', 'Domain[DomainName]'),
      ds('quarter', 'Quarter[QuarterKey]'),
      ds('quarterLabel', 'Quarter[QuarterLabel]'),
      ds('score', '[Score]'),
      ds('scope', '[Scope Name]'),
    ], {
      filters: [{ level: 'visual', field: '[In Selected Period]', operator: 'is', value: 1 }],
      notes: `The trend takes the full ${mid[1]}px of the middle row. The read-out card is not carried: the page headline states the same score and furthest-from-target metric, and the row has no room for both at their designed heights.`,
    }),
    deneb(`${p}.actions`, 'actions-list', [acts[0], low[0], acts[1], low[1]], 'Actions', actionsListFields(), {
      notes: `The left of the merged actions and sources strip: this domain's open actions (the page Domain filter), by severity then due date, as many as fit, then "+N more"; the largest domain has ${MAX_DOMAIN_ACTIONS}.`,
    }),
    // Audit accepted: the strip is sized for the domain with the most sources (MAX_DOMAIN_SOURCES); domains with fewer (Stability) leave room on the right, which keeps the strip identical across domain pages.
    deneb(`${p}.sources`, 'sources-strip', [srcs[0], low[0], srcs[1], low[1]], 'Sources', [
      { well: 'dataset', name: 'sourceOrder', source: 'Metric[SortOrder]', aggregation: 'First' },
      ds('system', 'Metric[SourceSystem]'),
      ds('mode', 'Metric[IngestionMode]'),
      { well: 'dataset', name: 'modeLabel', source: 'Metric[IngestionMode]', via: build('Mode Label') },
      { well: 'dataset', name: 'readiness', source: 'Metric[Readiness]', via: build('Worst Readiness') },
    ], {
      notes: `The right of the merged actions and sources strip: one line per source system and ingestion mode (up to ${MAX_DOMAIN_SOURCES} in a domain) with a readiness pill that carries the word. sourceOrder is Metric[SortOrder] summarised as Minimum (First in the manifest).`,
    }),
    ...footer(p, reportName),
  ]
}

/** The People domain's second page: the leadership chart full width, role composition and skills coverage beneath. */
function peopleStructurePage(reportName: string): Block[] {
  const p = 'people-structure'
  const h = header(p, ds('headline', '[People Structure Headline]'), LAB_LEGEND.width)
  const [lead, mid] = tracks(h.bodyTop, BODY_BOTTOM - h.bodyTop, slide.gap, [specSize('leadership-chart').height, fr()])
  const [left, right] = tracks(X0, CONTENT_W, slide.gap, [fr(), fr()])
  const notPlatformLead: Filter = { level: 'visual', field: 'Person[LeadLevel]', operator: 'is not', value: 1 }
  return [
    ...h.blocks,
    ...labLegend(p),
    deneb(`${p}.leadership`, 'leadership-chart', [X0, lead[0], CONTENT_W, lead[1]], 'Leadership', [
      ds('level', 'Person[LeadLevel]'),
      ds('id', 'Person[PersonKey]'),
      ds('parentId', 'Person[ParentKey]'),
      ds('label', 'Person[Role]'),
      ds('sublabel', 'Person[UnitName]'),
      ds('labCode', 'Person[LabCode]'),
      ds('labColour', 'Person[LabColour]'),
      ds('headcount', '[Span Headcount]'),
      ds('contractorPct', '[Span Contractor Pct]'),
    ], {
      filters: [{ level: 'visual', field: 'Person[IsLead]', operator: 'is', value: true }],
      notes: `The ${specSize('leadership-chart').height}px leadership chart: one platform lead, four lab leads and twelve team leads, one Person row each (Person[IsLead]). Leaders are shown by role and the unit they lead (Person[UnitName]), never by name. [Span Headcount] and [Span Contractor Pct] count the leader's span, so a Lab or Team slicer does not shrink the platform lead's node.`,
    }),
    deneb(`${p}.roles`, 'role-composition', [left[0], mid[0], left[1], mid[1]], 'Role composition by lab', [
      ds('lab', 'Person[LabName]'),
      ds('labCode', 'Person[LabCode]'),
      ds('labColour', 'Person[LabColour]'),
      ds('roleGroup', 'Person[RoleGroup]'),
      ds('count', '[Headcount]'),
      ds('contractors', '[Contractors]'),
    ], {
      filters: [notPlatformLead],
      notes: 'Rows are Person[LabName] by Person[RoleGroup]; the platform lead, who has no lab, is filtered out. Each bar stacks the role groups in the app order, with the contractors in each group as a lighter tail and the lab contractor share to the right.',
    }),
    deneb(`${p}.skills`, 'skills-heat', [right[0], mid[0], right[1], mid[1]], 'Critical skills coverage', [
      ds('skill', 'Skill[SkillName]'),
      ds('lab', 'Person[LabName]'),
      ds('labCode', 'Person[LabCode]'),
      ds('labColour', 'Person[LabColour]'),
      ds('count', '[Skill Count]'),
      ds('estateCount', '[Skill Estate Count]'),
      ds('flag', '[Skill Flag]'),
    ], {
      filters: [notPlatformLead],
      notes: 'Rows are Skill by Person[LabName], every cell real: [Skill Estate Count] ignores the lab grouping, so a skill no one in a lab holds still draws its 0 cell. The spec adds the estate total column from [Skill Estate Count] and the Depth pill from [Skill Flag]; thinnest skills first.',
    }),
    ...footer(p, reportName),
  ]
}

function sourcesPage(reportName: string): Block[] {
  const p = 'lineage'
  const h = header(p, ds('headline', '[Sources Headline]'), LEGEND_W)
  const [matrix, lineage] = tracks(h.bodyTop, BODY_BOTTOM - h.bodyTop, slide.gap, [203, fr()])
  return [
    ...h.blocks,
    ...readinessLegend(p),
    deneb(`${p}.readiness`, 'readiness-matrix', [X0, matrix[0], CONTENT_W, matrix[1]], 'Where the data comes from', [
      ds('domainId', 'Metric[DomainKey]'),
      ds('domain', 'Metric[DomainName]'),
      ds('mode', 'Metric[IngestionMode]'),
      {
        well: 'dataset',
        name: 'modeLabel',
        source: 'Metric[IngestionMode]',
        via: build('Mode Label'),
      },
      { well: 'dataset', name: 'count', source: 'Metric[MetricKey]', aggregation: 'Count' },
      {
        well: 'dataset',
        name: 'worstReadiness',
        source: 'Metric[Readiness]',
        via: build('Worst Readiness'),
      },
      { well: 'dataset', name: 'live', source: 'Metric[Readiness]', via: readinessCount('live') },
      { well: 'dataset', name: 'partial', source: 'Metric[Readiness]', via: readinessCount('partial') },
      { well: 'dataset', name: 'aspirational', source: 'Metric[Readiness]', via: readinessCount('aspirational') },
    ], {
      notes: `All ${DOMAINS.length} domains; Lab and Team filters do not reach Metric, so the page stays estate-wide. It is ${matrix[1]}px high, which puts the template in its compact mode, and splits the domains into two side-by-side halves.`,
    }),
    deneb(`${p}.lineage`, 'lineage-table', [X0, lineage[0], CONTENT_W, lineage[1]], 'Metric sources', [
      ds('domainId', 'Metric[DomainKey]'),
      ds('domain', 'Metric[DomainName]'),
      { well: 'dataset', name: 'domainOrder', source: 'Domain[SortOrder]', aggregation: 'First' },
      ds('metricId', 'Metric[MetricKey]'),
      ds('metricOrder', 'Metric[SortOrder]'),
      ds('metric', 'Metric[MetricName]'),
      ds('system', 'Metric[SourceSystem]'),
      ds('mode', 'Metric[IngestionMode]'),
      { well: 'dataset', name: 'modeLabel', source: 'Metric[IngestionMode]', via: build('Mode Label') },
      ds('refresh', 'Metric[Refresh]'),
      ds('owner', 'Metric[Owner]'),
      ds('readiness', 'Metric[Readiness]'),
    ], {
      notes: `All ${METRIC_ROWS.length} metrics in two side-by-side tables, as the app splits them, in Domain[SortOrder] (grouped) order; domainOrder is Domain[SortOrder] summarised as Minimum, so the rows stay one per metric. It takes the rest of the page (${lineage[1]}px); the longer side needs ${LINEAGE_H}px at 17px a row.`,
    }),
    ...footer(p, reportName),
  ]
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

const PERIOD_PAGES = ['overview', 'labs', 'movement', ...DOMAINS.map((d) => d.id as string)]
const periodFilter: Filter = { level: 'page', field: 'Period[Period]', operator: 'is', value: 'Last 6 quarters' }

const DOMAIN_IDS = new Set(DOMAINS.map((d) => d.id as string))
const isDomainId = (id: string): id is DomainId => DOMAIN_IDS.has(id)

function pageBlocks(pageId: string, reportName: string): Block[] {
  if (pageId === 'overview') return overviewPage(reportName)
  if (pageId === 'labs') return labsPage(reportName)
  if (pageId === 'actions') return actionsPage(reportName)
  if (pageId === 'movement') return movementPage(reportName)
  if (pageId === 'lineage') return sourcesPage(reportName)
  if (pageId === 'people-structure') return peopleStructurePage(reportName)
  if (!isDomainId(pageId)) throw new Error(`export-layout: unknown page id "${pageId}"`)
  return domainPage(pageId, reportName)
}

/** The Page table's title for the pages that are not domain pages; domain pages carry the domain name. Every kicker reads "<report> · <page>". */
const PAGE_TITLE: Record<string, string> = {
  overview: 'Where the platform stands today',
  labs: 'How each lab and team is holding up',
  actions: 'What needs doing',
  movement: 'What moved and why',
  lineage: 'Where every number comes from',
  'people-structure': 'Who we have and what they can do',
}
function pageText(pageId: string, report: string, label: string): [string, string] {
  const d = isDomainId(pageId) ? domainById(pageId) : undefined
  const title = d ? d.name : PAGE_TITLE[pageId]
  if (!title) throw new Error(`export-layout: no page title for "${pageId}"`)
  return [`${report} · ${label}`, title]
}
/** Rows of the disconnected Page table (model/README.md, The Page table), in page order; export-pbip.ts writes it as a DATATABLE. */
const pageTable = {
  columns: ['PageKey', 'Kicker', 'Title', 'ReportName', 'PageName', 'SortOrder'],
  rows: REPORTS.flatMap((r) => r.pages.map((pg) => ({ report: r.name, id: pg.id, label: pg.label }))).map(({ report, id, label }, i) => {
    const [kicker, title] = pageText(id, report, label)
    return [id, kicker, title, report, label, i + 1]
  }),
}

const reports = REPORTS.map((r) => ({
  id: r.id,
  name: r.name,
  model: r.model,
  pages: r.pages.map((pg) => {
    const filters: Filter[] = [{ level: 'page', field: 'Page[PageKey]', operator: 'is', value: pg.id }]
    if (isDomainId(pg.id)) filters.push({ level: 'page', field: 'Domain[DomainKey]', operator: 'is', value: pg.id })
    // The footer's source systems are the People domain's (Workday, Skills register); Domain does not reach Person.
    if (pg.id === 'people-structure') filters.push({ level: 'page', field: 'Domain[DomainKey]', operator: 'is', value: 'people' })
    if (PERIOD_PAGES.includes(pg.id)) filters.push(periodFilter)
    return {
      id: pg.id,
      displayName: pg.label,
      navigationLabel: pg.proposed ? `${pg.label} (Proposed)` : pg.label,
      filters,
      blocks: pageBlocks(pg.id, r.name),
    }
  }),
}))

// Theme names used in formatting, resolved against the light token block in styles.css.
const css = readFileSync(STYLES, 'utf8')
const rootStart = css.indexOf(':root {')
const rootBlock = css.slice(rootStart, css.indexOf('}', rootStart))
const cssVars = new Map([...rootBlock.matchAll(/(--c-[a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]))
const tokenOf = (v: string) => v.replace(/^var\((--c-[a-z-]+)\)$/, '$1')
const colour = (v: string) => ({ token: tokenOf(v), hex: cssVars.get(tokenOf(v)) ?? '' })
const colours: Record<string, { token: string; hex: string }> = {}
for (const [name, value] of Object.entries(lightTheme)) {
  if (typeof value === 'string' && value.startsWith('var(')) colours[name] = colour(value)
}
colours['good-fill'] = colour(lightTheme.bands.healthy.fill)
colours['warn-fill'] = colour(lightTheme.bands.watch.fill)
colours['bad-fill'] = colour(lightTheme.bands.act.fill)

const typeSizes = Object.fromEntries(Object.entries(ty).map(([k, px]) => [k, { px, pt: px * 0.75 }]))

// Figures to expect on the Overview at estate scope, from the app's own functions.
const teamIds = TEAMS.map((t) => t.id)
const estateComposite = Math.round(teamIds.map((id) => teamScore(id)).reduce((a, b) => a + b, 0) / teamIds.length)
const domainChecks = DOMAINS.map((d) => {
  const score = scopeDomainScore(d, teamIds)
  return { domain: d.name, proposed: Boolean(d.proposed), score, band: bandFor(score) }
})
const coreChecks = domainChecks.filter((d) => !d.proposed)

const manifest = {
  generatedBy: 'npm run deneb:layout (powerbi/scripts/export-layout.ts)',
  canvas: { width: slide.width, height: slide.height, units: 'px' },
  shared: {
    reportSettings: {
      pageSize: { type: 'Custom', width: slide.width, height: slide.height },
      pageView: 'Fit to page',
      pageNavigation: 'Hide the page tabs in the published app; the app navigation pane lists the pages',
      enhancedReportFormat: true,
    },
    theme: {
      file: 'powerbi/theme/platform-health.theme.json',
      denebConfig: 'powerbi/deneb/config.json, carried inside every template',
    },
    pageBackground: { name: 'paper', hex: colours.paper.hex, transparency: 0 },
    filterPane: {
      reportLevel: [
        { field: 'Lab[LabName]', type: 'Basic filtering', notes: 'All pages. A single lab gives the lab scope.' },
        { field: 'Team[TeamName]', type: 'Basic filtering', notes: 'All pages. A single team wins over a lab, as in the app.' },
      ],
      pageLevel: [
        {
          field: 'Period[Period]',
          type: 'Basic filtering, Require single selection on',
          pages: PERIOD_PAGES,
          notes: 'Only on the pages listed. Period is disconnected; [Selected Quarters] reads it and defaults to six.',
        },
        { field: 'Domain[DomainKey]', type: 'Basic filtering, locked and hidden', pages: DOMAINS.map((d) => d.id), notes: 'One domain per domain page.' },
        {
          field: 'Page[PageKey]',
          type: 'Basic filtering, locked and hidden',
          pages: pageTable.rows.map((r) => String(r[0])),
          notes: 'Every page: cuts the disconnected Page table to the page\'s own row, so page-text reads its kicker and title.',
        },
      ],
      paneFormatting: 'From the theme: outspacePane and filterCard, panel background and surface cards.',
    },
    themeNames: {
      colours,
      fonts: {
        display: { family: 'Fraunces', fallback: 'Georgia' },
        body: { family: 'Inter', fallback: 'Segoe UI' },
        mono: { family: 'JetBrains Mono', fallback: 'Consolas' },
      },
      typeSizes,
      none: 'Background off, or border off',
    },
    extraTables: [
      { name: 'Period', columns: ['Quarters', 'Period'], definedIn: 'powerbi/model/README.md, The Period table' },
      { name: 'MovementStep', columns: ['Step', 'Label', 'Short', 'Kind', 'DomainKey'], definedIn: 'powerbi/model/README.md, The MovementStep table' },
      { name: 'Page', columns: pageTable.columns, definedIn: 'powerbi/model/README.md, The Page table' },
    ],
    pageTable,
    buildMeasures,
  },
  decisions: [
    'Every block is a Deneb visual, the footer included: page-footer reads [Page Footer Left] and [Page Sources Refreshed]. The page header (kicker, title, headline) is one page-text block reading the disconnected Page table and the page\'s headline measure.',
    'Overview has no room for dumbbell-movement or composite-waterfall: its rows (180px and 280px from the specs\' meta.json, then the remaining height) hold the hero, the domain grid with overview-key in its sixteenth cell, and the heat matrix beside actions-list. Both sit on the Executive summary Movement page instead.',
    'The Maturity page puts maturity-ladder in the 640px middle slot instead of bar-list, with metric-heat on the left.',
    'The Actions page puts actions-summary (tiles and due-date buckets) under the header, then actions-table with bar-list (unitLabel "actions") counting open actions by domain beside it. actions-timeline is not placed.',
    'The Labs team table is team-matrix: teams by core domain with a heat cell per domain in Domain[SortOrder] order.',
    'The Data and sources page keeps readiness-matrix above one full-width lineage-table; the readiness and count tiles and the ingestion patterns text are not carried, as no Deneb template draws them.',
    'The readiness-legend block sits only on the Lineage page, at the top right of the header area where other pages carry the lab legend.',
    'Deneb containers follow each spec\'s meta.json container: "card" gives a white card (line border, radius 18, padding 20) around a spec that draws no card of its own; "bare" is transparent with no border or padding, for specs that draw their own cards or are text.',
    'Every page header is page-text 1824px wide, its text column limited to 1284px and the logo placeholder at the top right corner (x 1752, y 48), with the 520px legend beneath the logo at y 96 to 124, right-aligned; the kicker reads "<report> · <page>". The footer\'s bottom edge sits on the 48px page margin.',
    'Domain pages run a KPI band capped at five tiles, a three-column middle row (domain score by team 572, metric-heat 640, trend 572, as the app\'s 1fr 640px 1fr) and one 180px strip with actions-list left and sources-strip right. The read-out block is not carried. The Labs page puts lab-sparkline-grid beneath the lab cards; the team matrix and movers take the remaining height.',
    'Fields a template needs that the core measures do not provide go through build measures: thin wrappers in the Build measures section of powerbi/model/measures.dax, listed by name in shared.buildMeasures.',
    'The Movement waterfall reads the MovementStep calculated table (start, one row per core domain, end) with [Step Value] and [Step Running], so the start and end bars come from the model.',
  ],
  checks: {
    scope: 'Estate: no Lab or Team filter, Period Last 6 quarters, current quarter Q3 2026',
    composite: estateComposite,
    compositeBand: bandFor(estateComposite),
    coreDomains: coreChecks.length,
    domainsHealthy: coreChecks.filter((d) => d.band === 'healthy').length,
    domainsWatch: coreChecks.filter((d) => d.band === 'watch').length,
    domainsAct: coreChecks.filter((d) => d.band === 'act').length,
    teamsNeedingAction: teamIds.filter((id) => bandFor(teamScore(id)) === 'act').length,
    domains: domainChecks,
  },
  reports,
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

const errors: string[] = []

const daxLines = readFileSync(MEASURES, 'utf8').split(/\r?\n/)
const measureNameOf = (line: string) => (line.startsWith('VAR ') ? undefined : /^([A-Za-z][A-Za-z0-9 ]*?) =\s*$/.exec(line)?.[1])
const measureNames = new Set(daxLines.map(measureNameOf).filter((n): n is string => Boolean(n)))
/** Measures under the Build measures heading of measures.dax, to the next heading or the end. */
const buildStart = daxLines.indexOf('// Build measures')
const buildEnd = daxLines.findIndex((l, i) => i > buildStart + 1 && /^\/\/ =+$/.test(l))
const daxBuildNames = new Set(
  buildStart < 0
    ? []
    : daxLines.slice(buildStart, buildEnd < 0 ? undefined : buildEnd).map(measureNameOf).filter((n): n is string => Boolean(n)),
)
if (buildStart < 0) errors.push('measures.dax has no Build measures section')
/** Calculated name columns export-pbip.ts writes (model/README.md, Calculated columns). */
const CALCULATED_COLUMNS = [
  'Action[DomainName]',
  'Action[TeamName]',
  'Action[LabName]',
  'Action[Status]',
  'Team[LabName]',
  'Metric[DomainName]',
  'Metric[ReadinessWord]',
  ...['Action', 'Team'].flatMap((t) => LAB_CHIP_COLUMNS.map((c) => `${t}[${c}]`)),
]
const columns = new Set<string>([
  'Period[Quarters]',
  'Period[Period]',
  ...['Step', 'Label', 'Short', 'Kind', 'DomainKey'].map((c) => `MovementStep[${c}]`),
  ...pageTable.columns.map((c) => `Page[${c}]`),
  ...CALCULATED_COLUMNS,
])
for (const f of readdirSync(CSV).filter((n) => n.endsWith('.csv'))) {
  const table = f.replace(/\.csv$/, '')
  const head = readFileSync(`${CSV}${f}`, 'utf8').split(/\r?\n/)[0]
  for (const c of head.split(',')) columns.add(`${table}[${c.trim()}]`)
}
const templateFields = new Map<string, string[]>(
  readdirSync(TEMPLATES)
    .filter((f) => f.endsWith('.deneb.json'))
    .map((f): [string, string[]] => {
      const t = JSON.parse(readFileSync(`${TEMPLATES}${f}`, 'utf8')) as { usermeta: { dataset: { name: string }[] } }
      return [f.replace('.deneb.json', ''), t.usermeta.dataset.map((d) => d.name)]
    }),
)
/** Template fields a block may leave unbound; the specs fall back without them. */
const OPTIONAL_FIELDS = ['labCode', 'labColour']
const refOk = (ref: string) => {
  const m = /^\[([^\]]+)\]$/.exec(ref)
  return m ? measureNames.has(m[1]) : columns.has(ref)
}

for (const n of daxBuildNames) if (!buildMeasures.includes(n)) errors.push(`build measure ${n} in measures.dax is not used by any field`)

/**
 * Single-table check. A Deneb visual's rows are the combinations of its grouping
 * columns, so they come from one table: Domain, Team and Lab names beside Action
 * rows gave 23 x 12 x 4 x 13 = 14352 rows in Desktop. Name columns that table
 * carries (Action[DomainName], Team[LabName] and the like) count as its own.
 * GRID_AXES names the templates that cross a second axis on purpose; every cell
 * of those grids is real, and their measures are blank elsewhere.
 */
const ROW_TABLES = new Set(['Action', 'Team', 'Metric', 'Domain', 'Lab', 'MovementStep', 'Page', 'Person'])
const GRID_AXES: Record<string, string[]> = {
  'heat-matrix': ['Domain'],
  'team-matrix': ['Domain'],
  'lab-sparkline-grid': ['Domain', 'Quarter'],
  'bump-rank': ['Quarter'],
  'trend-target': ['Quarter'],
  'maturity-ladder': ['Metric'],
  'metric-heat': ['Metric'],
  'skills-heat': ['Skill'],
}
let singleTableBlocks = 0
function checkSingleTable(where: string, b: Block) {
  const axes = GRID_AXES[b.visual] ?? []
  const grouping = b.fields.filter((f) => !f.via && !f.aggregation && !f.source.startsWith('['))
  const rowTables = [...new Set(grouping.map((f) => f.source.slice(0, f.source.indexOf('['))))].filter((t) => !axes.includes(t))
  if (rowTables.length > 1) errors.push(`${where}: row columns come from ${rowTables.join(', ')}; bind them from one table (the single-table check)`)
  else if (rowTables.length === 1 && !ROW_TABLES.has(rowTables[0])) errors.push(`${where}: rows come from ${rowTables[0]}, which is not a row table`)
  else singleTableBlocks++
}

/**
 * Title check. A block's own title (specTitle, or a title param) must not be the
 * default title of another template, the sign of a block copied from another.
 */
const defaultTitles = new Map<string, string>()
for (const f of readdirSync(SPECS).filter((n) => n.endsWith('.vl.json'))) {
  const spec = JSON.parse(readFileSync(`${SPECS}${f}`, 'utf8')) as { title?: string | { text?: unknown }; params?: { name: string; value?: unknown }[] }
  const text = typeof spec.title === 'string' ? spec.title : spec.title?.text
  const param = spec.params?.find((p) => p.name === 'title')?.value
  const title = typeof text === 'string' ? text : typeof param === 'string' ? param : undefined
  if (title) defaultTitles.set(f.replace('.vl.json', ''), title.toLowerCase())
}
function checkTitle(where: string, b: Block) {
  const own = [b.specTitle, b.params?.title].filter((t): t is string => typeof t === 'string')
  for (const t of own)
    for (const [template, title] of defaultTitles)
      if (template !== b.visual && title === t.toLowerCase()) errors.push(`${where}: title "${t}" is the ${template} template's default title`)
}

const NATIVE = new Set<string>(['card', 'table', 'slicer', 'textbox', 'image'])
let pageCount = 0
for (const r of reports) {
  for (const pg of r.pages) {
    pageCount++
    for (const f of pg.filters) if (!refOk(f.field)) errors.push(`${pg.id}: page filter on unknown ${f.field}`)
    for (const b of pg.blocks) {
      const where = `${pg.id}/${b.id}`
      if (b.kind === 'deneb') {
        const expected = templateFields.get(b.visual)
        if (!expected) errors.push(`${where}: no template named ${b.visual}`)
        else {
          const names = b.fields.map((f) => f.name)
          const missing = expected.filter((n) => !names.includes(n) && !OPTIONAL_FIELDS.includes(n))
          const extra = names.filter((n) => !expected.includes(n))
          if (missing.length) errors.push(`${where}: template fields not mapped: ${missing.join(', ')}`)
          if (extra.length) errors.push(`${where}: fields not in the template: ${extra.join(', ')}`)
          if (new Set(names).size !== names.length) errors.push(`${where}: a template field is mapped twice`)
        }
        if (b.fields.some((f) => f.well !== 'dataset')) errors.push(`${where}: Deneb fields must use the dataset well`)
        checkSingleTable(where, b)
        checkTitle(where, b)
        const specParams = (JSON.parse(readFileSync(`${SPECS}${b.visual}.vl.json`, 'utf8')) as { params?: { name: string }[] }).params ?? []
        for (const name of Object.keys(b.params ?? {}))
          if (!specParams.some((sp) => sp.name === name)) errors.push(`${where}: param ${name} is not in the ${b.visual} spec`)
      } else if (!NATIVE.has(b.visual)) errors.push(`${where}: unknown native visual ${b.visual}`)
      else errors.push(`${where}: native ${b.visual}; every block is a Deneb visual`)
      for (const f of b.fields) {
        if (!refOk(f.source)) errors.push(`${where}: field ${f.name} maps to unknown ${f.source}`)
        if (f.via && !daxBuildNames.has(f.via))
          errors.push(`${where}: field ${f.name} uses build measure ${f.via}, which is not in the Build measures section of measures.dax`)
      }
      for (const f of b.filters) if (!refOk(f.field)) errors.push(`${where}: filter on unknown ${f.field}`)
      if (b.width <= 0 || b.height <= 0 || b.x < 0 || b.y < 0 || b.x + b.width > slide.width || b.y + b.height > slide.height)
        errors.push(`${where}: off the page at ${b.x},${b.y} ${b.width}x${b.height}`)
      if (!/\.footer$/.test(b.id) && b.y + b.height > FOOTER_Y) errors.push(`${where}: runs into the footer (bottom ${b.y + b.height}, footer at ${FOOTER_Y})`)
      if (b.kind === 'deneb' && FIXED_HEIGHT.has(b.visual) && b.height < specSize(b.visual).height)
        errors.push(`${where}: ${b.height}px high, below the ${specSize(b.visual).height}px ${b.visual} is designed for`)
    }
    for (let i = 0; i < pg.blocks.length; i++)
      for (let j = i + 1; j < pg.blocks.length; j++) {
        const a = pg.blocks[i]
        const c = pg.blocks[j]
        const framed =
          ((a.id.endsWith('.read-out') && c.id.startsWith(`${a.id}-`)) || (a.id.endsWith('.domains') && c.id.endsWith('.key'))) &&
          c.x >= a.x && c.y >= a.y && c.x + c.width <= a.x + a.width && c.y + c.height <= a.y + a.height
        const underLogo =
          a.id.endsWith('.header') && c.id.endsWith('legend') && c.x >= a.x + 1284 && c.y >= a.y + 40 && c.x + c.width <= a.x + a.width && c.y + c.height <= a.y + a.height
        if (!framed && !underLogo && a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height)
          errors.push(`${pg.id}: ${a.id} overlaps ${c.id}`)
      }
  }
}
if (reports.length !== 6) errors.push(`expected 6 reports, found ${reports.length}`)
if (pageCount !== 21) errors.push(`expected 21 pages, found ${pageCount}`)

if (errors.length) {
  console.error(`Layout manifest failed validation:\n${errors.map((e) => `  ${e}`).join('\n')}`)
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`)
const blockCount = reports.flatMap((r) => r.pages).reduce((a, p) => a + p.blocks.length, 0)
console.log(
  `Wrote ${OUT}: ${reports.length} reports, ${pageCount} pages, ${blockCount} blocks, ${buildMeasures.length} build measures. Every template, field and filter checked; ${singleTableBlocks} Deneb blocks pass the single-table check.`,
)
