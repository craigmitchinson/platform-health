// Compiles every Deneb spec with the shared config and its sample data, renders
// it to SVG, and fails on any compile or render error or Vega warning. Each spec
// is rendered again with its rows shuffled and its dates as JS Date objects, as
// Power BI delivers them, and fails if that draws anything differently. Then does
// the same for each template in deneb/templates/, with its placeholders mapped
// back to the sample field names.
//
// With --manifest-sizes it instead renders each spec at every size the layout
// manifest gives it: one SVG per (template, width, height) in preview/audit/,
// and beside it a JSON of the inline specs (sample rows for each page's
// filter, block params applied) for scripts/render-blocks.ts to draw in a browser.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as vega from 'vega'
import * as vl from 'vega-lite'

const DENEB = fileURLToPath(new URL('../deneb/', import.meta.url))
const SPECS = `${DENEB}specs/`
const SAMPLES = `${DENEB}samples/`
const TEMPLATES = `${DENEB}templates/`
const THEME = fileURLToPath(new URL('../theme/platform-health.theme.json', import.meta.url))
const PREVIEW = fileURLToPath(new URL('../preview/', import.meta.url))
const MANIFEST = fileURLToPath(new URL('../layout/manifest.json', import.meta.url))
const WIDTH = 800
const HEIGHT = 360
const SUFFIX = '.vl.json'

interface Meta {
  sample: string
  sampleFilter?: Record<string, string | number | boolean>
  /** Fields the spec reads when Power BI binds them and falls back on otherwise; they need not be in the sample. */
  optional?: string[]
  width?: number
  height?: number
}

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Parses JSON and checks it is an object carrying every expected key, else throws. */
function readJson<T extends Json>(path: string, keys: readonly (keyof T)[] = []): T {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isObject(parsed)) throw new Error(`${path} is not a JSON object`)
  for (const key of keys) {
    if (!(key in parsed)) throw new Error(`${path} is missing "${String(key)}"`)
  }
  return parsed as T
}

/** Parses JSON expected to be an array of objects, else throws. */
function readJsonArray(path: string): Json[] {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(parsed) || !parsed.every(isObject)) throw new Error(`${path} is not an array of objects`)
  return parsed
}

/**
 * Node stand-ins for the expression functions Deneb adds inside Power BI. Vega
 * rejects an unknown function when it parses a spec, so a spec cannot test for
 * them and must be given them here.
 * - pbiColor(index) returns the theme's dataColors entry (zero-based), and
 *   pbiColor(name) a named theme colour such as "foreground", so previews use
 *   the palette Power BI would supply with the Platform Health theme applied.
 * - pbiFormat(value, formatString) applies the Power BI format strings the
 *   specs use; any other string fails the render, so a new one gets a stub.
 * - pbiPatternSVG returns its foreground colour, as a plain fill.
 */
function registerDenebFunctions() {
  const theme = readJson<{ dataColors: string[] } & Json>(THEME, ['dataColors'])
  vega.expressionFunction('pbiColor', (key: number | string, shade = 0) => {
    const colour = typeof key === 'number' ? theme.dataColors[key % theme.dataColors.length] : theme[key]
    if (typeof colour !== 'string') throw new Error(`pbiColor stub has no theme colour ${String(key)}`)
    if (shade !== 0) throw new Error('pbiColor stub does not shade')
    return colour
  })
  const formats: Record<string, (v: number) => string> = {
    '0%': (v) => `${(v * 100).toFixed(0)}%`,
    '£#,0': (v) => `£${Math.round(v).toLocaleString('en-GB')}`,
  }
  vega.expressionFunction('pbiFormat', (value: number, formatString: string) => {
    const apply = formats[formatString]
    if (!apply) throw new Error(`pbiFormat stub has no rule for "${formatString}"`)
    return apply(value)
  })
  vega.expressionFunction('pbiPatternSVG', (_id: string, fg = 'transparent') => fg)
}

/** A logger for vega and vega-lite that records every warning and error. */
class Collector implements vega.LoggerInterface {
  private current = vega.Warn
  private readonly messages: string[]
  constructor(messages: string[]) {
    this.messages = messages
  }
  level(l: number): this
  level(): number
  level(l?: number): this | number {
    if (l === undefined) return this.current
    this.current = l
    return this
  }
  // Arrow properties, because vega calls these detached from the logger.
  error = (...args: readonly unknown[]) => {
    this.messages.push(`error: ${args.map(String).join(' ')}`)
    return this
  }
  warn = (...args: readonly unknown[]) => {
    this.messages.push(`warning: ${args.map(String).join(' ')}`)
    return this
  }
  info = () => this
  debug = () => this
}

