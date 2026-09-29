// Writes powerbi/pbip/PlatformHealth/: a Power BI Project (PBIP) with the report
// in the enhanced report format (PBIR) and the semantic model in TMDL, built from
// layout/manifest.json, model/measures.dax (every measure, and the Period and
// MovementStep tables), model/relationships.md, the model CSVs, the theme, the
// Deneb templates and deneb/config.json.
//
// It then reads the output back and exits with an error if any JSON fails to
// parse, a native visual lacks explicit background and border objects or a
// Deneb one lacks the transparent ones, a text box or text card's font needs
// more lines than its block has room for, a visual sits outside a known page, a field or filter names a column or
// measure the model does not have, a table leaves out a CSV column, a
// relationship names a missing column, or the measure count is off. Before
// writing anything it lints the DAX: every VAR name must start with an underscore
// and every table reference must be single-quoted, the two rules Power BI Desktop
// enforced on the first open, and no REMOVEFILTERS, ALL or ALLNOBLANKROW may take
// a whole 'Metric', 'Domain', 'Team' or 'Lab' table, which cleared the domain
// filter on the first render, no REMOVEFILTERS or ALL clearing a dimension's key or
// name column may leave out that table's SortOrder column, since Power BI adds
// sort-by columns to queries silently, and no measure may add 0 or COALESCE except text
// measures (names ending Headline, Read Out, Display or Formatted): a zero in
// place of BLANK let Power BI keep every cross-join row on the fourth open (see
// powerbi/README.md, Desktop feedback). It also writes the calculated name
// columns below, so visuals whose rows are actions, teams or metrics take names
// from their own table.
//
// CsvFolder defaults to a placeholder path. An optional, git-ignored
// powerbi/local.json ({ "csvFolder": "<absolute path>" }) replaces it with this
// machine's CSV folder.
//
// Nothing here has been opened in Power BI Desktop. Every schema URL and format
// version is in the constants block below so it can be corrected in one place.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Schema URLs and format versions (untested: correct here if Desktop objects)
// ---------------------------------------------------------------------------

const SCHEMA = {
  pbip: 'https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json',
  platform: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
  pbism: 'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json',
  pbir: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json',
  version: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json',
  report: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/1.0.0/schema.json',
  pages: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json',
  page: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/1.0.0/schema.json',
  visual: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/1.0.0/schema.json',
} as const

const FORMAT = {
  pbip: '1.0',
  platformConfig: '2.0',
  pbism: '4.0',
  pbir: '4.0',
  reportDefinition: '2.0.0',
  /** Report version stamped on the imported custom theme. */
  themeReportVersion: '5.61',
  /** Built-in base theme under the custom one (untested: see powerbi/README.md, Desktop feedback). */
  baseTheme: 'CY24SU10',
  compatibilityLevel: 1567,
  culture: 'en-GB',
} as const

/** Deneb's AppSource visual GUID (pbiviz.json `guid`). Verify it as described in powerbi/README.md, Project file. */
const DENEB_VISUAL_GUID = 'deneb7E15AEF80B9E4D4F8E12924291ECE89A'
/** Deneb's data role and format object names. */
const DENEB_ROLE = 'dataset'
const DENEB_OBJECT = 'vega'
/** Deneb's render mode for every visual. Set 'svg' to switch back; each visual can also be toggled in Deneb's format pane (Rendering, Render mode). */
const RENDER_MODE: 'canvas' | 'svg' = 'canvas'

const PROJECT = 'PlatformHealth'
const DISPLAY_NAME = 'Platform Health'
const MEASURE_TABLE = '_Measures'
const BUILD_FOLDER = 'Build measures'

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const POWERBI = fileURLToPath(new URL('../', import.meta.url))
const MANIFEST = `${POWERBI}layout/manifest.json`
const MEASURES = `${POWERBI}model/measures.dax`
const RELATIONSHIPS = `${POWERBI}model/relationships.md`
const CSV = `${POWERBI}model/csv/`
const CSV_FOLDER = 'C:\\PlatformHealth\\model\\csv'
const LOCAL = `${POWERBI}local.json`
const THEME = `${POWERBI}theme/platform-health.theme.json`
const TEMPLATES = `${POWERBI}deneb/templates/`
const SPECS = `${POWERBI}deneb/specs/`
const DENEB_CONFIG = `${POWERBI}deneb/config.json`
const OUT = `${POWERBI}pbip/${PROJECT}/`
const MODEL_DIR = `${OUT}${PROJECT}.SemanticModel/`
const REPORT_DIR = `${OUT}${PROJECT}.Report/`

// ---------------------------------------------------------------------------
// Manifest types (the shape export-layout.ts writes)
// ---------------------------------------------------------------------------

type Well = 'dataset' | 'values' | 'rows' | 'columns'
type Aggregation = 'First' | 'Count' | 'Count (Distinct)'

interface Field {
  well: Well
  name: string
  source: string
  via?: string
  aggregation?: Aggregation
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
  fontSize: string
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
  lines?: number
  params?: Record<string, string | number>
  specTitle?: string
}

interface ManifestPage {
  id: string
  displayName: string
  navigationLabel: string
  filters: Filter[]
  blocks: Block[]
}

interface Manifest {
  shared: {
    pageBackground: { name: string; hex: string; transparency: number }
    filterPane: {
      reportLevel: { field: string }[]
      pageLevel: { field: string; type: string; pages: string[] }[]
    }
    themeNames: {
      colours: Record<string, { token: string; hex: string }>
      fonts: Record<Formatting['fontFamily'], { family: string; fallback: string }>
      typeSizes: Record<string, { px: number; pt: number }>
    }
    buildMeasures: string[]
    pageTable: { columns: string[]; rows: (string | number)[][] }
  }
  reports: { id: string; name: string; pages: ManifestPage[] }[]
}

interface Template {
  usermeta: {
    dataset: { key: string; name: string; description?: string }[]
    interactivity: { tooltip: boolean; contextMenu: boolean; selection: boolean; highlight: boolean }
  }
  [key: string]: unknown
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A stable version-5-style UUID from a name, as build-templates.ts makes them. */
function uuidFor(name: string): string {
  const hex = createHash('sha1').update(`platform-health/pbip/${name}`).digest('hex')
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
const hexId = (name: string) => createHash('sha1').update(`platform-health/pbip/${name}`).digest('hex').slice(0, 20)

const written: string[] = []
function write(path: string, text: string) {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true })
  writeFileSync(path, text)
  written.push(path)
}
const writeJson = (path: string, value: Json) => write(path, `${JSON.stringify(value, null, 2)}\n`)

/** Power BI query literal: strings in single quotes with quotes doubled. */
const lit = (value: string): Json => ({ expr: { Literal: { Value: value } } })
const litText = (s: string) => lit(`'${s.replace(/'/g, "''")}'`)
const litBool = (b: boolean) => lit(b ? 'true' : 'false')
const litNum = (n: number) => lit(`${n}D`)
const solid = (hex: string): Json => ({ solid: { color: litText(hex) } })

