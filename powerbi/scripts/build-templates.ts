// Writes one Deneb template per spec to deneb/templates/, with every dataset
// field the spec reads swapped for a placeholder so Deneb's import dialog can
// map it, plus an INDEX.md listing each template's fields.
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DENEB = fileURLToPath(new URL('../deneb/', import.meta.url))
const SPECS = `${DENEB}specs/`
const SAMPLES = `${DENEB}samples/`
const TEMPLATES = `${DENEB}templates/`
const README = fileURLToPath(new URL('../README.md', import.meta.url))
const SUFFIX = '.vl.json'

/** Deneb release whose template metadata (metaVersion 1) these follow. */
const DENEB_BUILD = '1.7.0.0'
const AUTHOR = 'Platform Health contributors'

const PACKAGE = fileURLToPath(new URL('../../package.json', import.meta.url))
const MEASURES_DAX = fileURLToPath(new URL('../model/measures.dax', import.meta.url))
const CSV = fileURLToPath(new URL('../model/csv/', import.meta.url))

/**
 * What feeds each template field, by spec then sample field, as in
 * layout/manifest.json and BUILD-GUIDE.md: "[Measure]" from measures.dax (the
 * build measure where the manifest says "via") or "Table[Column]". A measure
 * gives kind "measure", a column kind "column".
 */
