// Writes the Platform Health star schema as CSVs from the app's fixtures, then
// reads them back and checks every join and every score against the app's own
// health functions, so the model a Power BI author loads matches the mock.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ACTIONS } from '../../src/data/actions'
import { ALL_METRICS, DOMAINS, groupById, spanFor } from '../../src/data/domains'
import { bandFor, isScored, scopeDomainScore, scoreMetric, targetFor, teamScore } from '../../src/data/health'
import { LABS, TEAMS, teamsInLab } from '../../src/data/labs'
import { TEAM_METRICS } from '../../src/data/metrics'
import { PEOPLE, SKILLS, SKILL_COVERAGE, roleGroupOf } from '../../src/data/people'
import { SOURCE_REFRESH } from '../../src/data/sourceRefresh'
import type { TeamId } from '../../src/data/types'

const MODEL_DIR = fileURLToPath(new URL('../model/', import.meta.url))
const CSV_DIR = `${MODEL_DIR}csv/`
const THEME_FILE = fileURLToPath(new URL('../theme/platform-health.theme.json', import.meta.url))
/** Lab colours sit at dataColors 9 to 12 of the Power BI theme, in LABS order. */
const LAB_COLOUR_INDEX = 9
const THEME_COLOURS = (JSON.parse(readFileSync(THEME_FILE, 'utf8')) as { dataColors: string[] }).dataColors

/** Six quarters ending Q3 2026, oldest first. Matches export-samples.ts. */
const QUARTER_LABELS = ['Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026']
const QUARTER_STARTS = ['2025-04-01', '2025-07-01', '2025-10-01', '2026-01-01', '2026-04-01', '2026-07-01']
/** Mirrors REFRESHED_ISO in src/components/Page.tsx, which imports React. */
const REFRESH_DATE = '2026-09-28'
const HEALTHY_THRESHOLD = 80
const WATCH_THRESHOLD = 60

type Cell = string | number | boolean
type Row = Record<string, Cell>