/** TMDL object name, quoted when it holds anything but letters, digits and underscores. */
const tmdlName = (n: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`)

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
if (!Array.isArray(manifest.reports) || !manifest.shared) throw new Error(`${MANIFEST} is not a layout manifest`)
const themeText = readFileSync(THEME, 'utf8')
const denebConfig: Json = JSON.parse(readFileSync(DENEB_CONFIG, 'utf8'))
if (denebConfig === null || typeof denebConfig !== 'object' || Array.isArray(denebConfig)) throw new Error(`${DENEB_CONFIG} is not a Vega config object`)
const colours = manifest.shared.themeNames.colours
const hexOf = (name: string) => {
  const c = colours[name]
  if (!c) throw new Error(`Unknown theme colour ${name}`)
  return c.hex
}

// ---------------------------------------------------------------------------
// Semantic model: tables from the CSVs
// ---------------------------------------------------------------------------

type DataType = 'string' | 'int64' | 'double' | 'boolean' | 'dateTime'
interface Column {
  name: string
  dataType: DataType
  sortBy?: string
  /** DAX for a calculated column on a CSV table. */
  expression?: string
}
interface Table {
  name: string
  columns: Column[]
  /** M expression for CSV tables, DAX for calculated ones. */
  partition: { kind: 'm' | 'calculated'; source: string }
}

/** model/README.md, Loading the CSVs: these are decimal even when every value is whole. */
const DECIMAL = new Set(['MetricValue[Value]', 'Metric[Target]', 'ScoreFact[Value]', 'ScoreFact[Target]', 'ScoreFact[Span]'])
/** Date and time columns (ISO timestamps): typed datetime in M, not date, so the time of day survives. */
const DATETIME = new Set(['SourceRefresh[LastRefresh]'])
const M_TYPE: Record<DataType, string> = {
  string: 'type text',
  int64: 'Int64.Type',
  double: 'type number',
  boolean: 'type logical',
  dateTime: 'type date',
}

function inferType(table: string, column: string, values: string[]): DataType {
  if (DECIMAL.has(`${table}[${column}]`)) return 'double'
  if (DATETIME.has(`${table}[${column}]`)) return 'dateTime'
  const present = values.filter((v) => v !== '')
  if (!present.length) return 'string'
  if (present.every((v) => v === 'true' || v === 'false')) return 'boolean'
  if (present.every((v) => /^-?\d+$/.test(v))) return 'int64'
  if (present.every((v) => /^-?\d+(\.\d+)?$/.test(v))) return 'double'
  if (present.every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))) return 'dateTime'
  return 'string'
}

const relationshipsText = readFileSync(RELATIONSHIPS, 'utf8')
const sortBys = new Map<string, string>()
for (const m of relationshipsText.matchAll(/(\w+)\[(\w+)\] (?:to sort )?by \1\[(\w+)\]/g)) sortBys.set(`${m[1]}[${m[2]}]`, m[3])

const csvFiles = readdirSync(CSV).filter((f) => f.endsWith('.csv')).sort()
const csvColumns = new Map<string, string[]>()
const tables: Table[] = csvFiles.map((file) => {
  const name = file.replace(/\.csv$/, '')
  const lines = readFileSync(`${CSV}${file}`, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.length)
  const header = parseCsvLine(lines[0])
  const rows = lines.slice(1).map(parseCsvLine)
  csvColumns.set(name, header)
  const columns: Column[] = header.map((col, i) => {
    const sortBy = sortBys.get(`${name}[${col}]`)
    const c: Column = { name: col, dataType: inferType(name, col, rows.map((r) => r[i] ?? '')) }
    return sortBy ? { ...c, sortBy } : c
  })
  const typed = columns.map((c) => `{"${c.name}", ${DATETIME.has(`${name}[${c.name}]`) ? 'type datetime' : M_TYPE[c.dataType]}}`).join(', ')
  const source = [
    'let',
    `    Source = Csv.Document(File.Contents(CsvFolder & "\\${file}"), [Delimiter=",", Encoding=65001, QuoteStyle=QuoteStyle.Csv]),`,
    '    Promoted = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),',
    `    Typed = Table.TransformColumnTypes(Promoted, {${typed}})`,
    'in',
    '    Typed',
  ].join('\n')
  return { name, columns, partition: { kind: 'm', source } }
})

/** Name columns carried onto the table a visual's rows come from (model/README.md, Calculated columns). */
const CALCULATED_COLUMNS: { table: string; column: Column }[] = [
  { table: 'Action', column: { name: 'DomainName', dataType: 'string', expression: "RELATED ( 'Domain'[DomainName] )" } },
  { table: 'Action', column: { name: 'TeamName', dataType: 'string', expression: "RELATED ( 'Team'[TeamName] )" } },
  { table: 'Action', column: { name: 'LabName', dataType: 'string', expression: "RELATED ( 'Lab'[LabName] )" } },
  {
    table: 'Action',
    column: { name: 'Status', dataType: 'string', expression: "SWITCH ( 'Action'[Severity], \"act\", \"Act\", \"watch\", \"Watch\", 'Action'[Severity] )" },
  },
  { table: 'Team', column: { name: 'LabName', dataType: 'string', expression: "RELATED ( 'Lab'[LabName] )" } },
  { table: 'Metric', column: { name: 'DomainName', dataType: 'string', expression: "RELATED ( 'Domain'[DomainName] )" } },
  {
    table: 'Metric',
    column: {
      name: 'ReadinessWord',
      dataType: 'string',
      expression: "SWITCH ( 'Metric'[Readiness], \"live\", \"Live\", \"partial\", \"Partial\", \"aspirational\", \"Aspirational\", 'Metric'[Readiness] )",
    },
  },
  // The lab chip's code and colour, where Lab.csv carries them.
  ...['Action', 'Team'].flatMap((table) =>
    ['LabCode', 'LabColour']
      .filter((c) => csvColumns.get('Lab')?.includes(c))
      .map((c) => ({ table, column: { name: c, dataType: 'string' as const, expression: `RELATED ( 'Lab'[${c}] )` } })),
  ),
]
for (const { table, column } of CALCULATED_COLUMNS) {
  const t = tables.find((x) => x.name === table)
  if (!t) throw new Error(`Calculated column ${table}[${column.name}]: no ${table} table`)
  if (t.columns.some((c) => c.name === column.name)) throw new Error(`Calculated column ${table}[${column.name}] clashes with a CSV column`)
  t.columns.push(column)
}

// ---------------------------------------------------------------------------
// Measures: every one from measures.dax, build measures included
// ---------------------------------------------------------------------------

interface Measure {
  name: string
  expression: string
  description: string
  folder: string
}

const measuresText = readFileSync(MEASURES, 'utf8').replace(/\r\n/g, '\n')
const daxLines = measuresText.split('\n')
const HEADER = /^([A-Za-z][A-Za-z0-9 ]*?) =\s*$/
const daxMeasures: Measure[] = []
let folder = ''
for (let i = 0; i < daxLines.length; i++) {
  const line = daxLines[i]
  if (/^\/\/ =+$/.test(line) && /^\/\/ =+$/.test(daxLines[i + 2] ?? '')) {
    folder = daxLines[i + 1].replace(/^\/\/\s*/, '').trim()
    i += 2
    continue
  }
  const head = HEADER.exec(line)
  if (!head || line.startsWith('VAR ')) continue
  const description: string[] = []
  for (let j = i - 1; j >= 0 && daxLines[j].startsWith('// '); j--) description.unshift(daxLines[j].slice(3).trim())
  const body: string[] = []
  let j = i + 1
  for (; j < daxLines.length && daxLines[j].trim() !== ''; j++) body.push(daxLines[j])
  const next = daxLines.slice(j).find((l) => l.trim() !== '')
  if (next !== undefined && !next.startsWith('//'))
    throw new Error(`measures.dax: the block for ${head[1]} has a blank line inside it at line ${j + 1}`)
  daxMeasures.push({ name: head[1], expression: body.join('\n'), description: description.join(' '), folder })
  i = j
}
const daxMeasureCount = daxMeasures.length

/** Measures that build text may coalesce counts inside it; every other measure returns BLANK, never a zero fallback. */
const TEXT_MEASURE = /(Headline|Read Out \d*|Display|Formatted)$/

/** Desktop rejects some table names unquoted and some VAR names outright, so require 'Table' and _Var everywhere.
 *  A whole dimension table in REMOVEFILTERS or ALL also clears the tables its relationships bring in, so require columns.
 *  Adding 0 or COALESCE turns BLANK into 0, and Power BI keeps every cross-join row with a non-blank measure. */
function lintDax(where: string, dax: string): string[] {
  const tableNames = [...csvFiles.map((f) => f.replace(/\.csv$/, '')), 'Period', 'MovementStep', 'Page']
  const bareTable = new RegExp(`\\b(${tableNames.join('|')})\\b`)
  const problems: string[] = []
  dax.split('\n').forEach((line, i) => {
    const plain = line.replace(/"(?:[^"]|"")*"|'(?:[^']|'')*'|\[[^\]]*\]|\/\/.*$/g, ' ')
    for (const m of plain.matchAll(/\bVAR\s+([A-Za-z]\w*)/g))
      problems.push(`${where}, line ${i + 1}: VAR ${m[1]} needs an underscore prefix (_${m[1]})`)
    const table = bareTable.exec(plain)
    if (table) problems.push(`${where}, line ${i + 1}: table ${table[1]} must be single-quoted ('${table[1]}')`)
  })
  const code = dax.replace(/"(?:[^"]|"")*"|\/\/.*$/gm, ' ')
  for (const m of code.matchAll(/\b(REMOVEFILTERS|ALL|ALLNOBLANKROW)\s*\(\s*'(Metric|Domain|Team|Lab)'\s*[,)]/g)) {
    if (where === 'MovementStep table' && m[1] === 'ALLNOBLANKROW' && m[2] === 'Domain') continue
    problems.push(`${where}: ${m[1]} ( '${m[2]}' ) clears every table the relationships bring in; remove the column you mean ('${m[2]}'[Column])`)
  }
  const KEY_NAME_COLUMN: Record<string, string[]> = {
    Domain: ['DomainKey', 'DomainName'],
    Team: ['TeamKey', 'TeamName'],
    Lab: ['LabKey', 'LabName'],
    Metric: ['MetricKey', 'MetricName'],
  }
  for (const m of code.matchAll(/\b(REMOVEFILTERS|ALL)\s*\(([^)]*)\)/g)) {
    const [, fn, args] = m
    for (const [dim, columns] of Object.entries(KEY_NAME_COLUMN)) {
      const clearsKeyOrName = columns.some((c) => new RegExp(`'${dim}'\\[${c}\\]`).test(args))
      const clearsSortOrder = new RegExp(`'${dim}'\\[SortOrder\\]`).test(args)
      if (clearsKeyOrName && !clearsSortOrder)
        problems.push(
          `${where}: ${fn} clears '${dim}'[${columns[0]}] or '${dim}'[${columns[1]}] without '${dim}'[SortOrder]; Power BI adds sort-by columns to queries silently`,
        )
    }
  }
  if (!TEXT_MEASURE.test(where)) {
    if (/\+\s*0(?![\d.])/.test(code)) problems.push(`${where}: adds 0, so it returns 0 where it should be blank; drop the + 0 (the blank rule)`)
    if (/\bCOALESCE\s*\(/.test(code))
      problems.push(`${where}: COALESCE returns 0 where the measure should be blank; move it to a "${where} Display" measure (the blank rule)`)
  }
  return problems
}

const buildMeasures = daxMeasures.filter((m) => m.folder === BUILD_FOLDER)
const measures = daxMeasures
const measureNames = new Set(measures.map((m) => m.name))

/** Format strings where the measure is plainly a whole number or a signed change. */
const WHOLE = new Set([
  'Score Quarter Key', 'Teams In Scope', 'Team Metric Score', 'Metric Score', 'Team Domain Score', 'Domain Score',
  'Team Composite', 'Composite', 'Score', 'Selected Quarters', 'In Selected Period', 'Domains Healthy', 'Domains Watch',
  'Domains Act', 'Core Domains', 'Teams Healthy', 'Teams Watch', 'Teams Needing Action', 'Open Actions',
  'Actions Past Due', 'Actions Due 30 Days', 'Score Q1', 'Score Q2', 'Score Q3', 'Score Q4', 'Score Q5', 'Team Rank',
  'Days From Refresh', 'Live Metrics', 'Partial Metrics', 'Aspirational Metrics', 'Domains Healthy Display',
  'Domains Watch Display', 'Domains Act Display', 'Teams Healthy Display', 'Teams Watch Display', 'Teams Needing Action Display',
])
const SIGNED: Record<string, string> = {
  'Score Delta vs Previous': '+0;-0;0',
  'Score Delta over Period': '+0;-0;0',
  'Metric Delta over Period': '+0.0;-0.0;0.0',
}
const formatStringOf = (name: string) => (WHOLE.has(name) ? '0' : SIGNED[name])

/** A calculated table's DAX: its commented block in the measures.dax header, up to the next bare //. */
function commentedTableDax(name: string): string {
  const start = daxLines.findIndex((l) => l === `// ${name} =`)
  if (start < 0) throw new Error(`measures.dax: the ${name} table comment is missing`)
  const out: string[] = []
  for (let i = start + 1; i < daxLines.length && daxLines[i].startsWith('// '); i++) out.push(daxLines[i].slice(3))
  return out.join('\n')
}
const periodDax = commentedTableDax('Period')
/** The Page table: one row per report page from the manifest, as a DATATABLE like Period; page-text reads its kicker and title. */
const pageTableDax = (() => {
  const { columns, rows } = manifest.shared.pageTable
  const types = columns.map((_, i) => (typeof rows[0]?.[i] === 'number' ? 'INTEGER' : 'STRING'))
  const cell = (v: string | number) => (typeof v === 'number' ? String(v) : `"${v.replace(/"/g, '""')}"`)
  return [
    'DATATABLE (',
    ...columns.map((c, i) => `    "${c}", ${types[i]},`),
    '    {',
    rows.map((r) => `        { ${r.map(cell).join(', ')} }`).join(',\n'),
    '    }',
    ')',
  ].join('\n')
})()
const daxProblems = [
  ...daxMeasures.flatMap((m) => lintDax(m.name, m.expression)),
  ...['Period', 'MovementStep'].flatMap((t) => lintDax(`${t} table`, commentedTableDax(t))),
  ...lintDax('Page table', pageTableDax),
  ...CALCULATED_COLUMNS.flatMap(({ table, column }) => lintDax(`${table}[${column.name}] column`, column.expression ?? '')),
]
if (daxProblems.length) throw new Error(`measures.dax fails the DAX lint:\n  ${daxProblems.join('\n  ')}`)
tables.push({
  name: 'Period',
  columns: [
    { name: 'Quarters', dataType: 'int64' },
    { name: 'Period', dataType: 'string', sortBy: 'Quarters' },
  ],
  partition: { kind: 'calculated', source: periodDax },
})
tables.push({
  name: 'MovementStep',
  columns: [
    { name: 'Step', dataType: 'int64' },
    { name: 'Label', dataType: 'string', sortBy: 'Step' },
    { name: 'Short', dataType: 'string', sortBy: 'Step' },
    { name: 'Kind', dataType: 'string' },
    { name: 'DomainKey', dataType: 'string' },
  ],
  partition: { kind: 'calculated', source: commentedTableDax('MovementStep') },
})
tables.push({
  name: 'Page',
  columns: manifest.shared.pageTable.columns.map((c): Column =>
    c === 'SortOrder' ? { name: c, dataType: 'int64' } : { name: c, dataType: 'string' },
  ),
  partition: { kind: 'calculated', source: pageTableDax },
})

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