const BINDINGS: Record<string, Record<string, string>> = {
  'actions-summary': {
    open: '[Open Actions]',
    due30: '[Actions Due 30 Days]',
    pastDue: '[Actions Past Due]',
    act: '[Actions Act]',
    thisWeek: '[Actions This Week]',
    next30: '[Actions Next 30 Days]',
    later: '[Actions Later]',
  },
  'actions-list': {
    actionId: 'Action[ActionKey]',
    domain: 'Action[DomainName]',
    team: 'Action[TeamName]',
    lab: 'Action[LabName]',
    labCode: 'Action[LabCode]',
    labColour: 'Action[LabColour]',
    description: 'Action[Description]',
    due: 'Action[DueDate]',
    severity: 'Action[Severity]',
    daysFromRefresh: '[Days From Refresh]',
  },
  'actions-table': {
    actionId: 'Action[ActionKey]',
    domain: 'Action[DomainName]',
    team: 'Action[TeamName]',
    lab: 'Action[LabName]',
    labCode: 'Action[LabCode]',
    labColour: 'Action[LabColour]',
    description: 'Action[Description]',
    due: 'Action[DueDate]',
    severity: 'Action[Severity]',
    daysFromRefresh: '[Days From Refresh]',
  },
  'actions-timeline': {
    actionId: 'Action[ActionKey]',
    domain: 'Action[DomainName]',
    team: 'Action[TeamName]',
    lab: 'Action[LabName]',
    labCode: 'Action[LabCode]',
    labColour: 'Action[LabColour]',
    description: 'Action[Description]',
    due: 'Action[DueDate]',
    severity: 'Action[Severity]',
    daysFromRefresh: '[Days From Refresh]',
  },
  'bar-list': {
    team: 'Team[TeamName]',
    lab: 'Team[LabName]',
    labCode: 'Team[LabCode]',
    labColour: 'Team[LabColour]',
    score: '[Score]',
    band: '[Band Key]',
  },
  'bump-rank': {
    team: 'Team[TeamName]',
    lab: 'Team[LabName]',
    labCode: 'Team[LabCode]',
    labColour: 'Team[LabColour]',
    quarter: 'Quarter[QuarterKey]',
    quarterLabel: 'Quarter[QuarterLabel]',
    composite: '[Composite]',
    rank: '[Team Rank]',
  },
  'composite-waterfall': {
    scope: '[Scope Name]',
    step: 'MovementStep[Step]',
    label: 'MovementStep[Label]',
    short: 'MovementStep[Short]',
    kind: 'MovementStep[Kind]',
    value: '[Step Value]',
    running: '[Step Running]',
    quarters: '[Selected Quarters]',
  },
  'domain-cards': {
    domainId: 'Domain[DomainKey]',
    domain: 'Domain[DomainName]',
    proposed: '[Is Proposed]',
    score: '[Score]',
    band: '[Band Key]',
    driverLabel: '[Driver Label]',
    driverValueFormatted: '[Driver Value Formatted]',
    driverTargetFormatted: '[Driver Target Formatted]',
    q1: '[Score Q1]',
    q2: '[Score Q2]',
    q3: '[Score Q3]',
    q4: '[Score Q4]',
    q5: '[Score Q5]',
    q6: '[Score]',
  },
  'dumbbell-movement': {
    domainId: 'Domain[DomainKey]',
    domain: 'Domain[DomainName]',
    scope: '[Scope Name]',
    from: '[Score Period Start]',
    to: '[Score]',
    delta: '[Score Delta over Period]',
  },
  'heat-matrix': {
    row: 'Lab[LabName]',
    labCode: 'Lab[LabCode]',
    labColour: 'Lab[LabColour]',
    domainId: 'Domain[DomainKey]',
    domain: 'Domain[DomainName]',
    score: '[Score]',
    band: '[Band Key]',
  },
  'kpi-tiles': {
    metricId: 'Metric[MetricKey]',
    label: 'Metric[MetricName]',
    value: '[Metric Value]',
    formatted: '[Metric Value Formatted]',
    unit: 'Metric[Unit]',
    target: '[Metric Target]',
    delta: '[Metric Delta over Period]',
    band: '[Metric Band Key]',
    direction: 'Metric[Direction]',
    targetFormatted: '[Metric Target Formatted]',
    q1: '[Metric Value Q1]',
    q2: '[Metric Value Q2]',
    q3: '[Metric Value Q3]',
    q4: '[Metric Value Q4]',
    q5: '[Metric Value Q5]',
    q6: '[Metric Value]',
  },
  'leadership-chart': {
    level: 'Person[LeadLevel]',
    id: 'Person[PersonKey]',
    parentId: 'Person[ParentKey]',
    label: 'Person[Role]',
    sublabel: 'Person[UnitName]',
    labCode: 'Person[LabCode]',
    labColour: 'Person[LabColour]',
    headcount: '[Span Headcount]',
    contractorPct: '[Span Contractor Pct]',
  },
  'role-composition': {
    lab: 'Person[LabName]',
    labCode: 'Person[LabCode]',
    labColour: 'Person[LabColour]',
    roleGroup: 'Person[RoleGroup]',
    count: '[Headcount]',
    contractors: '[Contractors]',
  },
  'skills-heat': {
    skill: 'Skill[SkillName]',
    lab: 'Person[LabName]',
    labCode: 'Person[LabCode]',
    labColour: 'Person[LabColour]',
    count: '[Skill Count]',
    estateCount: '[Skill Estate Count]',
    flag: '[Skill Flag]',
  },
  'lab-cards': {
    labId: 'Lab[LabKey]',
    lab: 'Lab[LabName]',
    labCode: 'Lab[LabCode]',
    labColour: 'Lab[LabColour]',
    labOrder: 'Lab[SortOrder]',
    lead: 'Lab[Lead]',
    composite: '[Composite]',
    band: '[Band Key]',
    healthyTeams: '[Teams Healthy Display]',
    watchTeams: '[Teams Watch Display]',
    actTeams: '[Teams Needing Action Display]',
    q1: '[Score Q1]',
    q2: '[Score Q2]',
    q3: '[Score Q3]',
    q4: '[Score Q4]',
    q5: '[Score Q5]',
    q6: '[Composite]',
  },
  'lab-legend': {
    labId: 'Lab[LabKey]',
    lab: 'Lab[LabName]',
    labCode: 'Lab[LabCode]',
    labColour: 'Lab[LabColour]',
    sortOrder: 'Lab[SortOrder]',
  },
  'lineage-table': {
    domainId: 'Metric[DomainKey]',
    domain: 'Metric[DomainName]',
    domainOrder: 'Domain[SortOrder] (Min)',
    metricId: 'Metric[MetricKey]',
    metricOrder: 'Metric[SortOrder]',
    metric: 'Metric[MetricName]',
    system: 'Metric[SourceSystem]',
    mode: 'Metric[IngestionMode]',
    modeLabel: '[Mode Label]',
    refresh: 'Metric[Refresh]',
    owner: 'Metric[Owner]',
    readiness: 'Metric[Readiness]',
  },
  'lab-sparkline-grid': {
    lab: 'Lab[LabName]',
    labCode: 'Lab[LabCode]',
    labColour: 'Lab[LabColour]',
    domainId: 'Domain[DomainKey]',
    domain: 'Domain[DomainName]',
    quarter: 'Quarter[QuarterKey]',
    score: '[Score]',
    band: '[Band Key]',
  },
  'maturity-ladder': {
    team: 'Team[TeamName]',
    lab: 'Team[LabName]',
    labCode: 'Team[LabCode]',
    labColour: 'Team[LabColour]',
    capability: 'Metric[MetricName]',
    level: '[Metric Value]',
  },
  'movement-table': {
    team: 'Team[TeamName]',
    lab: 'Team[LabName]',
    labCode: 'Team[LabCode]',
    labColour: 'Team[LabColour]',
    from: '[Composite Period Start]',
    to: '[Composite]',
    delta: '[Score Delta over Period]',
    bandText: '[Band Movement]',
    q1: '[Team Score Q1]',
    q2: '[Team Score Q2]',
    q3: '[Team Score Q3]',
    q4: '[Team Score Q4]',
    q5: '[Team Score Q5]',
    q6: '[Team Composite]',
  },
  'overview-hero': {
    scope: '[Scope Name]',
    composite: '[Composite]',
    healthyDomains: '[Domains Healthy Display]',
    watchDomains: '[Domains Watch Display]',
    actDomains: '[Domains Act Display]',
    coreDomains: '[Core Domains]',
    teamsNeedingAction: '[Teams Needing Action Display]',
    worstDomain: '[Worst Domain]',
    q1: '[Score Q1]',
    q2: '[Score Q2]',
    q3: '[Score Q3]',
    q4: '[Score Q4]',
    q5: '[Score Q5]',
    q6: '[Score]',
  },
  'metric-heat': {
    team: 'Team[TeamName]',
    labCode: 'Team[LabCode]',
    labColour: 'Team[LabColour]',
    teamScore: '[Team Domain Score]',
    metricOrder: 'Metric[SortOrder]',
    short: 'Metric[ShortName]',
    formatted: '[Metric Value Formatted]',
    band: '[Metric Band Key]',
  },
  'overview-key': { quarters: '[Selected Quarters]' },
  'page-footer': { left: '[Page Footer Left]', sources: '[Page Sources Refreshed]' },
  'page-text': {
    kicker: 'Page[Kicker]',
    title: 'Page[Title]',
    headline: '[Domain Headline]',
  },
  'read-outs': {
    domainId: 'Domain[DomainKey]',
    readOut1: '[Read Out 1]',
    readOut2: '[Read Out 2]',
    readOut3: '[Read Out 3]',
  },
  'readiness-legend': { quarters: '[Selected Quarters]' },
  'readiness-matrix': {
    domainId: 'Metric[DomainKey]',
    domain: 'Metric[DomainName]',
    mode: 'Metric[IngestionMode]',
    modeLabel: '[Mode Label]',
    count: 'Metric[MetricKey] (Count)',
    worstReadiness: '[Worst Readiness]',
    live: '[Live Metrics]',
    partial: '[Partial Metrics]',
    aspirational: '[Aspirational Metrics]',
  },
  'sources-strip': {
    domainId: 'Metric[DomainKey]',
    sourceOrder: 'Metric[SortOrder] (Min)',
    system: 'Metric[SourceSystem]',
    mode: 'Metric[IngestionMode]',
    modeLabel: '[Mode Label]',
    readiness: '[Worst Readiness]',
  },
  'team-matrix': {
    team: 'Team[TeamName]',
    lab: 'Team[LabName]',
    labCode: 'Team[LabCode]',
    labColour: 'Team[LabColour]',
    composite: '[Team Composite]',
    domainId: 'Domain[DomainKey]',
    domain: 'Domain[DomainName]',
    domainOrder: 'Domain[SortOrder]',
    score: '[Score]',
    band: '[Band Key]',
  },
  'trend-target': {
    domain: 'Domain[DomainName]',
    quarter: 'Quarter[QuarterKey]',
    quarterLabel: 'Quarter[QuarterLabel]',
    score: '[Score]',
    scope: '[Scope Name]',
  },
}