const quote = (v: Cell) => {
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(columns: string[], rows: Row[]): string {
  const lines = [columns.join(','), ...rows.map((r) => columns.map((c) => quote(r[c] ?? '')).join(','))]
  return `${lines.join('\r\n')}\r\n`
}

const tables: { name: string; columns: string[]; rows: Row[] }[] = [
  {
    name: 'Lab',
    columns: ['LabKey', 'LabName', 'LabCode', 'LabColour', 'Lead', 'SortOrder'],
    rows: LABS.map((l, i) => ({
      LabKey: l.id,
      LabName: l.name,
      LabCode: l.code,
      LabColour: THEME_COLOURS[LAB_COLOUR_INDEX + i] ?? '',
      Lead: l.lead,
      SortOrder: i + 1,
    })),
  },
  {
    name: 'Team',
    columns: ['TeamKey', 'TeamName', 'LabKey', 'Lead', 'SortOrder'],
    rows: TEAMS.map((t, i) => ({ TeamKey: t.id, TeamName: t.name, LabKey: t.labId, Lead: t.lead, SortOrder: i + 1 })),
  },
  {
    name: 'Domain',
    columns: ['DomainKey', 'DomainName', 'DomainGroup', 'DomainGroupName', 'SortOrder', 'IsCore', 'Question'],
    rows: DOMAINS.map((d, i) => ({
      DomainKey: d.id,
      DomainName: d.name,
      DomainGroup: d.group,
      DomainGroupName: groupById(d.group).name,
      SortOrder: i + 1,
      IsCore: !d.proposed,
      Question: d.question,
    })),
  },
  {
    name: 'Metric',
    columns: [
      'MetricKey',
      'DomainKey',
      'MetricName',
      'ShortName',
      'Unit',
      'Direction',
      'Target',
      'Aggregate',
      'IsScored',
      'SourceSystem',
      'IngestionMode',
      'Refresh',
      'Owner',
      'Readiness',
      'Note',
      'SortOrder',
    ],
    rows: DOMAINS.flatMap((d) => d.metrics.map((m) => ({ d, m }))).map(({ d, m }, i) => ({
      MetricKey: m.id,
      DomainKey: d.id,
      MetricName: m.label,
      ShortName: m.short,
      Unit: m.unit,
      Direction: m.direction,
      Target: m.target,
      Aggregate: m.aggregate,
      IsScored: isScored(m),
      SourceSystem: m.source.system,
      IngestionMode: m.source.mode,
      Refresh: m.source.refresh,
      Owner: m.source.owner,
      Readiness: m.source.readiness,
      Note: m.note ?? '',
      SortOrder: i + 1,
    })),
  },
  {
    name: 'Quarter',
    columns: ['QuarterKey', 'QuarterLabel', 'QuarterStart', 'IsCurrent'],
    rows: QUARTER_LABELS.map((label, i) => ({
      QuarterKey: i + 1,
      QuarterLabel: label,
      QuarterStart: QUARTER_STARTS[i],
      IsCurrent: i === QUARTER_LABELS.length - 1,
    })),
  },
  {
    name: 'MetricValue',
    columns: ['TeamKey', 'MetricKey', 'QuarterKey', 'Value'],
    rows: TEAMS.flatMap((t) =>
      ALL_METRICS.flatMap((m) =>
        TEAM_METRICS[t.id][m.id].trend.map((value, i) => ({
          TeamKey: t.id,
          MetricKey: m.id,
          QuarterKey: i + 1,
          Value: value,
        })),
      ),
    ),
  },
  {
    // Fact, precomputed at refresh: one row per MetricValue row with the team-grain score (scoreMetric with
    // teamCount 1), so the measures average a column instead of scoring each team inside nested iterators.
    name: 'ScoreFact',
    columns: ['TeamKey', 'MetricKey', 'QuarterKey', 'Value', 'Target', 'Span', 'Score', 'Band', 'IsScored'],
    rows: TEAMS.flatMap((t) =>
      ALL_METRICS.flatMap((m) =>
        TEAM_METRICS[t.id][m.id].trend.map((value, i) => {
          const score = scoreMetric(m, value, 1)
          return {
            TeamKey: t.id,
            MetricKey: m.id,
            QuarterKey: i + 1,
            Value: value,
            Target: targetFor(m, 1),
            Span: spanFor(m),
            Score: score,
            Band: bandFor(score),
            IsScored: isScored(m),
          }
        }),
      ),
    ),
  },
  {
    name: 'Action',
    columns: ['ActionKey', 'DomainKey', 'TeamKey', 'Description', 'DueDate', 'Severity'],
    rows: ACTIONS.map((a) => ({
      ActionKey: a.id,
      DomainKey: a.domainId,
      TeamKey: a.teamId,
      Description: a.text,
      DueDate: a.due,
      Severity: a.severity,
    })),
  },
  {
    // One row per synthetic person (src/data/people.ts). LabName, LabCode, LabColour and UnitName are carried on
    // the row so people visuals group by lab without leaving Person: the platform and lab leads have no TeamKey.
    name: 'Person',
    columns: ['PersonKey', 'Role', 'RoleGroup', 'Grade', 'LabKey', 'TeamKey', 'Employment', 'IsLead', 'LeadLevel', 'ParentKey', 'LabName', 'LabCode', 'LabColour', 'UnitName'],
    rows: PEOPLE.map((p) => {
      const li = LABS.findIndex((l) => l.id === p.labId)
      return {
        PersonKey: p.id,
        Role: p.role,
        RoleGroup: roleGroupOf(p.role),
        Grade: p.grade,
        LabKey: p.labId ?? '',
        TeamKey: p.teamId ?? '',
        Employment: p.employment,
        IsLead: p.leadLevel > 0,
        LeadLevel: p.leadLevel,
        ParentKey: p.parentId ?? '',
        LabName: li < 0 ? '' : LABS[li].name,
        LabCode: li < 0 ? '' : LABS[li].code,
        LabColour: li < 0 ? '' : (THEME_COLOURS[LAB_COLOUR_INDEX + li] ?? ''),
        UnitName: p.teamId ? (TEAMS.find((t) => t.id === p.teamId)?.name ?? '') : li < 0 ? 'Platform' : LABS[li].name,
      }
    }),
  },
  {
    name: 'Skill',
    columns: ['SkillKey', 'SkillName', 'SortOrder'],
    rows: SKILLS.map((k, i) => ({ SkillKey: k.id, SkillName: k.name, SortOrder: i + 1 })),
  },
  {
    name: 'PersonSkill',
    columns: ['PersonKey', 'SkillKey'],
    rows: PEOPLE.flatMap((p) => p.skills.map((k) => ({ PersonKey: p.id, SkillKey: k }))),
  },
  {
    name: 'Config',
    columns: ['RefreshDate', 'HealthyThreshold', 'WatchThreshold'],
    rows: [{ RefreshDate: REFRESH_DATE, HealthyThreshold: HEALTHY_THRESHOLD, WatchThreshold: WATCH_THRESHOLD }],
  },
  {
    name: 'SourceRefresh',
    columns: ['System', 'Short', 'LastRefresh', 'Cadence'],
    rows: [...new Map(ALL_METRICS.map((m) => [m.source.system, m.source.refresh])).entries()].map(([system, cadence]) => {
      const s = SOURCE_REFRESH.find((x) => x.system === system)
      if (!s) throw new Error(`SourceRefresh: no refresh time for ${system} in src/data/sourceRefresh.ts`)
      return { System: system, Short: s.short ?? system, LastRefresh: s.at.slice(0, 19), Cadence: cadence }
    }),
  },
]

mkdirSync(CSV_DIR, { recursive: true })
for (const { name, columns, rows } of tables) {
  writeFileSync(`${CSV_DIR}${name}.csv`, toCsv(columns, rows), 'utf8')
}

// ---------------------------------------------------------------------------
// Validation: read the files back and work only from what was written.

function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      record.push(field)
      field = ''
    } else if (c === '\n') {
      record.push(field.replace(/\r$/, ''))
      records.push(record)
      record = []
      field = ''
    } else field += c
  }
  if (field || record.length) records.push([...record, field])
  const [header, ...body] = records
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])))
}

