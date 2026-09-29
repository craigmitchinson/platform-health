// Writes the flat sample rows each Deneb spec expects, computed with the app's
// own health functions so every number matches the mock.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ACTIONS } from '../../src/data/actions'
import { ALL_METRICS, DOMAINS, domainById, groupById } from '../../src/data/domains'
import {
  BAND_LABEL,
  aggregateMetrics,
  bandFor,
  filteredTeams,
  isScored,
  scopeDomainScore,
  scoreMetric,
  targetFor,
  teamScore,
} from '../../src/data/health'
import { LABS, TEAMS, labById, teamsInLab } from '../../src/data/labs'
import { TEAM_METRICS } from '../../src/data/metrics'
import { LEADERS, PEOPLE, SKILL_COVERAGE, SKILL_FLAG_LABEL, THIN_SKILLS, contractorPct, roleComposition, spanOf } from '../../src/data/people'
import { REPORTS } from '../../src/pages/index'
import type { Domain, LabId, MetricDef, Readiness, SourceMode, TeamId, Unit } from '../../src/data/types'

const OUT_DIR = fileURLToPath(new URL('../deneb/samples/', import.meta.url))
const SOURCE_REFRESH_CSV = fileURLToPath(new URL('../model/csv/SourceRefresh.csv', import.meta.url))
const THEME_FILE = fileURLToPath(new URL('../theme/platform-health.theme.json', import.meta.url))

/** Six quarters ending Q3 2026, oldest first. */
const QUARTER_LABELS = ['Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026']
const TARGET = 80
const CORE_DOMAINS = DOMAINS.filter((d) => !d.proposed)
const ESTATE = filteredTeams()
const ESTATE_IDS = ESTATE.map((t) => t.id)

const mean = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0
const round1 = (n: number) => Math.round(n * 10) / 10

/** Lab colours sit at dataColors 9 to 12 of the Power BI theme, in LABS order. */
const LAB_COLOUR_INDEX = 9
const THEME_COLOURS = (JSON.parse(readFileSync(THEME_FILE, 'utf8')) as { dataColors: string[] }).dataColors
/** A lab's chip code and theme hex, or blanks for the estate. */
function labFields(labId?: LabId) {
  const i = LABS.findIndex((l) => l.id === labId)
  if (i < 0) return { labCode: '', labColour: '' }
  return { labCode: LABS[i].code, labColour: THEME_COLOURS[LAB_COLOUR_INDEX + i] ?? '' }
}

// Mirrors formatValue in src/components/primitives.tsx, which cannot be
// imported here without React.
const UNIT_SUFFIX: Record<Unit, string> = {
  count: '',
  pct: '%',
  days: ' days',
  gbp: '',
  perMonth: ' / month',
  level: ' of 5',
}
function formatValue(value: number, unit: Unit): string {
  if (unit === 'gbp') return `£${value.toLocaleString('en-GB')}`
  if (unit === 'level')
    return `${value.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${UNIT_SUFFIX[unit]}`
  return `${value.toLocaleString('en-GB')}${UNIT_SUFFIX[unit]}`
}

/** Mean team score for one metric across a scope, as the pages band it. */
const metricScore = (def: MetricDef, teamIds: TeamId[]) =>
  mean(teamIds.map((id) => scoreMetric(def, TEAM_METRICS[id][def.id].value)))

/** Domain score for a scope across all six quarters, oldest first. */
/** The group a domain row belongs to, so visuals can band domains as the app does. */
const groupFields = (d: Domain) => ({ group: d.group, groupName: groupById(d.group).name })

const domainTrend = (domain: Domain, teamIds: TeamId[]) =>
  QUARTER_LABELS.map((_, i) => scopeDomainScore(domain, teamIds, QUARTER_LABELS.length - 1 - i))

const scopes: { scope: string; labId?: LabId; teamIds: TeamId[] }[] = [
  { scope: 'Estate', teamIds: ESTATE_IDS },
  ...LABS.map((l) => ({ scope: l.name, labId: l.id, teamIds: teamsInLab(l.id).map((t) => t.id) })),
]

const trend = DOMAINS.flatMap((d) =>
  scopes.flatMap(({ scope, labId, teamIds }) =>
    domainTrend(d, teamIds).map((score, i) => ({
      domain: d.name,
      domainId: d.id,
      quarter: i + 1,
      quarterLabel: QUARTER_LABELS[i],
      score,
      target: TARGET,
      scope,
      ...labFields(labId),
    })),
  ),
)