interface Relationship {
  from: [string, string]
  to: [string, string]
}
const relationships: Relationship[] = [
  ...relationshipsText.matchAll(/^\| (\w+)\[(\w+)\] \| (\w+)\[(\w+)\] \| Many to one \| Single/gm),
].map((m) => ({ from: [m[1], m[2]], to: [m[3], m[4]] }))

// ---------------------------------------------------------------------------
// TMDL writers
// ---------------------------------------------------------------------------

const indent = (text: string, tabs: number) =>
  text
    .split('\n')
    .map((l) => `${'\t'.repeat(tabs)}${l}`)
    .join('\n')

function columnTmdl(table: string, c: Column, calculated: boolean): string {
  if (c.expression)
    return [
      `\tcolumn ${tmdlName(c.name)} = ${c.expression}`,
      `\t\tdataType: ${c.dataType}`,
      `\t\tlineageTag: ${uuidFor(`column/${table}/${c.name}`)}`,
      '\t\tsummarizeBy: none',
      '',
      '\t\tannotation SummarizationSetBy = Automatic',
    ].join('\n')
  const lines = [`\tcolumn ${tmdlName(c.name)}`, `\t\tdataType: ${c.dataType}`]
  if (c.dataType === 'int64') lines.push('\t\tformatString: 0')
  const withTime = DATETIME.has(`${table}[${c.name}]`)
  if (c.dataType === 'dateTime') lines.push(`\t\tformatString: ${withTime ? 'd mmm yyyy hh:nn' : 'd mmm yyyy'}`)
  lines.push(`\t\tlineageTag: ${uuidFor(`column/${table}/${c.name}`)}`)
  lines.push(`\t\tsummarizeBy: ${table === 'MetricValue' && c.name === 'Value' ? 'sum' : 'none'}`)
  if (calculated) lines.push('\t\tisNameInferred')
  lines.push(`\t\tsourceColumn: ${calculated ? `[${c.name}]` : c.name}`)
  if (c.sortBy) lines.push(`\t\tsortByColumn: ${tmdlName(c.sortBy)}`)
  lines.push('', '\t\tannotation SummarizationSetBy = Automatic')
  if (c.dataType === 'dateTime') lines.push('', `\t\tannotation UnderlyingDateTimeDataType = ${withTime ? 'DateTime' : 'Date'}`)
  return lines.join('\n')
}