const read = (name: string) => parseCsv(readFileSync(`${CSV_DIR}${name}.csv`, 'utf8'))

const failures: string[] = []
const fail = (msg: string) => {
  if (failures.length < 20) console.error(`FAIL ${msg}`)
  failures.push(msg)
}

const csv = Object.fromEntries(tables.map((t) => [t.name, read(t.name)]))
for (const t of tables) {
  if (csv[t.name].length !== t.rows.length) fail(`${t.name}.csv has ${csv[t.name].length} rows, expected ${t.rows.length}`)
}

const keys = (name: string, col: string) => new Set(csv[name].map((r) => r[col]))
const teamKeys = keys('Team', 'TeamKey')
const metricKeys = keys('Metric', 'MetricKey')
const quarterKeys = keys('Quarter', 'QuarterKey')
const domainKeys = keys('Domain', 'DomainKey')
const labKeys = keys('Lab', 'LabKey')

for (const [name, col] of [
  ['Lab', 'LabKey'],
  ['Team', 'TeamKey'],
  ['Domain', 'DomainKey'],
  ['Metric', 'MetricKey'],
  ['Quarter', 'QuarterKey'],
  ['Action', 'ActionKey'],
  ['Person', 'PersonKey'],
  ['Skill', 'SkillKey'],
] as const) {
  if (keys(name, col).size !== csv[name].length) fail(`${name}.${col} is not unique`)
}