const domainCards = DOMAINS.map((d) => {
  const score = scopeDomainScore(d, ESTATE_IDS)
  const driver = d.metrics
    .filter(isScored)
    .map((def) => ({ def, score: metricScore(def, ESTATE_IDS) }))
    .sort((a, b) => a.score - b.score)[0]
  const q = domainTrend(d, ESTATE_IDS)
  return {
    domainId: d.id,
    domain: d.name,
    ...groupFields(d),
    proposed: Boolean(d.proposed),
    score,
    band: bandFor(score),
    driverLabel: driver.def.short,
    driverValue: aggregateMetrics(ESTATE_IDS, driver.def).value,
    driverTarget: targetFor(driver.def, ESTATE_IDS.length),
    driverValueFormatted: formatValue(aggregateMetrics(ESTATE_IDS, driver.def).value, driver.def.unit),
    driverTargetFormatted: formatValue(targetFor(driver.def, ESTATE_IDS.length), driver.def.unit),
    q1: q[0],
    q2: q[1],
    q3: q[2],
    q4: q[3],
    q5: q[4],
    q6: q[5],
  }
})

const heatRows = [
  ...LABS.map((l) => ({ row: l.name, rowType: 'lab', labId: l.id, teamIds: teamsInLab(l.id).map((t) => t.id) })),
  ...TEAMS.map((t) => ({ row: t.name, rowType: 'team', labId: t.labId, teamIds: [t.id] })),
]
const heat = heatRows.flatMap(({ row, rowType, labId, teamIds }) => {
  const composite = mean(teamIds.map((id) => teamScore(id)))
  return [
    ...CORE_DOMAINS.map((d) => {
      const score = scopeDomainScore(d, teamIds)
      return { row, rowType, domainId: d.id, domain: d.name, ...groupFields(d), score, band: bandFor(score), ...labFields(labId) }
    }),
    { row, rowType, domainId: 'composite', domain: 'Composite', score: composite, band: bandFor(composite), ...labFields(labId) },
  ]
})

// One row per scope with what the Overview headline rule needs, computed as
// OverviewPage does: the composite is the mean of team composites.
/** A team's composite a number of quarters ago: the mean of its core domain scores. */
const teamCompositeAt = (id: TeamId, quartersAgo: number) =>
  mean(CORE_DOMAINS.map((d) => scopeDomainScore(d, [id], quartersAgo)))

const hero = scopes.map(({ scope, labId, teamIds }) => {
  const domainScores = CORE_DOMAINS.map((d) => ({ name: d.name, score: scopeDomainScore(d, teamIds) }))
  const inBand = (band: string) => domainScores.filter((d) => bandFor(d.score) === band).length
  const worst = domainScores.reduce((w, d) => (d.score < w.score ? d : w))
  return {
    scope,
    ...labFields(labId),
    composite: mean(teamIds.map((id) => teamScore(id))),
    healthyDomains: inBand('healthy'),
    watchDomains: inBand('watch'),
    actDomains: inBand('act'),
    coreDomains: CORE_DOMAINS.length,
    teamsNeedingAction: teamIds.filter((id) => bandFor(teamScore(id)) === 'act').length,
    worstDomain: worst.name,
    ...Object.fromEntries(
      QUARTER_LABELS.map((_, i) => [
        `q${i + 1}`,
        mean(teamIds.map((id) => teamCompositeAt(id, QUARTER_LABELS.length - 1 - i))),
      ]),
    ),
  }
})

const kpi = DOMAINS.flatMap((d) =>
  d.metrics.map((def) => {
    const agg = aggregateMetrics(ESTATE_IDS, def)
    const scored = isScored(def)
    return {
      domainId: d.id,
      metricId: def.id,
      label: def.label,
      value: agg.value,
      formatted: formatValue(agg.value, def.unit),
      unit: def.unit,
      target: targetFor(def, ESTATE_IDS.length),
      delta: round1(agg.trend[agg.trend.length - 1] - agg.trend[0]),
      band: scored ? bandFor(metricScore(def, ESTATE_IDS)) : 'context',
      isScored: scored,
      direction: def.direction,
      targetFormatted: formatValue(targetFor(def, ESTATE_IDS.length), def.unit),
      ...Object.fromEntries(agg.trend.map((v, i) => [`q${i + 1}`, v])),
    }
  }),
)

const bars = DOMAINS.flatMap((d) =>
  TEAMS.map((t) => {
    const score = scopeDomainScore(d, [t.id])
    return { domainId: d.id, team: t.name, lab: labById(t.labId)?.name ?? '', ...labFields(t.labId), score, band: bandFor(score) }
  }),
)