/** Every field a transform creates: each "as", and a fold's default key and value. */
function createdFields(node: unknown, created = new Set<string>(), inTransform = false): Set<string> {
  if (Array.isArray(node)) {
    node.forEach((n) => createdFields(n, created, inTransform))
  } else if (isObject(node)) {
    for (const [k, v] of Object.entries(node)) {
      if (inTransform && k === 'as') [v].flat().forEach((f) => typeof f === 'string' && created.add(f))
      if (inTransform && k === 'fold' && !('as' in node)) ['key', 'value'].forEach((f) => created.add(f))
      createdFields(v, created, inTransform || k === 'transform')
    }
  }
  return created
}

/** Every `datum.name` reference in an expression string. */
function datumFields(expr: string): string[] {
  return [...expr.matchAll(/datum\.(\w+)/g)].map((m) => m[1])
}

/**
 * Every field the spec reads (each string "field" value, up to the first dot
 * of a nested path, and each `datum.name` in a calculate, filter, title or
 * text expression) that neither its data nor a transform supplies. A view
 * with inline `data.values` reads from those values instead of the sample.
 */
function missingFields(node: unknown, available: Set<string>, created: Set<string>, missing = new Set<string>()) {
  if (Array.isArray(node)) {
    node.forEach((n) => missingFields(n, available, created, missing))
  } else if (isObject(node)) {
    const inline = isObject(node.data) && Array.isArray(node.data.values) ? node.data.values : undefined
    const scope = inline ? new Set(inline.flatMap((r) => (isObject(r) ? Object.keys(r) : []))) : available
    for (const [k, v] of Object.entries(node)) {
      if (k === 'field' && typeof v === 'string') {
        const field = v.split('.')[0]
        if (!scope.has(field) && !created.has(field)) missing.add(field)
      }
      const exprs: string[] = []
      if ((k === 'calculate' || k === 'filter') && typeof v === 'string') exprs.push(v)
      if ((k === 'title' || k === 'text') && isObject(v) && typeof v.expr === 'string') exprs.push(v.expr)
      for (const expr of exprs) {
        for (const field of datumFields(expr)) {
          if (!scope.has(field) && !created.has(field)) missing.add(field)
        }
      }
      if (k !== 'data') missingFields(v, scope, created, missing)
    }
  }
  return missing
}

/** One scenegraph item reduced to what a reader sees: its text and colours, and its geometry. */
interface Drawn {
  key: string
  nums: number[]
}

/** The runtime scenegraph wraps its root item in a `root` field the vega typings omit. */
const hasRoot = (v: unknown): v is { root: unknown } => isObject(v) && 'root' in v

/**
 * Every drawn item in the scenegraph by mark name (or role, for axes and
 * legends). A line or area is one item carrying its points in drawing order;
 * any other mark gives one item per mark item.
 */
function drawnItems(node: unknown, out = new Map<string, Drawn[]>()) {
  if (!isObject(node) || !Array.isArray(node.items)) return out
  const name = String(node.name ?? node.role ?? node.marktype)
  const list = out.get(name) ?? []
  out.set(name, list)
  const geometry = (item: Json) =>
    ['x', 'y', 'x2', 'y2', 'width', 'height'].map((k) => (typeof item[k] === 'number' ? item[k] : 0))
  const items = node.items.filter(isObject)
  if (node.marktype === 'line' || node.marktype === 'area') {
    if (items.length) list.push({ key: `${String(items[0].stroke)} ${String(items[0].fill)}`, nums: items.flatMap(geometry) })
  } else if (node.marktype !== 'group') {
    for (const item of items) list.push({ key: `${String(item.text ?? '')} ${String(item.fill)} ${String(item.stroke)}`, nums: geometry(item) })
  }
  for (const item of items) (Array.isArray(item.items) ? item.items : []).forEach((child) => drawnItems(child, out))
  return out
}

async function render(
  spec: vl.TopLevelSpec,
  problems: string[],
  size?: { width: number; height: number },
  scene?: (drawn: Map<string, Drawn[]>) => void,
) {
  const compiled = vl.compile(spec, { logger: new Collector(problems) }).spec
  const view = new vega.View(vega.parse(compiled), {
    renderer: 'none',
    logger: new Collector(problems),
    logLevel: vega.Warn,
  })
  // The container signals initialise on the first run, so set the size after it.
  if (size) (await view.runAsync()).width(size.width).height(size.height)
  const svg = await view.toSVG()
  const graph = view.scenegraph()
  scene?.(drawnItems(hasRoot(graph) ? graph.root : graph))
  view.finalize()
  return svg
}