csv.Team.forEach((r) => labKeys.has(r.LabKey) || fail(`Team ${r.TeamKey} has unknown LabKey ${r.LabKey}`))
csv.Metric.forEach((r) => domainKeys.has(r.DomainKey) || fail(`Metric ${r.MetricKey} has unknown DomainKey ${r.DomainKey}`))
csv.Action.forEach((r) => {
  if (!teamKeys.has(r.TeamKey)) fail(`Action ${r.ActionKey} has unknown TeamKey ${r.TeamKey}`)
  if (!domainKeys.has(r.DomainKey)) fail(`Action ${r.ActionKey} has unknown DomainKey ${r.DomainKey}`)
})
// People: every person on a known team (or none, for the platform and lab leads), every parent a known
// person, every PersonSkill row joined at both ends, and each skill's estate count as the app has it.
const personKeys = keys('Person', 'PersonKey')
const skillKeys = keys('Skill', 'SkillKey')
csv.Person.forEach((r) => {
  if (r.TeamKey && !teamKeys.has(r.TeamKey)) fail(`Person ${r.PersonKey} has unknown TeamKey ${r.TeamKey}`)
  if (r.LabKey && !labKeys.has(r.LabKey)) fail(`Person ${r.PersonKey} has unknown LabKey ${r.LabKey}`)
  if (r.TeamKey && csv.Team.find((t) => t.TeamKey === r.TeamKey)?.LabKey !== r.LabKey) fail(`Person ${r.PersonKey}: LabKey ${r.LabKey} is not its team's lab`)
  if (r.ParentKey && !personKeys.has(r.ParentKey)) fail(`Person ${r.PersonKey} has unknown ParentKey ${r.ParentKey}`)
  if (!r.TeamKey && r.LeadLevel !== '1' && r.LeadLevel !== '2') fail(`Person ${r.PersonKey} has no TeamKey but is not a platform or lab lead`)
})
const personSkillKeys = new Set<string>()
csv.PersonSkill.forEach((r, i) => {
  if (!personKeys.has(r.PersonKey)) fail(`PersonSkill row ${i + 2} has unknown PersonKey ${r.PersonKey}`)
  if (!skillKeys.has(r.SkillKey)) fail(`PersonSkill row ${i + 2} has unknown SkillKey ${r.SkillKey}`)
  const k = `${r.PersonKey}|${r.SkillKey}`
  if (personSkillKeys.has(k)) fail(`PersonSkill has a duplicate row for ${k}`)
  personSkillKeys.add(k)
})
for (const c of SKILL_COVERAGE) {
  const n = csv.PersonSkill.filter((r) => r.SkillKey === c.skill.id).length
  if (n !== c.estate) fail(`Skill ${c.skill.name}: ${n} holders in PersonSkill.csv, ${c.estate} in the app`)
}

const factKeys = new Set<string>()
csv.MetricValue.forEach((r, i) => {
  if (!teamKeys.has(r.TeamKey)) fail(`MetricValue row ${i + 2} has unknown TeamKey ${r.TeamKey}`)
  if (!metricKeys.has(r.MetricKey)) fail(`MetricValue row ${i + 2} has unknown MetricKey ${r.MetricKey}`)
  if (!quarterKeys.has(r.QuarterKey)) fail(`MetricValue row ${i + 2} has unknown QuarterKey ${r.QuarterKey}`)
  if (!Number.isFinite(Number(r.Value)) || r.Value === '') fail(`MetricValue row ${i + 2} has a non-numeric Value`)
  const k = `${r.TeamKey}|${r.MetricKey}|${r.QuarterKey}`
  if (factKeys.has(k)) fail(`MetricValue has a duplicate row for ${k}`)
  factKeys.add(k)
})
if (factKeys.size !== teamKeys.size * metricKeys.size * quarterKeys.size) fail('MetricValue is not a complete team by metric by quarter grid')

// Recompute scores from the CSVs alone, the way measures.dax does.
const value = new Map(csv.MetricValue.map((r) => [`${r.TeamKey}|${r.MetricKey}|${r.QuarterKey}`, Number(r.Value)]))
const metricsOf = (domainKey: string) => csv.Metric.filter((m) => m.DomainKey === domainKey && m.IsScored === 'true')
const jsRound = (n: number) => Math.floor(n + 0.5)