const capabilities = (domainById('maturity')?.metrics ?? []).filter((m) => m.unit === 'level')
const maturity = TEAMS.flatMap((t) =>
  capabilities.map((def) => ({
    team: t.name,
    lab: labById(t.labId)?.name ?? '',
    ...labFields(t.labId),
    capability: def.label,
    level: round1(TEAM_METRICS[t.id][def.id].value),
  })),
)

// Quarter-on-quarter movement per core domain, for the estate and each lab.
const movement = scopes.flatMap(({ scope, labId, teamIds }) =>
  CORE_DOMAINS.map((d) => {
    const q = domainTrend(d, teamIds)
    const from = q[4]
    const to = q[5]
    const delta = to - from
    return {
      domainId: d.id,
      domain: d.name,
      ...groupFields(d),
      scope,
      ...labFields(labId),
      from,
      to,
      delta,
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    }
  }),
)

// Every team's composite and its rank among all teams (1 = best) at each quarter.
// Ties share nothing: the higher composite ranks first, then the team name.
const rank = QUARTER_LABELS.flatMap((quarterLabel, i) =>
  TEAMS.map((t) => ({ team: t.name, lab: labById(t.labId)?.name ?? '', labId: t.labId, composite: teamCompositeAt(t.id, QUARTER_LABELS.length - 1 - i) }))
    .sort((a, b) => b.composite - a.composite || a.team.localeCompare(b.team))
    .map((r, j) => ({ team: r.team, lab: r.lab, ...labFields(r.labId), quarter: i + 1, quarterLabel, composite: r.composite, rank: j + 1 })),
)

// The composite six quarters ago, each core domain's contribution to the change
// (its score change divided by the core domain count), and the composite now.
const round2 = (n: number) => Math.round(n * 100) / 100
/** Short step names for the waterfall's x axis. */
const WATERFALL_SHORT: Record<string, string> = {
  stability: 'Stability',
  incidents: 'Incidents',
  problems: 'Problems',
  change: 'Change',
  maturity: 'Maturity',
  risk: 'Risk',
  security: 'Security',
  resilience: 'Resilience',
  governance: 'Governance',
  architecture: 'Arch.',
  estate: 'Estate',
  delivery: 'Delivery',
  people: 'People',
}
const waterfall = scopes.flatMap(({ scope, labId, teamIds }) => {
  const trends = CORE_DOMAINS.map((d) => ({ d, q: domainTrend(d, teamIds) }))
  const start = trends.reduce((a, { q }) => a + q[0], 0) / CORE_DOMAINS.length
  let running = start
  const steps = trends.map(({ d, q }, i) => {
    const value = (q[5] - q[0]) / CORE_DOMAINS.length
    running += value
    return { scope, ...labFields(labId), step: i + 1, label: d.name, short: WATERFALL_SHORT[d.id] ?? d.name, ...groupFields(d), kind: 'delta', value: round2(value), running: round2(running), quarters: QUARTER_LABELS.length }
  })
  return [
    { scope, ...labFields(labId), step: 0, label: 'Six quarters ago', short: 'Six quarters ago', kind: 'start', value: round2(start), running: round2(start), quarters: QUARTER_LABELS.length },
    ...steps,
    { scope, ...labFields(labId), step: steps.length + 1, label: 'Now', short: 'Now', kind: 'end', value: round2(running), running: round2(running), quarters: QUARTER_LABELS.length },
  ]
})

// Each lab's score for each core domain at every quarter, banded on the latest.
const grid = LABS.flatMap((l) => {
  const teamIds = teamsInLab(l.id).map((t) => t.id)
  return CORE_DOMAINS.flatMap((d) => {
    const q = domainTrend(d, teamIds)
    return q.map((score, i) => ({ lab: l.name, ...labFields(l.id), domainId: d.id, domain: d.name, ...groupFields(d), quarter: i + 1, score, band: bandFor(q[5]) }))
  })
})

// One row per lab, as the Labs page lab cards show it (labScore, teamsByBand),
// with the lab composite at each quarter, oldest first.
const labcards = LABS.map((l) => {
  const teamIds = teamsInLab(l.id).map((t) => t.id)
  const composite = mean(teamIds.map((id) => teamScore(id)))
  const inBand = (band: string) => teamIds.filter((id) => bandFor(teamScore(id)) === band).length
  return {
    labId: l.id,
    lab: l.name,
    ...labFields(l.id),
    lead: l.lead,
    composite,
    band: bandFor(composite),
    healthyTeams: inBand('healthy'),
    watchTeams: inBand('watch'),
    actTeams: inBand('act'),
    ...Object.fromEntries(
      QUARTER_LABELS.map((_, i) => [`q${i + 1}`, mean(teamIds.map((id) => teamCompositeAt(id, QUARTER_LABELS.length - 1 - i)))]),
    ),
  }
})