/** A seeded shuffle, so a simulation failure reproduces on every run. */
function shuffled<T>(rows: readonly T[], seed = 20260929): T[] {
  const out = [...rows]
  let state = seed
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const isDateField = (field: string) => field === 'due' || field === 'refreshDate' || field.endsWith('Date')

/**
 * The rows as Power BI hands them to Deneb: in no particular order, and with
 * date columns as JS Date objects at local midnight rather than ISO strings.
 */
function asPowerBi(rows: readonly Json[]): Json[] {
  const toDate = (v: unknown) => {
    if (typeof v !== 'string') return v
    const [y, m, d] = v.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return shuffled(rows).map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k, isDateField(k) ? toDate(v) : v])),
  )
}

/**
 * Differences between two renders of the same spec. Items are compared as
 * multisets per mark, so row order alone cannot fail a spec, but a label that
 * moves, a line that loses points or a mark that disappears does. Positions
 * may drift by a pixel or two, since a Power BI date sits at local midnight.
 */
function sceneDifferences(normal: Map<string, Drawn[]>, simulated: Map<string, Drawn[]>): string[] {
  const tolerance = 2
  const order = (a: Drawn, b: Drawn) =>
    a.key.localeCompare(b.key) || a.nums.length - b.nums.length || a.nums.reduce((c, n, i) => c || Math.round(n) - Math.round(b.nums[i]), 0)
  const out: string[] = []
  for (const name of new Set([...normal.keys(), ...simulated.keys()])) {
    const a = [...(normal.get(name) ?? [])].sort(order)
    const b = [...(simulated.get(name) ?? [])].sort(order)
    if (a.length !== b.length) {
      out.push(`mark ${name} draws ${b.length} items, not ${a.length}`)
      continue
    }
    const moved = a.findIndex(
      (item, i) =>
        item.key !== b[i].key ||
        item.nums.length !== b[i].nums.length ||
        item.nums.some((n, j) => Math.abs(n - b[i].nums[j]) > tolerance),
    )
    if (moved >= 0) out.push(`mark ${name} differs: ${JSON.stringify(a[moved])} became ${JSON.stringify(b[moved])}`)
  }
  return out
}

interface Sample {
  file: string
  rows: Json[]
  optional: string[]
  width: number
  height: number
}

/**
 * The rows a spec's .meta.json selects, each marked `__selected__: "neutral"`
 * as Deneb marks rows when cross-filtering is on and nothing is selected.
 */
function loadSample(name: string): Sample | string {
  const metaPath = `${SPECS}${name}.meta.json`
  if (!existsSync(metaPath)) return `missing ${name}.meta.json`
  const meta = readJson<Meta & Json>(metaPath, ['sample'])
  const filter = Object.entries(meta.sampleFilter ?? {})
  const rows = readJsonArray(`${SAMPLES}${meta.sample}`)
    .filter((r) => filter.every(([k, v]) => r[k] === v))
    .map((r) => ({ ...r, __selected__: 'neutral' }))
  if (!rows.length) return `sampleFilter matches no rows in ${meta.sample}`
  return { file: meta.sample, rows, optional: meta.optional ?? [], width: meta.width ?? WIDTH, height: meta.height ?? HEIGHT }
}