function tableTmdl(t: Table): string {
  const parts = [`table ${tmdlName(t.name)}`, `\tlineageTag: ${uuidFor(`table/${t.name}`)}`]
  const blocks = t.columns.map((c) => columnTmdl(t.name, c, t.partition.kind === 'calculated'))
  blocks.push(
    [`\tpartition ${tmdlName(t.name)} = ${t.partition.kind}`, '\t\tmode: import', '\t\tsource =', indent(t.partition.source, 4)].join('\n'),
  )
  blocks.push('\tannotation PBI_ResultType = Table')
  return `${parts.join('\n')}\n\n${blocks.join('\n\n')}\n`
}

function measureTmdl(m: Measure): string {
  const expr = m.expression.split('\n')
  const head =
    expr.length === 1 ? `\tmeasure ${tmdlName(m.name)} = ${expr[0]}` : `\tmeasure ${tmdlName(m.name)} =\n${indent(m.expression, 3)}`
  const lines = [...(m.description ? [`\t/// ${m.description}`] : []), head]
  const fmt = formatStringOf(m.name)
  if (fmt) lines.push(`\t\tformatString: ${fmt}`)
  if (m.folder) lines.push(`\t\tdisplayFolder: ${m.folder}`)
  lines.push(`\t\tlineageTag: ${uuidFor(`measure/${m.name}`)}`)
  return lines.join('\n')
}

function measuresTableTmdl(): string {
  const placeholder: Column = { name: 'Placeholder', dataType: 'string' }
  const column = columnTmdl(MEASURE_TABLE, placeholder, false).replace('\t\tdataType: string', '\t\tdataType: string\n\t\tisHidden')
  const partition = [
    `\tpartition ${tmdlName(MEASURE_TABLE)} = m`,
    '\t\tmode: import',
    '\t\tsource =',
    indent('let\n    Source = #table(type table [Placeholder = text], {})\nin\n    Source', 4),
  ].join('\n')
  return `table ${tmdlName(MEASURE_TABLE)}\n\tlineageTag: ${uuidFor(`table/${MEASURE_TABLE}`)}\n\n${[
    ...measures.map(measureTmdl),
    column,
    partition,
    '\tannotation PBI_ResultType = Table',
  ].join('\n\n')}\n`
}

// ---------------------------------------------------------------------------
// Report: fields, filters and visuals
// ---------------------------------------------------------------------------

interface Ref {
  entity: string
  property: string
  kind: 'column' | 'measure'
  aggregation?: Aggregation
}

function refOf(source: string, aggregation?: Aggregation): Ref {
  const measure = /^\[([^\]]+)\]$/.exec(source)
  if (measure) return { entity: MEASURE_TABLE, property: measure[1], kind: 'measure' }
  const column = /^(\w+)\[([^\]]+)\]$/.exec(source)
  if (!column) throw new Error(`Cannot read the field ${source}`)
  return aggregation
    ? { entity: column[1], property: column[2], kind: 'column', aggregation }
    : { entity: column[1], property: column[2], kind: 'column' }
}
/** The field a well should hold: the build measure where the manifest names one. */
const effectiveRef = (f: Field) => (f.via ? refOf(`[${f.via}]`) : refOf(f.source, f.aggregation))

/** Semantic query aggregate functions: Sum 0, Avg 1, Count (distinct) 2, Min 3, Max 4, CountNonNull 5. */
const AGG: Record<Aggregation, { fn: number; name: string; label: (c: string) => string }> = {
  First: { fn: 3, name: 'Min', label: (c) => `First ${c}` },
  Count: { fn: 5, name: 'CountNonNull', label: (c) => `Count of ${c}` },
  'Count (Distinct)': { fn: 2, name: 'Count', label: (c) => `Count of ${c}` },
}

function fieldExpr(r: Ref, sourceRef: Json): Json {
  if (r.kind === 'measure') return { Measure: { Expression: { SourceRef: sourceRef }, Property: r.property } }
  const column: Json = { Column: { Expression: { SourceRef: sourceRef }, Property: r.property } }
  return r.aggregation ? { Aggregation: { Expression: column, Function: AGG[r.aggregation].fn } } : column
}
const queryRefOf = (r: Ref) =>
  r.aggregation ? `${AGG[r.aggregation].name}(${r.entity}.${r.property})` : `${r.entity}.${r.property}`
const nativeRefOf = (r: Ref) => (r.aggregation ? AGG[r.aggregation].label(r.property) : r.property)

const usedRefs: { where: string; ref: Ref }[] = []
function projection(r: Ref, where: string): Json {
  usedRefs.push({ where, ref: r })
  return { field: fieldExpr(r, { Entity: r.entity }), queryRef: queryRefOf(r), nativeQueryRef: nativeRefOf(r) }
}

function valueLiteral(v: string | number | boolean, date: boolean): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return Number.isInteger(v) ? `${v}L` : `${v}D`
  if (date) return `datetime'${v}T00:00:00'`
  return `'${v.replace(/'/g, "''")}'`
}

/** A PBIR filter: categorical for column equality and lists, advanced for dates and measures. */
function filterJson(f: Filter, where: string, extra: { [key: string]: Json } = {}): Json {
  const r = refOf(f.field)
  usedRefs.push({ where, ref: r })
  const target = fieldExpr(r, { Source: 't' })
  const from: Json = [{ Name: 't', Entity: r.entity, Type: 0 }]
  let condition: Json
  let type: string
  if (f.operator === 'top') throw new Error(`${where}: Top N filters are not generated`)
  if (r.kind === 'measure' || f.operator === 'on or after') {
    if (Array.isArray(f.value)) throw new Error(`${where}: a list cannot be compared`)
    const comparison: Json = {
      Comparison: {
        ComparisonKind: f.operator === 'on or after' ? 2 : 0,
        Left: target,
        Right: { Literal: { Value: valueLiteral(f.value, f.operator === 'on or after') } },
      },
    }
    condition = f.operator === 'is not' ? { Not: { Expression: comparison } } : comparison
    type = 'Advanced'
  } else {
    const values = (Array.isArray(f.value) ? f.value : [f.value]).map((v): Json => [{ Literal: { Value: valueLiteral(v, false) } }])
    const inList: Json = { In: { Expressions: [target], Values: values } }
    condition = f.operator === 'is not' ? { Not: { Expression: inList } } : inList
    type = 'Categorical'
  }
  return {
    name: hexId(`filter/${where}/${f.field}`),
    field: fieldExpr(r, { Entity: r.entity }),
    type,
    filter: { Version: 2, From: from, Where: [{ Condition: condition }] },
    howCreated: 'User',
    ...extra,
  }
}

// Visual container formatting from the manifest's theme names.

const fontOf = (family: Formatting['fontFamily']) => {
  const f = manifest.shared.themeNames.fonts[family]
  return `${f.family}, ${f.fallback}`
}
/** Points from the app's px, at 0.75 exactly, for every text box and card. */
const ptOf = (size: string) => {
  const s = manifest.shared.themeNames.typeSizes[size]
  if (!s) throw new Error(`Unknown type size ${size}`)
  return s.px * 0.75
}
const paddingOf = (f: Formatting) => {
  const [top, right = top] = f.padding.split(' ').map(Number)
  return { top, right }
}

/** A text box or text card whose lines need more height than its block has: pt * 1.333 * lines <= height - vertical padding. */
const fitProblems: string[] = []
function checkFit(where: string, b: Block, linePts: number[]) {
  const need = linePts.reduce((a, pt) => a + pt * 1.333, 0)
  const room = b.height - 2 * paddingOf(b.formatting).top
  if (need > room) fitProblems.push(`${where}: text needs ${need.toFixed(1)}px but the block has ${room}px`)
}
const props = (p: { [key: string]: Json }): Json => [{ properties: p }]