// Mirrors REFRESHED_ISO in src/components/Page.tsx, which cannot be imported
// here without React.
const REFRESHED_ISO = '2026-09-28'
const DAY_MS = 86_400_000
const actions = ACTIONS.map((a) => {
  const team = TEAMS.find((t) => t.id === a.teamId)
  return {
    actionId: a.id,
    domain: domainById(a.domainId)?.name ?? '',
    team: team?.name ?? '',
    lab: team ? (labById(team.labId)?.name ?? '') : '',
    ...labFields(team?.labId),
    description: a.text,
    due: a.due,
    severity: a.severity,
    daysFromRefresh: Math.round((Date.parse(a.due) - Date.parse(REFRESHED_ISO)) / DAY_MS),
  }
})

// Metrics per domain and ingestion mode, with the least ready source among them.
// Mirrors MODE_LABEL in src/pages/SourcesPage.tsx.
const MODE_LABEL: Record<SourceMode, string> = {
  sql: 'SQL direct query',
  semantic: 'Semantic model',
  spreadsheet: 'Spreadsheet',
  csv: 'CSV drop',
  api: 'API',
}
const READINESS_ORDER: Readiness[] = ['live', 'partial', 'aspirational']
const readiness = DOMAINS.flatMap((d) =>
  (Object.keys(MODE_LABEL) as SourceMode[]).flatMap((mode) => {
    const metrics = ALL_METRICS.filter((m) => d.metrics.includes(m) && m.source.mode === mode)
    if (!metrics.length) return []
    const count = (r: Readiness) => metrics.filter((m) => m.source.readiness === r).length
    return [
      {
        domainId: d.id,
        domain: d.name,
        ...groupFields(d),
        mode,
        modeLabel: MODE_LABEL[mode],
        count: metrics.length,
        worstReadiness: READINESS_ORDER.filter((r) => count(r) > 0).at(-1),
        live: count('live'),
        partial: count('partial'),
        aspirational: count('aspirational'),
      },
    ]
  }),
)

// Page headers and domain read-outs at estate scope over six quarters. The
// pages compose these inline, so the rules are reproduced here from
// OverviewPage, LabsPage, ActionsPage, MovementPage, DomainPage and SourcesPage.
const ESTATE_NAME = 'the estate'
const POINTS = QUARTER_LABELS.length
const SOON_ISO = new Date(Date.parse(REFRESHED_ISO) + 30 * DAY_MS).toISOString().slice(0, 10)
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')
/** DomainPage's mean, which does not round. */
const rawMean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const severityRank = (s: string) => (s === 'act' ? 0 : 1)

function overviewHeadline() {
  const domainScores = CORE_DOMAINS.map((d) => ({ name: d.name, score: scopeDomainScore(d, ESTATE_IDS) }))
  const healthy = domainScores.filter((d) => bandFor(d.score) === 'healthy').length
  const worst = domainScores.reduce((w, d) => (d.score < w.score ? d : w))
  const teamsAct = ESTATE.filter((tm) => bandFor(teamScore(tm.id)) === 'act').length
  const teamsLine =
    teamsAct === 0
      ? `No team needs action; ${worst.name} is the weakest domain.`
      : `${teamsAct} team${teamsAct === 1 ? ' needs' : 's need'} action, led by ${worst.name}.`
  return `${healthy} of ${CORE_DOMAINS.length} domains healthy across ${ESTATE_NAME}. ${teamsLine}`
}

function labsHeadline() {
  const labs = LABS.flatMap((l) => {
    const teams = ESTATE.filter((tm) => tm.labId === l.id)
    if (!teams.length) return []
    const scores = teams.map((tm) => teamScore(tm.id))
    return [{ name: l.name, teams: teams.length, score: mean(scores), act: scores.filter((s) => bandFor(s) === 'act').length }]
  })
  if (!labs.length) return 'No teams in scope.'
  if (labs.length === 1) return `${labs[0].name} scores ${labs[0].score}; ${labs[0].act} of ${labs[0].teams} teams sit in the Act band.`
  const best = labs.reduce((b, l) => (l.score > b.score ? l : b))
  const mostAct = labs.reduce((m, l) => (l.act > m.act ? l : m))
  return mostAct.act
    ? `${best.name} is the healthiest lab; ${mostAct.name} carries the most Act ratings.`
    : `${best.name} is the healthiest lab; no lab has a team in the Act band.`
}