/** Fields typed dateTime, by spec; every other type follows the sample value. */
const DATES: Record<string, string[]> = { 'actions-timeline': ['due'], 'actions-list': ['due'], 'actions-table': ['due'] }

/** Keys whose string values, or string array members, name a field. */
const FIELD_KEYS = new Set(['field', 'fields', 'groupby', 'fold'])
/** Keys left as they are: prose, and axis or legend expressions, whose datum is not a row. */
const SKIP_KEYS = new Set(['$schema', 'description', 'axis', 'legend', 'data'])

type Json = Record<string, unknown>
type FieldType = 'numeric' | 'text' | 'bool' | 'dateTime'

interface DatasetField {
  key: string
  name: string
  description: string
  type: FieldType
  kind: 'column' | 'measure'
}

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function readJson(path: string): Json {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isObject(parsed)) throw new Error(`${path} is not a JSON object`)
  return parsed
}

function readRows(path: string): Json[] {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(parsed) || !parsed.every(isObject)) throw new Error(`${path} is not an array of objects`)
  return parsed
}

/**
 * Rewrites a spec with each dataset field it reads replaced by its key, and
 * records which fields it found. Field references are the FIELD_KEYS values
 * and, in expressions, `datum.name`, `data('dataset')[i].name` and
 * `pluck(data('dataset'), 'name')`; expressions use bracket access so a
 * mapped field name may contain spaces. A view with inline `data.values`
 * reads its own rows, so nothing inside it is replaced.
 */