function csvMetricScore(m: Record<string, string>, v: number): number {
  const target = Number(m.Target)
  const span =
    m.Unit === 'pct' ? (m.Direction === 'lower' ? 20 : 30) : m.Direction === 'higher' ? target : Math.max(target * 2, 5)
  const gap = m.Direction === 'lower' ? v - target : target - v
  return gap <= 0 ? 100 : Math.max(0, jsRound(100 - (100 * gap) / span))
}
// ScoreFact.csv, row by row: the same keys as MetricValue, the same value, and the target, span, score, band and
// IsScored health.ts gives for one team. The domain checks below then read scores from ScoreFact.csv, as the measures do.
let checks = 0
const scoreOf = new Map<string, number>()
csv.ScoreFact.forEach((r, i) => {
  const k = `${r.TeamKey}|${r.MetricKey}|${r.QuarterKey}`
  const def = ALL_METRICS.find((m) => m.id === r.MetricKey)
  const metricRow = csv.Metric.find((m) => m.MetricKey === r.MetricKey)
  checks++
  if (!factKeys.has(k)) return fail(`ScoreFact row ${i + 2} has no MetricValue row for ${k}`)
  if (scoreOf.has(k)) return fail(`ScoreFact has a duplicate row for ${k}`)
  if (!def || !metricRow) return fail(`ScoreFact row ${i + 2} has unknown MetricKey ${r.MetricKey}`)
  const v = Number(r.Value)
  const expected = scoreMetric(def, v, 1)
  if (v !== value.get(k)) fail(`ScoreFact ${k}: Value ${r.Value}, MetricValue ${value.get(k)}`)
  if (Number(r.Target) !== targetFor(def, 1)) fail(`ScoreFact ${k}: Target ${r.Target}, targetFor ${targetFor(def, 1)}`)
  if (Number(r.Span) !== spanFor(def)) fail(`ScoreFact ${k}: Span ${r.Span}, spanFor ${spanFor(def)}`)
  if (Number(r.Score) !== expected) fail(`ScoreFact ${k}: Score ${r.Score}, scoreMetric ${expected}`)
  if (Number(r.Score) !== csvMetricScore(metricRow, v)) fail(`ScoreFact ${k}: Score ${r.Score}, CSV rule ${csvMetricScore(metricRow, v)}`)
  if (r.Band !== bandFor(expected)) fail(`ScoreFact ${k}: Band ${r.Band}, bandFor ${bandFor(expected)}`)
  if (r.IsScored !== String(isScored(def))) fail(`ScoreFact ${k}: IsScored ${r.IsScored}, isScored ${isScored(def)}`)
  scoreOf.set(k, Number(r.Score))
})
if (scoreOf.size !== factKeys.size) fail(`ScoreFact has ${scoreOf.size} distinct rows, MetricValue ${factKeys.size}`)