function actionsHeadline() {
  const inScope = ACTIONS.filter((a) => ESTATE_IDS.includes(a.teamId))
  const pastDue = inScope.filter((a) => a.due < REFRESHED_ISO).length
  const dueSoon = inScope.filter((a) => a.due >= REFRESHED_ISO && a.due <= SOON_ISO).length
  return `${inScope.length} open action${inScope.length === 1 ? '' : 's'} across ${ESTATE_NAME}; ${pastDue} past due, ${dueSoon} due within 30 days.`
}

function movementHeadline() {
  const back = POINTS - 1
  const then = mean(ESTATE_IDS.map((id) => teamCompositeAt(id, back)))
  const now = mean(ESTATE_IDS.map((id) => teamCompositeAt(id, 0)))
  const moves = CORE_DOMAINS.map((d) => ({
    name: d.name,
    delta: scopeDomainScore(d, ESTATE_IDS) - scopeDomainScore(d, ESTATE_IDS, back),
  }))
  const most = moves.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a))
  const least = moves.reduce((a, b) => (Math.abs(b.delta) < Math.abs(a.delta) ? b : a))
  return `The composite moved ${signed(now - then)} to ${now} over the last ${POINTS} quarters; ${most.name} ${most.delta < 0 ? 'worsened' : most.delta > 0 ? 'improved' : 'moved'} most (${signed(most.delta)}), ${least.name} moved least.`
}

function sourcesHeadline() {
  const count = (r: Readiness) => ALL_METRICS.filter((m) => m.source.readiness === r).length
  return `${count('live')} of ${ALL_METRICS.length} metrics are live today; ${count('partial')} are partial and ${count('aspirational')} are aspirational. Plan for all of them.`
}

/** DomainPage's headline and three read-outs for the estate. */
function domainNarrative(domain: Domain) {
  const teamIds = ESTATE_IDS
  const rows = domain.metrics.filter(isScored).map((m) => ({
    metric: m,
    agg: aggregateMetrics(teamIds, m),
    target: targetFor(m, teamIds.length),
    score: Math.round(rawMean(teamIds.map((id) => scoreMetric(m, TEAM_METRICS[id][m.id].value)))),
  }))
  type Row = (typeof rows)[number]
  const worst = rows.length ? rows.reduce((w, r) => (r.score < w.score ? r : w)) : undefined
  const best = rows.length ? rows.reduce((b, r) => (r.score > b.score ? r : b)) : undefined
  const gap = (r?: Row) => (!r ? 0 : r.metric.direction === 'lower' ? r.agg.value - r.target : r.target - r.agg.value)
  const worstGap = gap(worst)
  const bestGap = gap(best)
  const fv = (v: number, r: Row) => formatValue(v, r.metric.unit)
  const score = scopeDomainScore(domain, teamIds)
  const lead = `${domain.name} scores ${score}, ${BAND_LABEL[bandFor(score)].toLowerCase()}.`
  const bestWording = !best
    ? ''
    : bestGap < 0
      ? `${best.metric.label} is ahead of target`
      : bestGap === 0
        ? `${best.metric.label} is on target`
        : `${best.metric.label} is closest to target at ${fv(best.agg.value, best)} against ${fv(best.target, best)}`
  const tail = best === worst ? '' : `; ${bestWording}`
  const headline =
    !worst || !best
      ? `No measure in ${domain.name} is scored yet.`
      : worst.score === 100
        ? `${lead} Every metric is on or ahead of target.`
        : worstGap > 0
          ? `${lead} ${worst.metric.label} is furthest from target at ${fv(worst.agg.value, worst)} against ${fv(worst.target, worst)}${tail}.`
          : `${lead} ${worst.metric.label} is inside target in total, but not for every team${tail}.`

  const readOut1 = !worst
    ? 'No measure in this domain is scored yet.'
    : worstGap > 0
      ? `${worst.metric.label} is ${fv(Math.round(worstGap * 10) / 10, worst)} off target across ${ESTATE_NAME}.`
      : worst.score < 100
        ? `${worst.metric.label} is inside target across ${ESTATE_NAME} in total, but not for every team.`
        : `Every scored measure is at or inside target across ${ESTATE_NAME}.`
  let readOut2: string
  if (!worst || !ESTATE[0]) {
    readOut2 = `There are no team figures to compare for ${ESTATE_NAME}.`
  } else if (worst.metric.aggregate === 'sum') {
    const shares = ESTATE.map((tm) => ({ name: tm.name, v: TEAM_METRICS[tm.id][worst.metric.id].value })).sort((a, b) => b.v - a.v)
    const total = shares.reduce((a, b) => a + b.v, 0)
    const top2 = shares.slice(0, 2)
    const pct = total > 0 ? Math.round((top2.reduce((a, b) => a + b.v, 0) / total) * 100) : 0
    readOut2 = `${top2.map((s) => s.name).join(' and ')} carry ${pct} per cent of ${worst.metric.label.toLowerCase()} across ${ESTATE_NAME}.`
  } else {
    const values = ESTATE.map((tm) => TEAM_METRICS[tm.id][worst.metric.id].value)
    readOut2 = `${worst.metric.label} ranges from ${fv(Math.min(...values), worst)} to ${fv(Math.max(...values), worst)} across teams in ${ESTATE_NAME}.`
  }
  const q = domainTrend(domain, teamIds)
  const trendDiff = q[q.length - 1] - q[0]
  const readOut3 =
    trendDiff > 2
      ? `Trend is improving, up ${trendDiff} points over the last ${POINTS} quarters.`
      : trendDiff < -2
        ? `Trend is declining, down ${Math.abs(trendDiff)} points over the last ${POINTS} quarters.`
        : `Trend is broadly flat over the last ${POINTS} quarters.`
  return { headline, readOuts: [readOut1, readOut2, readOut3] }
}