/** Native visuals: background, border, padding and shadow written out explicitly, not left to the theme. */
function containerObjects(b: Block, title: string | undefined): { [key: string]: Json } {
  const f = b.formatting
  const { top, right } = paddingOf(f)
  return {
    title: props(
      title
        ? {
            show: litBool(true),
            text: litText(title),
            fontFamily: litText(fontOf('mono')),
            fontSize: litNum(10),
            fontColor: solid(hexOf('muted')),
          }
        : { show: litBool(false) },
    ),
    background: props(
      f.background === 'none'
        ? { show: litBool(false), transparency: litNum(100) }
        : { show: litBool(true), color: solid(hexOf(f.background)), transparency: litNum(0) },
    ),
    border: props(
      f.border === 'none' ? { show: litBool(false) } : { show: litBool(true), color: solid(hexOf(f.border)), radius: litNum(f.radius) },
    ),
    padding: props({ top: litNum(top), bottom: litNum(top), left: litNum(right), right: litNum(right) }),
    dropShadow: props({ show: litBool(false) }),
  }
}

/** A spec's container from its meta.json: "card" for single-card visuals, "bare" for specs that draw their own cards or are text. */
type Container = 'card' | 'bare'
function containerOf(template: string): Container {
  const c = (JSON.parse(readFileSync(`${SPECS}${template}.meta.json`, 'utf8')) as { container?: string }).container
  if (c !== 'card' && c !== 'bare') throw new Error(`${SPECS}${template}.meta.json: container must be "card" or "bare"`)
  return c
}
/** Card padding and radius for "card" Deneb containers. */
const CARD_PADDING = 20
const CARD_RADIUS = 18
/**
 * Deneb containers, title always off. "card": a white card with the theme line
 * border, radius 18 and padding 20, the spec drawing no card of its own.
 * "bare": transparent, no border, no padding; the spec draws everything.
 */
function denebContainerObjects(container: Container): { [key: string]: Json } {
  const pad = container === 'card' ? CARD_PADDING : 0
  return {
    title: props({ show: litBool(false) }),
    subTitle: props({ show: litBool(false) }),
    background: props(
      container === 'card' ? { show: litBool(true), color: solid(hexOf('surface')), transparency: litNum(0) } : { show: litBool(false), transparency: litNum(100) },
    ),
    border: props(
      container === 'card' ? { show: litBool(true), color: solid(hexOf('line')), radius: litNum(CARD_RADIUS) } : { show: litBool(false) },
    ),
    padding: props({ top: litNum(pad), bottom: litNum(pad), left: litNum(pad), right: litNum(pad) }),
    dropShadow: props({ show: litBool(false) }),
  }
}

/** Headlines, notes and read-outs: Card (new) showing one text value, label off, left aligned, wrapping. */
const TEXT_CARD = /\.(headline|note|read-out-\d)$/

function textCardObjects(b: Block, where: string): { [key: string]: Json } {
  const f = b.formatting
  const pt = ptOf(f.fontSize)
  checkFit(where, b, Array.from({ length: b.lines ?? 1 }, () => pt))
  const byDefault = (p: { [key: string]: Json }): Json => [{ properties: p, selector: { id: 'default' } }]
  return {
    label: byDefault({ show: litBool(false) }),
    value: byDefault({
      fontFamily: litText(fontOf(f.fontFamily)),
      fontSize: litNum(pt),
      fontColor: solid(hexOf(f.color ?? 'ink')),
      bold: litBool(false),
      horizontalAlignment: litText('left'),
      wordWrap: litBool(true),
    }),
    fillCustom: byDefault({ show: litBool(false) }),
    outline: byDefault({ show: litBool(false) }),
  }
}

// Text boxes: static runs from the manifest notes; dynamic values stay as marked placeholders.

interface Run {
  text: string
  family?: Formatting['fontFamily']
  size?: string
  colour?: string
  bold?: boolean
}
interface Paragraph {
  runs: Run[]
  align?: 'right'
}

const refreshed = (() => {
  const lines = readFileSync(`${CSV}Config.csv`, 'utf8').split(/\r?\n/)
  const i = parseCsvLine(lines[0]).indexOf('RefreshDate')
  const iso = parseCsvLine(lines[1])[i]
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
})()

/** The dynamic value a text box shows: the bound build measure where the field names one. */
const placeholder = (f: Field) => `[${(f.via ?? f.source).replace(/^\[|\]$/g, '')}]`