function csvTeamDomainScore(team: string, domainKey: string, quarter: number): number {
  const scores = metricsOf(domainKey).map((m) => scoreOf.get(`${team}|${m.MetricKey}|${quarter}`) ?? NaN)
  return scores.length ? jsRound(scores.reduce((a, b) => a + b, 0) / scores.length) : 0
}
const csvMean = (xs: number[]) => (xs.length ? jsRound(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)
const csvDomainScore = (domainKey: string, teams: string[], quarter: number) =>
  csvMean(teams.map((t) => csvTeamDomainScore(t, domainKey, quarter)))
const coreDomains = csv.Domain.filter((d) => d.IsCore === 'true').map((d) => d.DomainKey)
const csvTeamComposite = (team: string, quarter: number) =>
  csvMean(coreDomains.map((d) => csvTeamDomainScore(team, d, quarter)))

// Every CSV-derived domain score must agree with scopeDomainScore, at every
// quarter, for the estate, every lab and every team.
const scopes: { name: string; teamIds: TeamId[] }[] = [
  { name: 'Estate', teamIds: TEAMS.map((t) => t.id) },
  ...LABS.map((l) => ({ name: l.name, teamIds: teamsInLab(l.id).map((t) => t.id) })),
  ...TEAMS.map((t) => ({ name: t.name, teamIds: [t.id] })),
]
for (const d of DOMAINS) {
  for (const s of scopes) {
    for (let q = 1; q <= QUARTER_LABELS.length; q++) {
      const expected = scopeDomainScore(d, s.teamIds, QUARTER_LABELS.length - q)
      const actual = csvDomainScore(d.id, s.teamIds, q)
      checks++
      if (expected !== actual) fail(`${d.name} for ${s.name} at ${QUARTER_LABELS[q - 1]}: CSV ${actual}, app ${expected}`)
    }
  }
}
for (const t of TEAMS) {
  checks++
  if (csvTeamComposite(t.id, QUARTER_LABELS.length) !== teamScore(t.id)) fail(`Composite for ${t.name} differs from teamScore`)
}

// spanFor is re-implemented in the CSV check and in DAX; confirm it agrees.
for (const m of ALL_METRICS) {
  const row = csv.Metric.find((r) => r.MetricKey === m.id)
  if (!row) continue
  const target = Number(row.Target)
  const span =
    row.Unit === 'pct' ? (row.Direction === 'lower' ? 20 : 30) : row.Direction === 'higher' ? target : Math.max(target * 2, 5)
  checks++
  if (span !== spanFor(m)) fail(`Span for ${m.id}: CSV rule ${span}, spanFor ${spanFor(m)}`)
}

const estateIds = TEAMS.map((t) => t.id)
const stability = DOMAINS.find((d) => d.id === 'stability')
const stabilityApp = stability ? scopeDomainScore(stability, estateIds) : NaN
const stabilityCsv = csvDomainScore('stability', estateIds, QUARTER_LABELS.length)
if (stabilityApp !== stabilityCsv) fail(`Estate Stability: CSV ${stabilityCsv}, app ${stabilityApp}`)

// Relationships the model expects, written beside the CSVs.
const relationships = `# Relationships

Create these in Model view. Every relationship is single direction, filtering from the one side to
the many side. Do not enable bidirectional filtering: the measures in measures.dax assume a Lab or
Team slicer never filters back up into Domain, Metric or Quarter.

| From (many side) | To (one side) | Cardinality | Cross-filter direction |
| --- | --- | --- | --- |
| Team[LabKey] | Lab[LabKey] | Many to one | Single (Lab filters Team) |
| MetricValue[TeamKey] | Team[TeamKey] | Many to one | Single (Team filters MetricValue) |
| MetricValue[MetricKey] | Metric[MetricKey] | Many to one | Single (Metric filters MetricValue) |
| MetricValue[QuarterKey] | Quarter[QuarterKey] | Many to one | Single (Quarter filters MetricValue) |
| ScoreFact[TeamKey] | Team[TeamKey] | Many to one | Single (Team filters ScoreFact) |
| ScoreFact[MetricKey] | Metric[MetricKey] | Many to one | Single (Metric filters ScoreFact) |
| ScoreFact[QuarterKey] | Quarter[QuarterKey] | Many to one | Single (Quarter filters ScoreFact) |
| Metric[DomainKey] | Domain[DomainKey] | Many to one | Single (Domain filters Metric) |
| Action[TeamKey] | Team[TeamKey] | Many to one | Single (Team filters Action) |
| Action[DomainKey] | Domain[DomainKey] | Many to one | Single (Domain filters Action) |
| Person[TeamKey] | Team[TeamKey] | Many to one | Single (Team filters Person) |
| PersonSkill[PersonKey] | Person[PersonKey] | Many to one | Single (Person filters PersonSkill) |
| PersonSkill[SkillKey] | Skill[SkillKey] | Many to one | Single (Skill filters PersonSkill) |

Config, Period and SourceRefresh are disconnected. They have no relationships; [Page Sources Refreshed] matches
SourceRefresh[System] to Metric[SourceSystem] with TREATAS.

ScoreFact is a second fact beside MetricValue, one row per MetricValue row, with the team-grain score computed
at refresh. It joins Team, Metric and Quarter exactly as MetricValue does; the two facts never filter each other.

## Date table setting

Do not mark any table as a date table. Quarter is a quarterly dimension keyed by QuarterKey, not a
daily calendar, and the measures move between quarters by key, not with time intelligence. Turn off
Auto date/time (File, Options and settings, Options, Current file, Data load) so Desktop does not
build hidden date tables for Quarter[QuarterStart], Action[DueDate] and Config[RefreshDate].

Set Quarter[QuarterLabel] to sort by Quarter[QuarterKey], Domain[DomainName] by Domain[SortOrder],
Lab[LabName] by Lab[SortOrder], Team[TeamName] by Team[SortOrder] and Metric[MetricName] by
Metric[SortOrder], so every visual reads in the app's order. Set Skill[SkillName] to sort by Skill[SortOrder].

Person[TeamKey] is blank for the platform lead and the four lab leads, so a Lab or Team slicer, which
reaches Person through Team, leaves them out; the people visuals group by Person[LabName] instead.
`
writeFileSync(`${MODEL_DIR}relationships.md`, relationships, 'utf8')

for (const t of tables) console.log(`${t.name}.csv: ${t.rows.length} rows`)
console.log(`Estate Stability: CSV ${stabilityCsv}, app ${stabilityApp}`)
console.log(`${checks} score checks against the app, ${csv.MetricValue.length} fact rows joined`)
if (failures.length) {
  console.error(`Validation failed: ${failures.length} problem${failures.length === 1 ? '' : 's'}`)
  process.exit(1)
}
console.log('Validation passed')