function peopleStructureHeadline() {
  const k = THIN_SKILLS.length
  return `${PEOPLE.length} people across four labs, ${contractorPct(PEOPLE)}% contractors; ${k} critical skill${k === 1 ? '' : 's'} rest${k === 1 ? 's' : ''} on one or two people.`
}

/** "{Report} · {Page}", the kicker form the layout supplies; the given kicker for a page in no report. */
function pageKicker(pageId: string, fallback: string): string {
  const report = REPORTS.find((r) => r.pages.some((pg) => pg.id === pageId))
  const page = report?.pages.find((pg) => pg.id === pageId)
  return report && page ? `${report.name} · ${page.label}` : fallback
}
const pageHeader = (pageId: string, kicker: string, title: string, headline: string, domain?: Domain) => ({
  pageId,
  kicker: pageKicker(pageId, kicker),
  title,
  headline,
  ...(domain ? groupFields(domain) : {}),
})
const pagetext = [
  pageHeader('overview', 'overview', 'Where the platform stands today', overviewHeadline()),
  pageHeader('labs', 'labs and teams', 'How each lab and team is holding up', labsHeadline()),
  pageHeader('actions', 'actions', 'What needs doing', actionsHeadline()),
  pageHeader('movement', 'movement', 'What moved and why', movementHeadline()),
  ...DOMAINS.map((d) => pageHeader(d.id, `${groupById(d.group).name} · ${d.name}`, d.name, domainNarrative(d).headline, d)),
  pageHeader('people-structure', 'delivery and people', 'Who we have and what they can do', peopleStructureHeadline()),
  pageHeader('lineage', 'data and sources', 'Where every number comes from', sourcesHeadline()),
]

const readouts = DOMAINS.map((d) => {
  const [readOut1, readOut2, readOut3] = domainNarrative(d).readOuts
  return { domainId: d.id, readOut1, readOut2, readOut3 }
})

// The lab legend: the four labs in order, for the chip key at the top right of the header.
const lablegend = LABS.map((l, i) => ({ labId: l.id, lab: l.name, ...labFields(l.id), sortOrder: i + 1 }))

// Open actions by severity then due date, as the Overview and Actions pages list them.
// The Actions page summary strip: counts by status and due-date bucket from the refresh date.
const actionssummary = [
  {
    open: actions.length,
    due30: actions.filter((a) => a.daysFromRefresh >= 0 && a.daysFromRefresh <= 30).length,
    pastDue: actions.filter((a) => a.daysFromRefresh < 0).length,
    act: actions.filter((a) => a.severity === 'act').length,
    thisWeek: actions.filter((a) => a.daysFromRefresh >= 0 && a.daysFromRefresh <= 7).length,
    next30: actions.filter((a) => a.daysFromRefresh > 7 && a.daysFromRefresh <= 30).length,
    later: actions.filter((a) => a.daysFromRefresh > 30).length,
  },
]

// bar-list rows for the Actions page (unitLabel "actions"): open actions by domain, most first,
// with the domain in the team field and its group in the lab field, as the layout binds them.
const actionBars = DOMAINS.map((d) => ({
  domainId: 'actions',
  team: d.name,
  lab: groupById(d.group).name,
  ...labFields(),
  score: ACTIONS.filter((a) => a.domainId === d.id).length,
  band: '',
}))
  .filter((r) => r.score > 0)
  .sort((a, b) => b.score - a.score)