async function check(spec: vl.TopLevelSpec & Json, sample: Sample, config: vl.Config, preview?: string, simulate = false) {
  const problems: string[] = []
  const { rows, width, height } = sample
  if (!spec.data || !('name' in spec.data) || spec.data.name !== 'dataset')
    problems.push('top-level data must be { "name": "dataset" }')
  if (spec.config) problems.push('spec must not carry a config block; deneb/config.json is the config')

  const sampleFields = new Set(rows.flatMap((r) => Object.keys(r)))
  for (const field of missingFields(spec, sampleFields, createdFields(spec)))
    if (!sample.optional.includes(field)) problems.push(`field "${field}" is not in ${sample.file} and no transform creates it`)

  // Rows go in as a named dataset, so data('dataset') resolves as it does in Deneb.
  const base = { data: { name: 'dataset' }, datasets: { dataset: rows }, config }

  try {
    // The preview: the whole visual fitted to the meta size, padding included.
    const full: vl.TopLevelSpec = { ...spec, ...base, width, height, autosize: { type: 'fit', contains: 'padding' } }
    let normal = new Map<string, Drawn[]>()
    const svg = await render(full, problems, undefined, (d) => (normal = d))
    if (preview) writeFileSync(preview, svg)
    if (simulate) {
      // The same visual with the rows as Power BI delivers them.
      const simProblems: string[] = []
      let simulated = new Map<string, Drawn[]>()
      const pbi: vl.TopLevelSpec = { ...full, datasets: { dataset: asPowerBi(rows) } }
      await render(pbi, simProblems, undefined, (d) => (simulated = d))
      problems.push(...simProblems.map((p) => `Power BI simulation: ${p}`))
      problems.push(...sceneDifferences(normal, simulated).map((p) => `Power BI simulation: ${p}`))
    }
    // The spec's own container sizing, given the meta size through the view's
    // width and height signals as a Deneb container would.
    // Node has no window, so the resize listener behind container sizing cannot
    // bind; that one warning is expected here and is dropped.
    const contained: vl.TopLevelSpec = { ...spec, ...base }
    const containerProblems: string[] = []
    const containerSvg = await render(contained, containerProblems, { width, height })
    problems.push(...containerProblems.filter((p) => p !== 'warning: Can not resolve event source: window'))
    if (!containerSvg.slice(0, containerSvg.indexOf('>')).includes(` width="${width}"`))
      problems.push(`container render is not ${width} wide`)
  } catch (err) {
    problems.push(`error: ${err instanceof Error ? err.message : String(err)}`)
  }
  return problems
}

async function validate(name: string, config: vl.Config): Promise<string[]> {
  const sample = loadSample(name)
  if (typeof sample === 'string') return [sample]
  const spec = readJson<vl.TopLevelSpec & Json>(`${SPECS}${name}${SUFFIX}`)
  return check(spec, sample, config, `${PREVIEW}${name}.svg`, true)
}

/**
 * Maps a template's placeholders back to the field names in its dataset
 * block, which are the sample field names, and renders it with the template's
 * own config against the spec's sample rows.
 */
async function validateTemplate(name: string, config: vl.Config): Promise<string[]> {
  const path = `${TEMPLATES}${name}.deneb.json`
  if (!existsSync(path)) return [`missing templates/${name}.deneb.json; run npm run deneb:templates`]
  const sample = loadSample(name)
  if (typeof sample === 'string') return [sample]
  const { usermeta, ...template } = readJson<Json>(path, ['usermeta'])
  if (!isObject(usermeta) || !Array.isArray(usermeta.dataset) || typeof usermeta.config !== 'string')
    return ['usermeta must carry a dataset array and a config string']
  if (!isObject(usermeta.deneb) || usermeta.deneb.provider !== 'vegaLite') return ['usermeta.deneb.provider must be vegaLite']

  const problems: string[] = []
  let text = JSON.stringify(template)
  for (const entry of usermeta.dataset) {
    if (!isObject(entry) || typeof entry.key !== 'string' || typeof entry.name !== 'string') {
      problems.push('every dataset entry needs a key and a name')
      continue
    }
    if (!text.includes(entry.key)) problems.push(`placeholder ${entry.key} (${entry.name}) is never used`)
    text = text.split(entry.key).join(JSON.stringify(entry.name).slice(1, -1))
  }
  for (const key of new Set(text.match(/__\d+__/g))) problems.push(`placeholder ${key} is not mapped to a field`)

  const templateConfig: unknown = JSON.parse(usermeta.config)
  if (JSON.stringify(templateConfig) !== JSON.stringify(config))
    problems.push('usermeta.config differs from deneb/config.json; run npm run deneb:templates')
  if (problems.length) return problems
  return check(JSON.parse(text) as vl.TopLevelSpec & Json, sample, templateConfig as vl.Config)
}

interface AuditBlock {
  id: string
  kind: string
  visual?: string
  width: number
  height: number
  params?: Record<string, string | number>
}

/** The meta's sample filter for one page: a pageId, or a domainId the sample has rows for, becomes the page's id. */
function pageFilter(meta: Meta, rows: Json[], pageId: string): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(meta.sampleFilter ?? {}).map(([k, v]) =>
      k === 'pageId' || (k === 'domainId' && rows.some((r) => r[k] === pageId)) ? [k, pageId] : [k, v],
    ),
  )
}

/** The spec with block params set, as export-pbip sets them. */
function withParams(spec: Json, params: Record<string, string | number> = {}): Json {
  if (!Object.keys(params).length || !Array.isArray(spec.params)) return spec
  return { ...spec, params: spec.params.map((p: Json) => (String(p.name) in params ? { name: p.name, value: params[String(p.name)] } : p)) }
}