function textboxParagraphs(b: Block, reportName: string): Paragraph[] {
  const kind = b.id.slice(b.id.indexOf('.') + 1)
  const quoted = /^Static text "([^"]+)"/.exec(b.notes)?.[1]
  if (kind === 'footer')
    return [{ runs: [{ text: `Platform Health · ${reportName} · data refreshed ${refreshed}` }] }]
  if (kind === 'patterns') {
    const tail = b.notes.split('one note. ')[1] ?? ''
    const items = [...tail.matchAll(/([A-Z][A-Za-z ]+): (.+?\.)(?= [A-Z][A-Za-z ]+: |$)/g)]
    return [
      { runs: [{ text: 'INGESTION PATTERNS', family: 'mono', size: 'chip', colour: 'muted' }] },
      ...items.map((m): Paragraph => ({
        runs: [
          { text: `${m[1].toUpperCase()}  `, family: 'mono', size: 'chip', colour: 'muted' },
          { text: m[2] },
        ],
      })),
    ]
  }
  if (b.fields.length) return [{ runs: b.fields.map((f) => ({ text: placeholder(f) })) }]
  if (quoted) return [{ runs: [{ text: quoted, bold: /", bold\./.test(b.notes) }] }]
  throw new Error(`${b.id}: no text for the text box`)
}

function paragraphsJson(b: Block, paragraphs: Paragraph[]): Json {
  const f = b.formatting
  return paragraphs.map((p): Json => {
    const runs: Json = p.runs.map((r) => {
      const style: { [key: string]: Json } = {
        fontFamily: fontOf(r.family ?? f.fontFamily),
        fontSize: `${ptOf(r.size ?? f.fontSize)}pt`,
        color: hexOf(r.colour ?? f.color ?? 'ink'),
      }
      if (r.bold) style.fontWeight = 'bold'
      return { value: r.text, textStyle: style }
    })
    return p.align ? { textRuns: runs, horizontalTextAlignment: p.align } : { textRuns: runs }
  })
}

// Tables and matrices: small rows, mono headers, horizontal rules, totals off.

const TABLE_VALUE_PT = 9.75
const TABLE_HEADER_PT = 8.25
/** Band background rules for a matrix value (Healthy 80 and above, Watch 60 to 79, Act below 60), as the app's heat cells. */
const BAND_RULES: { kind: number; value: number; fill: string }[] = [
  { kind: 2, value: 80, fill: 'good-fill' },
  { kind: 2, value: 60, fill: 'warn-fill' },
  { kind: 3, value: 60, fill: 'bad-fill' },
]

function tableObjects(b: Block, pivot: boolean): { [key: string]: Json } {
  const values: { [key: string]: Json } = {
    fontFamily: litText(fontOf('body')),
    fontSize: litNum(TABLE_VALUE_PT),
    fontColorPrimary: solid(hexOf('ink')),
    fontColorSecondary: solid(hexOf('ink')),
    backColorPrimary: solid(hexOf('surface')),
    backColorSecondary: solid(hexOf('surface')),
  }
  if (b.fields.some((f) => f.source === 'Action[Description]')) values.wordWrap = litBool(!/Text wrap off/.test(b.notes))
  const header = { fontFamily: litText(fontOf('mono')), fontSize: litNum(TABLE_HEADER_PT), fontColor: solid(hexOf('muted')) }
  const objects: { [key: string]: Json } = {
    values: props(values),
    columnHeaders: props(header),
    grid: props({
      rowPadding: litNum(2),
      gridVertical: litBool(false),
      gridHorizontal: litBool(true),
      gridHorizontalColor: solid(hexOf('line')),
    }),
  }
  if (!pivot) return { ...objects, total: props({ totals: litBool(false) }) }
  const rules = b.fields
    .filter((f) => f.well === 'values')
    .map((f): Json => {
      const r = effectiveRef(f)
      const left = fieldExpr(r, { Entity: r.entity })
      return {
        properties: {
          backColor: {
            solid: {
              color: {
                expr: {
                  Conditional: {
                    Cases: BAND_RULES.map((rule): Json => ({
                      Condition: { Comparison: { ComparisonKind: rule.kind, Left: left, Right: { Literal: { Value: `${rule.value}D` } } } },
                      Value: { Literal: { Value: `'${hexOf(rule.fill)}'` } },
                    })),
                  },
                },
              },
            },
          },
        },
        selector: { data: [{ dataViewWildcard: { matchingOption: 1 } }], metadata: queryRefOf(r) },
      }
    })
  return {
    ...objects,
    values: [...(objects.values as Json[]), ...rules],
    rowHeaders: props({ fontFamily: litText(fontOf('body')), fontSize: litNum(TABLE_VALUE_PT), fontColor: solid(hexOf('ink')) }),
    subTotals: props({ rowSubtotals: litBool(false), columnSubtotals: litBool(false) }),
  }
}

// Deneb: the template's spec with its placeholders swapped for the dataset field names.

const templateCache = new Map<string, Template>()
function templateOf(name: string): Template {
  const cached = templateCache.get(name)
  if (cached) return cached
  const t: Template = JSON.parse(readFileSync(`${TEMPLATES}${name}.deneb.json`, 'utf8'))
  if (!Array.isArray(t?.usermeta?.dataset) || !t.usermeta.interactivity) throw new Error(`${TEMPLATES}${name}.deneb.json is not a Deneb template`)
  templateCache.set(name, t)
  return t
}

const denebChecks: string[] = []
function denebVisual(b: Block, where: string): { objects: { [key: string]: Json }; projections: Json[] } {
  const t = templateOf(b.visual)
  const byName = new Map(b.fields.map((f) => [f.name, f]))
  const projections: Json[] = []
  const seen = new Map<string, string>()
  const keyTo = new Map<string, string>()
  for (const d of t.usermeta.dataset) {
    const f = byName.get(d.name)
    if (!f && d.description?.startsWith('Optional;')) {
      // An optional field left unbound: the spec reads a field the dataset lacks and falls back.
      keyTo.set(d.key, d.name)
      continue
    }
    if (!f) throw new Error(`${where}: template field ${d.name} is not mapped in the manifest`)
    const r = effectiveRef(f)
    const q = queryRefOf(r)
    if (!seen.has(q)) {
      seen.set(q, nativeRefOf(r))
      projections.push(projection(r, where))
    }
    keyTo.set(d.key, seen.get(q) ?? '')
  }
  const names = [...new Set(seen.values())]
  if (names.length !== seen.size) denebChecks.push(`${where}: two dataset fields share a display name`)
  for (const n of names) if (/['.[\]\\]/.test(n)) denebChecks.push(`${where}: dataset field ${n} holds a character Vega reads as a path`)
  const { usermeta, ...template } = t
  const params = b.params ?? {}
  const specParams = Array.isArray(template.params) ? (template.params as { name: string }[]) : []
  for (const n of Object.keys(params)) if (!specParams.some((p) => p.name === n)) denebChecks.push(`${where}: param ${n} is not in the spec`)
  const withParams = Object.keys(params).length
    ? { ...template, params: specParams.map((p) => (p.name in params ? { name: p.name, value: params[p.name] } : p)) }
    : template
  const spec = b.specTitle ? { ...withParams, title: { ...(withParams.title as { [key: string]: Json }), text: b.specTitle } } : withParams
  const specText = JSON.stringify(spec, null, 2).replace(/__(\d+)__/g, (m, n: string) => keyTo.get(`__${n}__`) ?? m)
  if (/__\d+__/.test(specText)) denebChecks.push(`${where}: a placeholder is left in the spec`)
  const vega = {
    provider: litText('vegaLite'),
    jsonSpec: litText(specText),
    jsonConfig: litText(JSON.stringify(denebConfig, null, 2)),
    renderMode: litText(RENDER_MODE),
    isNewDialogOpen: litBool(false),
    enableTooltips: litBool(usermeta.interactivity.tooltip),
    enableContextMenu: litBool(usermeta.interactivity.contextMenu),
    enableSelection: litBool(usermeta.interactivity.selection),
    enableHighlight: litBool(usermeta.interactivity.highlight),
  }
  return { objects: { [DENEB_OBJECT]: props(vega) }, projections }
}

function visualJson(b: Block, index: number, pageId: string, reportName: string, name: string): { json: Json; visualType: string } {
  const where = `${pageId}/${b.id}`
  let visualType: string
  let queryState: { [key: string]: Json } | undefined
  let objects: { [key: string]: Json } = {}
  let title: string | undefined

  if (b.kind === 'deneb') {
    const d = denebVisual(b, where)
    visualType = DENEB_VISUAL_GUID
    queryState = { [DENEB_ROLE]: { projections: d.projections } }
    objects = d.objects
  } else if (b.visual === 'textbox') {
    visualType = 'textbox'
    const paragraphs = textboxParagraphs(b, reportName)
    checkFit(where, b, paragraphs.map((p) => Math.max(...p.runs.map((r) => ptOf(r.size ?? b.formatting.fontSize)))))
    objects = { general: props({ paragraphs: paragraphsJson(b, paragraphs) }) }
  } else if (b.visual === 'table') {
    const pivot = b.fields.some((f) => f.well === 'rows' || f.well === 'columns')
    visualType = pivot ? 'pivotTable' : 'tableEx'
    const role = (well: Well) =>
      b.fields.filter((f) => f.well === well).map((f) => ({ ...(projection(effectiveRef(f), where) as { [key: string]: Json }), displayName: f.name }))
    queryState = pivot ? { Rows: { projections: role('rows') }, Columns: { projections: role('columns') }, Values: { projections: role('values') } } : { Values: { projections: role('values') } }
    title = b.title.toUpperCase()
    objects = tableObjects(b, pivot)
  } else if (b.visual === 'card' && TEXT_CARD.test(b.id)) {
    if (b.fields.length !== 1) throw new Error(`${where}: a headline or read-out card takes one measure`)
    visualType = 'cardVisual'
    queryState = { Data: { projections: [projection(effectiveRef(b.fields[0]), where)] } }
    objects = textCardObjects(b, where)
  } else if (b.visual === 'card') {
    // One field: the classic card. Several: Card (new), which takes a list of values.
    const single = b.fields.length === 1
    visualType = single ? 'card' : 'cardVisual'
    queryState = { [single ? 'Values' : 'Data']: { projections: b.fields.map((f) => projection(effectiveRef(f), where)) } }
    if (single) {
      const pt = ptOf('kpiValue')
      checkFit(where, b, [pt])
      objects = {
        categoryLabels: props({ show: litBool(false) }),
        labels: props({ fontFamily: litText(fontOf('display')), fontSize: litNum(pt), color: solid(hexOf('ink')) }),
        wordWrap: props({ show: litBool(true) }),
      }
    }
    title = single && b.fields[0].name === b.title ? b.title.toUpperCase() : undefined
  } else if (b.visual === 'slicer') {
    visualType = 'slicer'
    queryState = { Values: { projections: b.fields.map((f) => projection(effectiveRef(f), where)) } }
  } else throw new Error(`${where}: no PBIR mapping for native visual ${b.visual}`)

  const visual: { [key: string]: Json } = { visualType }
  if (queryState) visual.query = { queryState }
  if (Object.keys(objects).length) visual.objects = objects
  visual.visualContainerObjects = b.kind === 'deneb' ? denebContainerObjects(containerOf(b.visual)) : containerObjects(b, title)
  visual.drillFilterOtherVisuals = true

  const json: { [key: string]: Json } = {
    $schema: SCHEMA.visual,
    name,
    position: { x: b.x, y: b.y, z: index * 1000, width: b.width, height: b.height, tabOrder: index * 1000 },
    visual,
  }
  const visualFilters = b.filters.filter((f) => f.level === 'visual')
  if (visualFilters.length) json.filterConfig = { filters: visualFilters.map((f) => filterJson(f, where)) }
  return { json, visualType }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

// Clear the generated definitions only; Desktop's own .pbi folders survive a regenerate.
for (const dir of [`${MODEL_DIR}definition`, `${REPORT_DIR}definition`, `${REPORT_DIR}StaticResources`])
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })

writeJson(`${OUT}${PROJECT}.pbip`, {
  $schema: SCHEMA.pbip,
  version: FORMAT.pbip,
  artifacts: [{ report: { path: `${PROJECT}.Report` } }],
  settings: { enableAutoRecovery: true },
})

// Semantic model
writeJson(`${MODEL_DIR}.platform`, {
  $schema: SCHEMA.platform,
  metadata: { type: 'SemanticModel', displayName: DISPLAY_NAME },
  config: { version: FORMAT.platformConfig, logicalId: uuidFor('item/SemanticModel') },
})
writeJson(`${MODEL_DIR}definition.pbism`, { $schema: SCHEMA.pbism, version: FORMAT.pbism, settings: {} })
write(`${MODEL_DIR}definition/database.tmdl`, `database\n\tcompatibilityLevel: ${FORMAT.compatibilityLevel}\n`)

const queryOrder = ['CsvFolder', ...tables.filter((t) => t.partition.kind === 'm').map((t) => t.name), MEASURE_TABLE]
const tableNames = [...tables.map((t) => t.name), MEASURE_TABLE]
write(
  `${MODEL_DIR}definition/model.tmdl`,
  [
    'model Model',
    `\tculture: ${FORMAT.culture}`,
    '\tdefaultPowerBIDataSourceVersion: powerBI_V3',
    `\tsourceQueryCulture: ${FORMAT.culture}`,
    '\tdataAccessOptions',
    '\t\tlegacyRedirects',
    '\t\treturnErrorValuesAsNull',
    '',
    `annotation PBI_QueryOrder = ${JSON.stringify(queryOrder)}`,
    '',
    'annotation __PBI_TimeIntelligenceEnabled = 0',
    '',
    'annotation PBI_ProTooling = ["DevMode"]',
    '',
    ...tableNames.map((n) => `ref table ${tmdlName(n)}`),
    '',
    `ref cultureInfo ${FORMAT.culture}`,
    '',
  ].join('\n'),
)
const csvFolder = (() => {
  if (!existsSync(LOCAL)) return CSV_FOLDER
  const local: Json = JSON.parse(readFileSync(LOCAL, 'utf8'))
  const folder = local !== null && typeof local === 'object' && !Array.isArray(local) ? local.csvFolder : undefined
  if (typeof folder !== 'string' || !folder) throw new Error(`${LOCAL} has no csvFolder string`)
  return folder
})()
write(
  `${MODEL_DIR}definition/expressions.tmdl`,
  [
    `expression CsvFolder = "${csvFolder.replace(/"/g, '""')}" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]`,
    `\tlineageTag: ${uuidFor('expression/CsvFolder')}`,
    '',
    '\tannotation PBI_ResultType = Text',
    '',
  ].join('\n'),
)
for (const t of tables) write(`${MODEL_DIR}definition/tables/${t.name}.tmdl`, tableTmdl(t))
write(`${MODEL_DIR}definition/tables/${MEASURE_TABLE}.tmdl`, measuresTableTmdl())
write(
  `${MODEL_DIR}definition/relationships.tmdl`,
  relationships
    .map((r) =>
      [
        `relationship ${uuidFor(`relationship/${r.from.join('.')}/${r.to.join('.')}`)}`,
        '\tfromCardinality: many',
        '\ttoCardinality: one',
        '\tcrossFilteringBehavior: oneDirection',
        `\tfromColumn: ${tmdlName(r.from[0])}.${tmdlName(r.from[1])}`,
        `\ttoColumn: ${tmdlName(r.to[0])}.${tmdlName(r.to[1])}`,
      ].join('\n'),
    )
    .join('\n\n') + '\n',
)
write(`${MODEL_DIR}definition/cultures/${FORMAT.culture}.tmdl`, `cultureInfo ${FORMAT.culture}\n`)

// Report
writeJson(`${REPORT_DIR}.platform`, {
  $schema: SCHEMA.platform,
  metadata: { type: 'Report', displayName: DISPLAY_NAME },
  config: { version: FORMAT.platformConfig, logicalId: uuidFor('item/Report') },
})
writeJson(`${REPORT_DIR}definition.pbir`, {
  $schema: SCHEMA.pbir,
  version: FORMAT.pbir,
  datasetReference: { byPath: { path: `../${PROJECT}.SemanticModel` } },
})
write(`${REPORT_DIR}StaticResources/RegisteredResources/${PROJECT}.json`, themeText)
writeJson(`${REPORT_DIR}definition/version.json`, { $schema: SCHEMA.version, version: FORMAT.reportDefinition })

const pane = manifest.shared.filterPane
writeJson(`${REPORT_DIR}definition/report.json`, {
  $schema: SCHEMA.report,
  layoutOptimization: 'None',
  themeCollection: {
    baseTheme: { name: FORMAT.baseTheme, reportVersionAtImport: FORMAT.themeReportVersion, type: 'SharedResources' },
    customTheme: { name: `${PROJECT}.json`, reportVersionAtImport: FORMAT.themeReportVersion, type: 'RegisteredResources' },
  },
  filterConfig: {
    filters: pane.reportLevel.map((f): Json => {
      const r = refOf(f.field)
      usedRefs.push({ where: 'report', ref: r })
      return { name: hexId(`filter/report/${f.field}`), field: fieldExpr(r, { Entity: r.entity }), type: 'Categorical', howCreated: 'User' }
    }),
  },
  resourcePackages: [
    {
      name: 'RegisteredResources',
      type: 'RegisteredResources',
      items: [{ name: `${PROJECT}.json`, path: `${PROJECT}.json`, type: 'CustomTheme' }],
    },
  ],
  publicCustomVisuals: [DENEB_VISUAL_GUID],
  settings: {
    useStylableVisualContainerHeader: true,
    defaultDrillFilterOtherVisuals: true,
    allowChangeFilterTypes: true,
    useEnhancedTooltips: true,
    useDefaultAggregateDisplayName: true,
  },
})

const pageLevel = new Map(pane.pageLevel.map((p) => [p.field, p]))
const pageOrder: string[] = []
const visualCounts = new Map<string, number>()
const visualPages: { page: string; dir: string; template: string }[] = []
let visualTotal = 0
for (const report of manifest.reports) {
  for (const pg of report.pages) {
    const pageName = pg.id
    if (!/^[\w-]{1,50}$/.test(pageName)) throw new Error(`Page id ${pageName} is not a valid PBIR name`)
    pageOrder.push(pageName)
    const pageDir = `${REPORT_DIR}definition/pages/${pageName}/`
    const pageFilters = pg.filters.map((f) => {
      const setting = pageLevel.get(f.field)?.type ?? ''
      const extra: { [key: string]: Json } = {}
      if (/locked/.test(setting)) extra.isLockedInViewMode = true
      if (/hidden/.test(setting)) extra.isHiddenInViewMode = true
      if (/Require single selection/.test(setting)) extra.objects = { general: props({ requireSingleSelect: litBool(true) }) }
      return filterJson(f, `${pageName}/page`, extra)
    })
    const bg = manifest.shared.pageBackground
    const page: { [key: string]: Json } = {
      $schema: SCHEMA.page,
      name: pageName,
      displayName: pg.navigationLabel,
      displayOption: 'FitToPage',
      height: 1080,
      width: 1920,
      objects: { background: props({ color: solid(bg.hex), transparency: litNum(bg.transparency) }) },
    }
    if (pageFilters.length) page.filterConfig = { filters: pageFilters }
    writeJson(`${pageDir}page.json`, page)
    pg.blocks.forEach((b, i) => {
      const name = b.id.replace(/[^\w-]/g, '_')
      if (name.length > 50) throw new Error(`${b.id}: visual name longer than 50 characters`)
      const { json, visualType } = visualJson(b, i, pageName, report.name, name)
      writeJson(`${pageDir}visuals/${name}/visual.json`, json)
      visualPages.push({ page: pageName, dir: `${pageDir}visuals/${name}`, template: b.visual })
      const label = visualType === DENEB_VISUAL_GUID ? 'deneb' : visualType
      visualCounts.set(label, (visualCounts.get(label) ?? 0) + 1)
      visualTotal++
    })
  }
}
writeJson(`${REPORT_DIR}definition/pages/pages.json`, { $schema: SCHEMA.pages, pageOrder, activePageName: pageOrder[0] })

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

const errors: string[] = [...denebChecks, ...fitProblems]

// Every visual is Deneb, the page-footer included: no text boxes, one footer a page.
for (const [type, n] of visualCounts) if (type !== 'deneb') errors.push(`${n} ${type} visuals; every visual is expected to be Deneb`)
const footers = visualPages.filter((v) => /[\\/]visuals[\\/][^\\/]+_footer$/.test(v.dir)).length
if (footers !== pageOrder.length) errors.push(`${footers} page-footer visuals; expected one a page (${pageOrder.length})`)

// Native visuals carry explicit background and border objects; Deneb visuals the transparent, borderless ones.
for (const v of visualPages) {
  const json = JSON.parse(readFileSync(`${v.dir}/visual.json`, 'utf8')) as { visual: { visualType: string; visualContainerObjects?: Record<string, unknown> } }
  const c = json.visual.visualContainerObjects ?? {}
  if (!c.background || !c.border) errors.push(`${v.dir}: no explicit background and border objects`)
  else if (json.visual.visualType === DENEB_VISUAL_GUID) {
    const expected = denebContainerObjects(containerOf(v.template))
    for (const key of ['background', 'border', 'padding', 'title'])
      if (JSON.stringify(c[key]) !== JSON.stringify(expected[key])) errors.push(`${v.dir}: ${key} is not the ${containerOf(v.template)} container from ${v.template}.meta.json`)
  }
}

// Every JSON file parses.
const jsonFiles = written.filter((p) => /\.(json|pbir|pbism|pbip|platform)$/.test(p))
for (const p of jsonFiles) {
  try {
    JSON.parse(readFileSync(p, 'utf8'))
  } catch (e) {
    errors.push(`${p}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// Every visual sits in a page folder that pages.json lists, and every page folder is listed.
const pageDirs = readdirSync(`${REPORT_DIR}definition/pages`).filter((d) => statSync(`${REPORT_DIR}definition/pages/${d}`).isDirectory())
for (const d of pageDirs) if (!pageOrder.includes(d)) errors.push(`page folder ${d} is not in pages.json`)
for (const v of visualPages) {
  if (!pageOrder.includes(v.page)) errors.push(`${v.dir} references unknown page ${v.page}`)
  if (!existsSync(`${REPORT_DIR}definition/pages/${v.page}/page.json`)) errors.push(`${v.dir} has no page.json beside it`)
}

// Every field and filter resolves to a model column or measure.
const modelColumns = new Map(tables.map((t) => [t.name, new Set(t.columns.map((c) => c.name))]))
for (const { where, ref } of usedRefs) {
  const ok = ref.kind === 'measure' ? ref.entity === MEASURE_TABLE && measureNames.has(ref.property) : modelColumns.get(ref.entity)?.has(ref.property)
  if (!ok) errors.push(`${where}: ${queryRefOf(ref)} is not in the model`)
}

// TMDL tables list every CSV column.
for (const [table, cols] of csvColumns) {
  const tmdl = readFileSync(`${MODEL_DIR}definition/tables/${table}.tmdl`, 'utf8')
  for (const c of cols) if (!tmdl.includes(`\tcolumn ${tmdlName(c)}\n`)) errors.push(`${table}.tmdl is missing column ${c}`)
}
for (const { table, column } of CALCULATED_COLUMNS) {
  const tmdl = readFileSync(`${MODEL_DIR}definition/tables/${table}.tmdl`, 'utf8')
  if (!tmdl.includes(`\tcolumn ${tmdlName(column.name)} = ${column.expression}\n`)) errors.push(`${table}.tmdl is missing calculated column ${column.name}`)
}

// Action[DueDate] is a date column, typed date in Power Query, so the timeline reads a date rather than text.
const dueTmdl = readFileSync(`${MODEL_DIR}definition/tables/Action.tmdl`, 'utf8')
if (!/\tcolumn DueDate\n\t\tdataType: dateTime\n/.test(dueTmdl)) errors.push('Action.tmdl: DueDate is not dataType dateTime')
if (!dueTmdl.includes('{"DueDate", type date}')) errors.push('Action.tmdl: the Typed step does not type DueDate as date')

// Relationships join existing columns; one per table row in relationships.md.
for (const r of relationships)
  for (const [t, c] of [r.from, r.to]) if (!modelColumns.get(t)?.has(c)) errors.push(`relationship names missing column ${t}[${c}]`)
const documentedRelationships = (relationshipsText.match(/^\| \w+\[\w+\] \| \w+\[\w+\] \|/gm) ?? []).length
if (relationships.length !== documentedRelationships)
  errors.push(`expected ${documentedRelationships} relationships from relationships.md, found ${relationships.length}`)

// Measure count: every block in measures.dax, each once, and nothing else.
const measuresTmdl = readFileSync(`${MODEL_DIR}definition/tables/${MEASURE_TABLE}.tmdl`, 'utf8')
const tmdlMeasureCount = (measuresTmdl.match(/^\tmeasure /gm) ?? []).length
const daxHeaderCount = daxLines.filter((l) => HEADER.test(l) && !l.startsWith('VAR ')).length
if (daxMeasureCount !== daxHeaderCount) errors.push(`parsed ${daxMeasureCount} measures but measures.dax has ${daxHeaderCount}`)
if (tmdlMeasureCount !== daxHeaderCount)
  errors.push(`${MEASURE_TABLE}.tmdl has ${tmdlMeasureCount} measures, expected ${daxHeaderCount} from measures.dax`)
if (measureNames.size !== measures.length) errors.push('two measures in measures.dax share a name')

// shared.buildMeasures names exactly the Build measures section of measures.dax.
const listed = new Set(manifest.shared.buildMeasures)
for (const m of buildMeasures) if (!listed.has(m.name)) errors.push(`build measure ${m.name} is not in shared.buildMeasures`)
for (const n of listed) if (!buildMeasures.some((m) => m.name === n)) errors.push(`shared.buildMeasures names ${n}, which measures.dax does not have`)

// Build measures only read columns and measures the model has.
for (const m of buildMeasures)
  for (const ref of m.expression.matchAll(/(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))?\[([^\]]+)\]/g)) {
    if (ref[3].startsWith('@')) continue // a table variable's extension column, such as [@Composite]
    const table = ref[1] ?? ref[2]
    const ok = table ? modelColumns.get(table)?.has(ref[3]) : measureNames.has(ref[3])
    if (!ok) errors.push(`build measure ${m.name} reads unknown ${ref[0]}`)
  }

if (errors.length) {
  console.error(`PBIP failed validation:\n${errors.map((e) => `  ${e}`).join('\n')}`)
  process.exit(1)
}

const byType = [...visualCounts.entries()].sort().map(([t, n]) => `${t} ${n}`).join(', ')
console.log(`Wrote powerbi/pbip/${PROJECT}/${PROJECT}.pbip (${written.length} files)`)
console.log(`  pages          ${pageOrder.length}`)
console.log(`  visuals        ${visualTotal}: ${byType}`)
console.log(`  tables         ${tables.length + 1}: ${tableNames.join(', ')}`)
console.log(`  measures       ${measures.length} from measures.dax, ${buildMeasures.length} of them build measures`)
console.log(`  relationships  ${relationships.length}`)
console.log(`  checked        ${jsonFiles.length} JSON files parse; ${usedRefs.length} field and filter references resolve; every CSV column is in its table; every relationship joins existing columns`)
console.log(`  CsvFolder      ${csvFolder}${csvFolder === CSV_FOLDER ? ' (placeholder; see powerbi/README.md, Project file)' : ' (from powerbi/local.json)'}`)
console.log(`  Deneb GUID     ${DENEB_VISUAL_GUID} (unverified; see powerbi/README.md, Project file)`)