// The Overview key is constant; one row so Deneb has something to render.
const overviewkey = [{ quarters: QUARTER_LABELS.length }]

const actionslist = [...actions].sort(
  (a, b) => severityRank(a.severity) - severityRank(b.severity) || a.due.localeCompare(b.due),
)

// The Labs page team table: every team, weakest composite first, one row per core domain.
const teammatrix = TEAMS.map((t) => ({ t, composite: teamScore(t.id) }))
  .sort((a, b) => a.composite - b.composite)
  .flatMap(({ t, composite }) =>
    CORE_DOMAINS.map((d, i) => {
      const score = teamScore(t.id, d.id)
      return {
        team: t.name,
        lab: labById(t.labId)?.name ?? '',
        ...labFields(t.labId),
        composite,
        compositeBand: bandFor(composite),
        domainId: d.id,
        domain: d.name,
        ...groupFields(d),
        domainOrder: i + 1,
        score,
        band: bandFor(score),
      }
    }),
  )

// The Movement page team table over the six-quarter window, biggest fall first.
const movementteams = ESTATE.map((t) => {
  const from = teamCompositeAt(t.id, POINTS - 1)
  const to = teamCompositeAt(t.id, 0)
  const delta = to - from
  const bandFrom = BAND_LABEL[bandFor(from)]
  const bandTo = BAND_LABEL[bandFor(to)]
  return {
    team: t.name,
    lab: labById(t.labId)?.name ?? '',
    ...labFields(t.labId),
    from,
    to,
    delta,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    bandFrom,
    bandTo,
    bandText: bandFrom === bandTo ? `${bandTo}, held` : `${bandFrom} → ${bandTo}`,
    ...Object.fromEntries(QUARTER_LABELS.map((_, i) => [`q${i + 1}`, teamCompositeAt(t.id, POINTS - 1 - i)])),
  }
}).sort((a, b) => a.delta - b.delta)

// A domain page's Sources card: one row per system and mode, in first-seen
// order, carrying the readiness of the last metric with that pair, as the
// Map in DomainPage keeps it.
const sourcesstrip = DOMAINS.flatMap((d) =>
  [...new Map(d.metrics.map((m) => [`${m.source.system}:${m.source.mode}`, m.source])).values()].map((s, i) => ({
    domainId: d.id,
    sourceOrder: i + 1,
    system: s.system,
    mode: s.mode,
    modeLabel: MODE_LABEL[s.mode],
    readiness: s.readiness,
  })),
)

// The Sources page lineage: every metric with its source, in domain then metric order.
const lineage = DOMAINS.flatMap((d, di) =>
  d.metrics.map((m, mi) => ({
    domainId: d.id,
    domain: d.name,
    ...groupFields(d),
    domainOrder: di + 1,
    metricId: m.id,
    metricOrder: mi + 1,
    metric: m.label,
    system: m.source.system,
    mode: m.source.mode,
    modeLabel: MODE_LABEL[m.source.mode],
    refresh: m.source.refresh,
    owner: m.source.owner,
    readiness: m.source.readiness,
  })),
)