/**
 * Every deneb block in the manifest, grouped by template, size and params.
 * Each group gets the Node SVG of its first variant and a JSON of every
 * distinct page variant as an inline spec, for the browser render.
 */
async function auditManifestSizes(config: vl.Config): Promise<number> {
  const out = `${PREVIEW}audit/`
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const theme = readJson<Json>(THEME)
  const manifest = readJson<{ reports: { pages: { id: string; blocks: AuditBlock[] }[] }[] } & Json>(MANIFEST, ['reports'])
  const groups = new Map<string, { template: string; width: number; height: number; params?: AuditBlock['params']; variants: Map<string, { filter: Json; blocks: string[] }> }>()
  let blocks = 0
  for (const page of manifest.reports.flatMap((r) => r.pages)) {
    for (const b of page.blocks) {
      if (b.kind !== 'deneb' || !b.visual) continue
      blocks += 1
      const meta = readJson<Meta & Json>(`${SPECS}${b.visual}.meta.json`, ['sample'])
      const filter = pageFilter(meta, readJsonArray(`${SAMPLES}${meta.sample}`), page.id)
      const key = `${b.visual} ${b.width}x${b.height} ${JSON.stringify(b.params ?? {})}`
      const group = groups.get(key) ?? { template: b.visual, width: b.width, height: b.height, params: b.params, variants: new Map() }
      groups.set(key, group)
      const variant = group.variants.get(JSON.stringify(filter)) ?? { filter, blocks: [] }
      group.variants.set(JSON.stringify(filter), variant)
      variant.blocks.push(b.id)
    }
  }
  let failed = 0
  const names = new Set<string>()
  for (const g of groups.values()) {
    let name = `${g.template}-${g.width}x${g.height}`
    if (names.has(name)) name += `-${Object.values(g.params ?? {}).join('-')}`
    names.add(name)
    const spec = withParams(readJson<Json>(`${SPECS}${g.template}${SUFFIX}`), g.params)
    const sample = readJsonArray(`${SAMPLES}${readJson<Meta & Json>(`${SPECS}${g.template}.meta.json`, ['sample']).sample}`)
    const variants = [...g.variants.values()].map(({ filter, blocks: ids }) => {
      const rows = sample.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)).map((r) => ({ ...r, __selected__: 'neutral' }))
      return { label: ids.join(', '), filter, spec: { ...spec, data: { name: 'dataset' }, datasets: { dataset: rows }, config } }
    })
    const problems: string[] = []
    try {
      const svg = await render(variants[0].spec as unknown as vl.TopLevelSpec, problems, { width: g.width, height: g.height })
      writeFileSync(`${out}${name}.svg`, svg)
    } catch (err) {
      problems.push(`error: ${err instanceof Error ? err.message : String(err)}`)
    }
    writeFileSync(`${out}${name}.json`, JSON.stringify({ name, template: g.template, width: g.width, height: g.height, params: g.params ?? {}, theme, variants }))
    const real = problems.filter((p) => p !== 'warning: Can not resolve event source: window')
    report(`${name} (${variants.length} variant${variants.length === 1 ? '' : 's'})`, real, `powerbi/preview/audit/${name}.svg`)
    if (real.length) failed += 1
  }
  console.log(`${blocks} deneb blocks, ${groups.size} (template, size) combinations`)
  return failed
}

const config = readJson<vl.Config & Json>(`${DENEB}config.json`)
const names = readdirSync(SPECS)
  .filter((f) => f.endsWith(SUFFIX))
  .map((f) => f.slice(0, -SUFFIX.length))
  .sort()

registerDenebFunctions()
mkdirSync(PREVIEW, { recursive: true })
let failed = 0
const report = (label: string, problems: string[], done: string) => {
  if (problems.length) {
    failed += 1
    console.error(`FAIL ${label}`)
    problems.forEach((p) => console.error(`  ${p}`))
  } else {
    console.log(`ok   ${label} -> ${done}`)
  }
}
if (process.argv.includes('--manifest-sizes')) process.exit((await auditManifestSizes(config)) ? 1 : 0)
for (const name of names) {
  report(name, await validate(name, config), `powerbi/preview/${name}.svg`)
  report(`${name} template`, await validateTemplate(name, config), 'renders with fields mapped')
}
if (!names.length) console.error('No specs found in powerbi/deneb/specs.')
process.exit(failed || !names.length ? 1 : 0)