function swapFields(node: unknown, keys: Map<string, string>, used: Set<string>, where: string, inline = false): unknown {
  const swap = (name: string) => {
    const key = keys.get(name)
    if (!key || inline) return name
    used.add(name)
    return key
  }
  if (Array.isArray(node)) return node.map((n) => swapFields(n, keys, used, where, inline))
  if (typeof node === 'string') {
    if (inline) return node
    const out = node
      .replace(/\bdatum\.(\w+)/g, (m, f: string) => (keys.has(f) ? `datum['${swap(f)}']` : m))
      .replace(/(data\('dataset'\)\[\d+\])\.(\w+)/g, (m, d: string, f: string) => (keys.has(f) ? `${d}['${swap(f)}']` : m))
      .replace(/(pluck\(data\('dataset'\),\s*)'(\w+)'/g, (m, p: string, f: string) => (keys.has(f) ? `${p}'${swap(f)}'` : m))
    const rest = node
      .replace(/\bdatum\.\w+/g, '')
      .replace(/data\('dataset'\)\[\d+\]\.\w+/g, '')
      .replace(/pluck\(data\('dataset'\),\s*'\w+'\)/g, '')
    for (const field of keys.keys()) {
      if (new RegExp(`\\.${field}\\b|'${field}'`).test(rest))
        throw new Error(`${where}: "${field}" is read in a way the template builder cannot map: ${node}`)
    }
    return out
  }
  if (!isObject(node)) return node
  const scoped = inline || (isObject(node.data) && Array.isArray(node.data.values))
  const out: Json = {}
  for (const [k, v] of Object.entries(node)) {
    if (SKIP_KEYS.has(k)) out[k] = v
    else if (FIELD_KEYS.has(k) && !scoped && typeof v === 'string') out[k] = swap(v)
    else if (FIELD_KEYS.has(k) && !scoped && Array.isArray(v)) out[k] = v.map((f) => (typeof f === 'string' ? swap(f) : f))
    else {
      if (k === 'as' && !scoped && [v].flat().some((f) => typeof f === 'string' && keys.has(f)))
        throw new Error(`${where}: a transform writes over the dataset field ${JSON.stringify(v)}`)
      out[k] = swapFields(v, keys, used, where, scoped)
    }
  }
  return out
}

/** Field notes from the README's Dataset fields table for the spec, keyed by field. */
function readmeNotes(readme: string, name: string): Map<string, string> {
  const notes = new Map<string, string>()
  const section = readme.split(/^### /m).find((s) => s.startsWith(`${name}:`))
  const table = section?.split('**Dataset fields.**')[1]?.split('\n\n')[1] ?? ''
  for (const line of table.split('\n').filter((l) => l.startsWith('| `'))) {
    const [, fieldCell, , note] = line.split('|').map((c) => c.trim())
    const range = fieldCell.match(/^`(\D+)(\d+)` to `\D+(\d+)`$/)
    const fields = range
      ? Array.from({ length: Number(range[3]) - Number(range[2]) + 1 }, (_, i) => `${range[1]}${Number(range[2]) + i}`)
      : [...fieldCell.matchAll(/`(\w+)`/g)].map((m) => m[1])
    fields.forEach((f) => notes.set(f, note))
  }
  return notes
}

function typeOf(rows: Json[], field: string, dates: string[]): FieldType {
  if (dates.includes(field)) return 'dateTime'
  const value = rows.map((r) => r[field]).find((v) => v !== null && v !== undefined)
  if (typeof value === 'number') return 'numeric'
  if (typeof value === 'boolean') return 'bool'
  return 'text'
}

/** A stable version-5-style UUID from the spec name. */
function uuidFor(name: string): string {
  const hex = createHash('sha1').update(`platform-health/deneb/${name}`).digest('hex')
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function build(name: string, config: Json, readme: string, providerVersion: string) {
  const spec = readJson(`${SPECS}${name}${SUFFIX}`)
  const meta = readJson(`${SPECS}${name}.meta.json`)
  if (typeof meta.sample !== 'string') throw new Error(`${name}.meta.json is missing "sample"`)
  const rows = readRows(`${SAMPLES}${meta.sample}`)
  const sampleFields = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((f) => !f.startsWith('__'))

  // First pass finds the fields the spec reads; the second numbers only those.
  const used = new Set<string>()
  swapFields(spec, new Map(sampleFields.map((f) => [f, f])), used, name)
  const read = sampleFields.filter((f) => used.has(f))
  const keys = new Map(read.map((f, i) => [f, `__${i}__`]))
  const swapped = swapFields(spec, keys, new Set(), name)
  if (!isObject(swapped)) throw new Error(`${name}: swapped spec is not a JSON object`)
  const { $schema, ...rest } = swapped

  const notes = readmeNotes(readme, name)
  const optional = Array.isArray(meta.optional) ? meta.optional : []
  const bindings = BINDINGS[name] ?? {}
  const dataset: DatasetField[] = read.map((f) => {
    const binding = bindings[f]
    if (!binding) throw new Error(`${name}: field "${f}" has no entry in BINDINGS`)
    const key = keys.get(f)
    if (!key) throw new Error(`${name}: field "${f}" has no key`)
    return {
      key,
      name: f,
      description: optional.includes(f) ? `Optional; the spec falls back when it is not bound. ${notes.get(f) ?? ''}`.trim() : (notes.get(f) ?? ''),
      type: typeOf(rows, f, DATES[name] ?? []),
      kind: binding.startsWith('[') ? 'measure' : 'column',
    }
  })
  const selection = JSON.stringify(spec).includes('"__select__"')
  const template = {
    $schema,
    usermeta: {
      deneb: { build: DENEB_BUILD, metaVersion: 1, provider: 'vegaLite', providerVersion },
      information: {
        name: `Platform Health ${name}`,
        description: typeof spec.description === 'string' ? spec.description : '',
        author: AUTHOR,
        uuid: uuidFor(name),
        generated: statSync(`${SPECS}${name}${SUFFIX}`).mtime.toISOString(),
      },
      dataset,
      config: JSON.stringify(config, null, 2),
      interactivity: {
        tooltip: true,
        contextMenu: true,
        selection,
        selectionMode: 'advanced',
        highlight: false,
        dataPointLimit: 30000,
      },
    },
    ...rest,
  }
  writeFileSync(`${TEMPLATES}${name}.deneb.json`, `${JSON.stringify(template, null, 2)}\n`)
  return { name, description: template.usermeta.information.description, dataset, bindings, selection }
}

const pkg = readJson(PACKAGE)
const vlRange = isObject(pkg.devDependencies) ? pkg.devDependencies['vega-lite'] : undefined
/** vega-lite major.minor, stamped on each template as its providerVersion. */
const providerVersion = typeof vlRange === 'string' ? /(\d+\.\d+)/.exec(vlRange)?.[1] : undefined
if (!providerVersion) throw new Error('package.json has no vega-lite version in devDependencies')

// Every binding must name a measure in measures.dax or a column in the model.
const measureNames = new Set(
  readFileSync(MEASURES_DAX, 'utf8')
    .split(/\r?\n/)
    .map((l) => /^([A-Za-z][A-Za-z0-9 ]*?) =\s*$/.exec(l)?.[1])
    .filter((n): n is string => Boolean(n)),
)
const columns = new Set<string>([
  'Period[Quarters]',
  'Period[Period]',
  ...['Step', 'Label', 'Short', 'Kind', 'DomainKey'].map((c) => `MovementStep[${c}]`),
  ...['PageKey', 'Kicker', 'Title', 'ReportName', 'SortOrder'].map((c) => `Page[${c}]`),
  // Calculated name columns written by export-pbip.ts (model/README.md, Calculated columns).
  ...['Action[DomainName]', 'Action[TeamName]', 'Action[LabName]', 'Team[LabName]', 'Metric[DomainName]'],
  ...['Action', 'Team'].flatMap((t) => [`${t}[LabCode]`, `${t}[LabColour]`]),
])
for (const f of readdirSync(CSV).filter((n) => n.endsWith('.csv'))) {
  const head = readFileSync(`${CSV}${f}`, 'utf8').split(/\r?\n/)[0]
  for (const c of head.split(',')) columns.add(`${f.replace(/\.csv$/, '')}[${c.trim()}]`)
}
const unknown = Object.entries(BINDINGS).flatMap(([spec, fields]) =>
  Object.entries(fields)
    .filter(([, b]) => {
      const measure = /^\[([^\]]+)\]$/.exec(b)
      return measure ? !measureNames.has(measure[1]) : !columns.has(b.replace(/ \(\w+\)$/, ''))
    })
    .map(([field, b]) => `${spec}.${field}: ${b}`),
)
if (unknown.length) throw new Error(`Bindings not found in measures.dax or the model:\n  ${unknown.join('\n  ')}`)

const config = readJson(`${DENEB}config.json`)
const readme = readFileSync(README, 'utf8')
const names = readdirSync(SPECS)
  .filter((f) => f.endsWith(SUFFIX))
  .map((f) => f.slice(0, -SUFFIX.length))
  .sort()

mkdirSync(TEMPLATES, { recursive: true })
const built = names.map((name) => build(name, config, readme, providerVersion))

const index = [
  '# Deneb templates',
  '',
  'Generated by `npm run deneb:templates` from `deneb/specs/`; do not edit by hand. How to import them is under Templates in `powerbi/README.md`.',
  '',
  'In the import dialog, map each placeholder to the measure or column in the last column. Kind follows that binding: a measure from `model/measures.dax`, core or build, is a measure; a table column is a column. The build checks every name against `measures.dax` and the model.',
  '',
  ...built.flatMap(({ name, description, dataset, bindings, selection }) => [
    `## ${name}`,
    '',
    `\`${name}.deneb.json\`. ${description} Cross-filtering: ${selection ? 'on' : 'off'}.`,
    '',
    '| Placeholder | Field | Type | Kind | DAX measure or column |',
    '| --- | --- | --- | --- | --- |',
    ...dataset.map((f) => `| \`${f.key}\` | \`${f.name}\` | ${f.type} | ${f.kind} | ${bindings[f.name]} |`),
    '',
  ]),
]
writeFileSync(`${TEMPLATES}INDEX.md`, index.join('\n'))
built.forEach(({ name, dataset }) => console.log(`ok   ${name} -> powerbi/deneb/templates/${name}.deneb.json (${dataset.length} fields)`))
console.log('ok   index -> powerbi/deneb/templates/INDEX.md')