// The page footer: "Platform Health · report · page" on the left and, on the
// right, the source systems behind the page's metrics (the page's domain, or
// every core domain), most recently refreshed first, five then "+N more", as
// [Page Footer Left] and [Page Sources Refreshed] give them. Refresh times come
// from model/csv/SourceRefresh.csv, so run export-model.ts first.
const sourceRefresh = new Map(
  readFileSync(SOURCE_REFRESH_CSV, 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .filter((l) => l.length)
    .map((l): [string, { short: string; at: string }] => {
      const [system, short, at] = l.split(',')
      return [system, { short, at }]
    }),
)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function refreshedWording(at: string): string {
  const days = Math.round((Date.parse(REFRESHED_ISO) - Date.parse(at.slice(0, 10))) / DAY_MS)
  const time = at.slice(11, 16)
  if (days === 0) return `today ${time}`
  if (days === 1) return `yesterday ${time}`
  return `${Number(at.slice(8, 10))} ${MONTHS[Number(at.slice(5, 7)) - 1]}`
}
function sourcesRefreshed(domains: Domain[]): string {
  const systems = [...new Set(domains.flatMap((d) => d.metrics.map((m) => m.source.system)))].map((system) => {
    const row = sourceRefresh.get(system)
    if (!row) throw new Error(`SourceRefresh.csv has no row for ${system}`)
    return { system, ...row }
  })
  systems.sort((a, b) => b.at.localeCompare(a.at) || a.system.localeCompare(b.system))
  const shown = systems.slice(0, 5).map((s) => `${s.short} ${refreshedWording(s.at)}`)
  const more = systems.length > 5 ? ` · +${systems.length - 5} more` : ''
  return `Sources: ${shown.join(' · ')}${more}`
}
const pagefooter = REPORTS.flatMap((r) =>
  r.pages.map((pg) => {
    const d = DOMAINS.find((x) => x.id === (pg.id === 'people-structure' ? 'people' : pg.id))
    return { pageId: pg.id, left: `Platform Health · ${r.name} · ${pg.label}`, sources: sourcesRefreshed(d ? [d] : CORE_DOMAINS) }
  }),
)

// A domain page's metric heat: every team, worst domain score first, by the
// domain's scored metrics in domain order, each cell the team's value tinted by
// its metric band.
const metricheat = DOMAINS.flatMap((d) =>
  TEAMS.map((t) => ({ t, teamScore: teamScore(t.id, d.id) }))
    .sort((a, b) => a.teamScore - b.teamScore || a.t.name.localeCompare(b.t.name))
    .flatMap(({ t, teamScore: score }) =>
      d.metrics
        .map((def, i) => ({ def, metricOrder: i + 1 }))
        .filter(({ def }) => isScored(def))
        .map(({ def, metricOrder }) => {
          const value = TEAM_METRICS[t.id][def.id].value
          return {
            domainId: d.id,
            team: t.name,
            ...labFields(t.labId),
            metricId: def.id,
            metricOrder,
            short: def.short,
            value,
            formatted: formatValue(value, def.unit),
            band: bandFor(scoreMetric(def, value)),
            teamScore: score,
          }
        }),
    ),
)

// People structure: the seventeen leaders as nodes (label is the role, sublabel the unit they lead),
// each lab's headcount by role group with its contractors, and each critical skill's holders by lab.
const TEAM_NAME = new Map(TEAMS.map((t) => [t.id, t.name]))
const leadership = LEADERS.map((p) => {
  const span = spanOf(p)
  return {
    level: p.leadLevel,
    id: p.id,
    parentId: p.parentId ?? '',
    label: p.role,
    sublabel: p.teamId ? (TEAM_NAME.get(p.teamId) ?? '') : p.labId ? (labById(p.labId)?.name ?? '') : 'Platform',
    ...labFields(p.labId ?? undefined),
    headcount: span.length,
    contractorPct: contractorPct(span),
  }
})
const rolecomposition = LABS.flatMap((l) =>
  roleComposition(l.id).map((sl) => ({ lab: l.name, ...labFields(l.id), roleGroup: sl.group, count: sl.count, contractors: sl.contractors })),
)
const skillsheat = SKILL_COVERAGE.flatMap((c) =>
  LABS.map((l) => ({ skill: c.skill.name, lab: l.name, ...labFields(l.id), count: c.byLab[l.id], estateCount: c.estate, flag: SKILL_FLAG_LABEL[c.flag] })),
)

/** One row per line, so a file stays readable and pastes cleanly. */
const toJson = (rows: object[]) => `[\n${rows.map((r) => `  ${JSON.stringify(r)}`).join(',\n')}\n]\n`

const files: Record<string, object[]> = {
  'trend.json': trend,
  'domain-cards.json': domainCards,
  'hero.json': hero,
  'heat.json': heat,
  'kpi.json': kpi,
  'bars.json': [...bars, ...actionBars],
  'maturity.json': maturity,
  'movement.json': movement,
  'rank.json': rank,
  'waterfall.json': waterfall,
  'grid.json': grid,
  'labcards.json': labcards,
  'actions.json': actions,
  'readiness.json': readiness,
  'pagetext.json': pagetext,
  'readouts.json': readouts,
  'actionslist.json': actionslist,
  'actionssummary.json': actionssummary,
  'overviewkey.json': overviewkey,
  'teammatrix.json': teammatrix,
  'movementteams.json': movementteams,
  'sourcesstrip.json': sourcesstrip,
  'lineage.json': lineage,
  'lablegend.json': lablegend,
  'pagefooter.json': pagefooter,
  'metricheat.json': metricheat,
  'leadership.json': leadership,
  'rolecomposition.json': rolecomposition,
  'skillsheat.json': skillsheat,
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [name, rows] of Object.entries(files)) {
  writeFileSync(`${OUT_DIR}${name}`, toJson(rows))
  console.log(`${name}: ${rows.length} rows`)
}
