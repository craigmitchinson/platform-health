import type { Domain, DomainGroup, DomainId, MetricDef, Source } from './types'

// Where each figure comes from. Readiness is the honest part of the mock: a
// "live" source can feed the report today, "partial" needs manual work, and
// "aspirational" has no feed yet.
const SRC = {
  serviceNow: { system: 'ServiceNow', mode: 'sql', refresh: 'Daily', owner: 'Service Management', readiness: 'live' },
  serviceNowCmdb: { system: 'ServiceNow', mode: 'sql', refresh: 'Daily', owner: 'Configuration Management', readiness: 'live' },
  serviceNowCmdbPartial: { system: 'ServiceNow', mode: 'sql', refresh: 'Daily', owner: 'Configuration Management', readiness: 'partial' },
  serviceNowKnowledge: { system: 'ServiceNow', mode: 'sql', refresh: 'Daily', owner: 'Service Management', readiness: 'partial' },
  dynatrace: { system: 'Dynatrace', mode: 'api', refresh: 'Real time', owner: 'Site Reliability', readiness: 'live' },
  dynatracePartial: { system: 'Dynatrace', mode: 'api', refresh: 'Real time', owner: 'Site Reliability', readiness: 'partial' },
  jira: { system: 'Jira', mode: 'api', refresh: 'Hourly', owner: 'Delivery Office', readiness: 'live' },
  archRegister: { system: 'Architecture register (SharePoint)', mode: 'spreadsheet', refresh: 'Weekly', owner: 'Enterprise Architecture', readiness: 'partial' },
  riskRegister: { system: 'Risk register (SharePoint)', mode: 'spreadsheet', refresh: 'Weekly', owner: 'Technology Risk', readiness: 'partial' },
  qualys: { system: 'Qualys / Tenable', mode: 'csv', refresh: 'Daily', owner: 'Cyber Security', readiness: 'live' },
  sccm: { system: 'Intune / SCCM', mode: 'sql', refresh: 'Daily', owner: 'End User and Hosting', readiness: 'live' },
  gcpBilling: { system: 'GCP Billing export (BigQuery)', mode: 'api', refresh: 'Daily', owner: 'FinOps', readiness: 'aspirational' },
  // Azure hosts VDIs and VMs only, so it covers that slice of run cost and nothing else.
  azureCost: { system: 'Azure Cost Management', mode: 'api', refresh: 'Daily', owner: 'FinOps', readiness: 'aspirational' },
  gcpAssets: { system: 'GCP asset inventory + CMDB', mode: 'api', refresh: 'Daily', owner: 'Cloud Platform', readiness: 'partial' },
  maturityAssessment: { system: 'Maturity self-assessment', mode: 'spreadsheet', refresh: 'Quarterly', owner: 'Service Management', readiness: 'partial' },
  workday: { system: 'Workday', mode: 'semantic', refresh: 'Weekly', owner: 'People Partners', readiness: 'partial' },
  skills: { system: 'Skills register', mode: 'spreadsheet', refresh: 'Quarterly', owner: 'People Partners', readiness: 'aspirational' },
  audit: { system: 'Audit and regulatory tracker', mode: 'spreadsheet', refresh: 'Monthly', owner: 'Internal Audit', readiness: 'partial' },
  drRegister: { system: 'DR register', mode: 'spreadsheet', refresh: 'Monthly', owner: 'Operational Resilience', readiness: 'partial' },
} satisfies Record<string, Source>

const CONTEXT = 'context, not scored'

/** Domains read in four groups, one per domain report. `short` labels the
 *  group where the full name will not fit (card tags, heat bands). */
export const DOMAIN_GROUPS: { id: DomainGroup; name: string; short: string }[] = [
  { id: 'operations', name: 'Operations', short: 'Operations' },
  { id: 'risk', name: 'Risk and control', short: 'Risk' },
  { id: 'architecture', name: 'Architecture and estate', short: 'Architecture' },
  { id: 'delivery', name: 'Delivery and people', short: 'Delivery' },
]

export const DOMAINS: Domain[] = [
  {
    id: 'stability',
    name: 'Stability',
    group: 'operations',
    kicker: 'Service stability',
    question: 'Are our services stable, and are we fixing causes rather than symptoms?',
    metrics: [
      { id: 'openSncs', label: 'Open SNCs', short: 'SNCs', unit: 'count', direction: 'lower', target: 6, aggregate: 'sum', source: SRC.serviceNow },
      { id: 'sncAge', label: 'Median SNC age', short: 'SNC age', unit: 'days', direction: 'lower', target: 14, aggregate: 'avg', source: SRC.serviceNow },
      { id: 'repeatSncs', label: 'Repeat SNCs', short: 'Repeats', unit: 'pct', direction: 'lower', target: 10, aggregate: 'avg', source: SRC.serviceNow },
    ],
  },
  {
    id: 'incidents',
    name: 'Incidents',
    group: 'operations',
    kicker: 'Incident management',
    question: 'Are incidents under control and shrinking?',
    metrics: [
      { id: 'p1p2Incidents', label: 'P1 and P2 incidents (90 days)', short: 'P1 and P2', unit: 'count', direction: 'lower', target: 6, aggregate: 'sum', source: SRC.serviceNow },
      { id: 'majorIncidents', label: 'Major incidents (90 days)', short: 'Major', unit: 'count', direction: 'lower', target: 1, aggregate: 'sum', source: SRC.serviceNow },
      { id: 'mttr', label: 'Mean time to restore (hours)', short: 'MTTR', unit: 'count', direction: 'lower', target: 4, aggregate: 'avg', source: SRC.dynatrace },
      { id: 'repeatIncidents', label: 'Repeat incidents', short: 'Repeats', unit: 'pct', direction: 'lower', target: 10, aggregate: 'avg', source: SRC.serviceNow },
      { id: 'incidentBacklog', label: 'Open incidents over 5 days', short: 'Over 5 days', unit: 'count', direction: 'lower', target: 5, aggregate: 'sum', source: SRC.serviceNow },
    ],
  },
  {
    id: 'problems',
    name: 'Problems',
    group: 'operations',
    kicker: 'Problem management',
    question: 'Are we removing causes, not just symptoms?',
    metrics: [
      { id: 'openProblems', label: 'Open problems', short: 'Open', unit: 'count', direction: 'lower', target: 8, aggregate: 'sum', source: SRC.serviceNow },
      { id: 'rcaOverdue', label: 'RCAs overdue', short: 'RCAs overdue', unit: 'count', direction: 'lower', target: 0, aggregate: 'sum', source: SRC.serviceNow },
      { id: 'knownErrors', label: 'Known error backlog', short: 'Known errors', unit: 'count', direction: 'lower', target: 10, aggregate: 'sum', source: SRC.serviceNow },
      { id: 'problemAge', label: 'Median problem age (days)', short: 'Age', unit: 'days', direction: 'lower', target: 30, aggregate: 'avg', source: SRC.serviceNow },
      { id: 'problemLinkage', label: 'Incidents linked to a problem', short: 'Linked', unit: 'pct', direction: 'higher', target: 80, aggregate: 'avg', source: SRC.serviceNow },
    ],
  },
  {
    id: 'change',
    name: 'Change',
    group: 'operations',
    kicker: 'Change and release',
    question: 'Can we change safely and often?',
    metrics: [
      { id: 'failedChanges', label: 'Failed changes (90 days)', short: 'Failed', unit: 'count', direction: 'lower', target: 2, aggregate: 'sum', source: SRC.serviceNow },
      { id: 'changeSuccess', label: 'Change success rate', short: 'Success', unit: 'pct', direction: 'higher', target: 95, aggregate: 'avg', source: SRC.serviceNow },
      { id: 'releases', label: 'Releases per month', short: 'Releases', unit: 'perMonth', direction: 'higher', target: 8, aggregate: 'sum', source: SRC.jira },
      { id: 'emergencyChanges', label: 'Emergency changes', short: 'Emergency', unit: 'pct', direction: 'lower', target: 5, aggregate: 'avg', source: SRC.serviceNow },
      { id: 'changeLeadTime', label: 'Change lead time (days)', short: 'Lead time', unit: 'days', direction: 'lower', target: 5, aggregate: 'avg', source: SRC.serviceNow },
    ],
  },
  {
    id: 'maturity',
    name: 'Maturity',
    group: 'operations',
    kicker: 'Maturity',
    question: 'How mature is each team’s incident and service management practice?',
    metrics: [
      { id: 'serviceMaturity', label: 'Overall maturity', short: 'Overall', unit: 'level', direction: 'higher', target: 4, aggregate: 'avg', source: SRC.maturityAssessment },
      { id: 'triageMaturity', label: 'Triage and on-call', short: 'Triage', unit: 'level', direction: 'higher', target: 4, aggregate: 'avg', source: SRC.maturityAssessment },
      { id: 'incidentMaturity', label: 'Incident management', short: 'Incident', unit: 'level', direction: 'higher', target: 4, aggregate: 'avg', source: SRC.maturityAssessment },
      { id: 'recoveryMaturity', label: 'Technical recovery', short: 'Recovery', unit: 'level', direction: 'higher', target: 4, aggregate: 'avg', source: SRC.maturityAssessment },
      { id: 'resolutionMaturity', label: 'Resolution and problem management', short: 'Resolution', unit: 'level', direction: 'higher', target: 4, aggregate: 'avg', source: SRC.maturityAssessment },
      { id: 'runbookCoverage', label: 'Runbook coverage', short: 'Runbooks', unit: 'pct', direction: 'higher', target: 90, aggregate: 'avg', source: SRC.serviceNowKnowledge },
      { id: 'mtta', label: 'Mean time to acknowledge (minutes)', short: 'MTTA', unit: 'count', direction: 'lower', target: 15, aggregate: 'avg', source: SRC.dynatrace },
    ],
  },
  {
    id: 'operability',
    name: 'Operability',
    group: 'operations',
    kicker: 'Observability and SLOs',
    question: 'Do we know our services are healthy before our customers tell us?',
    proposed: true,
    metrics: [
      { id: 'sloAttainment', label: 'SLO attainment', short: 'SLOs', unit: 'pct', direction: 'higher', target: 99, aggregate: 'avg', source: SRC.dynatracePartial },
      { id: 'monitoringCoverage', label: 'Monitoring coverage', short: 'Coverage', unit: 'pct', direction: 'higher', target: 90, aggregate: 'avg', source: SRC.dynatracePartial },
      { id: 'alertNoise', label: 'Actionable alerts', short: 'Actionable', unit: 'pct', direction: 'higher', target: 70, aggregate: 'avg', source: SRC.dynatracePartial },
    ],
  },
  {
    id: 'risk',
    name: 'Risk',
    group: 'risk',
    kicker: 'Technology risk',
    question: 'How much open technology risk do we hold, and is it rising?',
    metrics: [
      { id: 'brams', label: 'BRAMs open', short: 'BRAMs', unit: 'count', direction: 'lower', target: 2, aggregate: 'sum', source: SRC.riskRegister },
      { id: 'techRisks', label: 'Open tech risks', short: 'Tech risks', unit: 'count', direction: 'lower', target: 5, aggregate: 'sum', source: SRC.riskRegister },
      { id: 'riskTrend', label: 'Net new risks this quarter', short: 'Net new', unit: 'count', direction: 'lower', target: 0, aggregate: 'sum', source: SRC.riskRegister },
    ],
  },
  {
    id: 'security',
    name: 'Security',
    group: 'risk',
    kicker: 'Cyber security',
    question: 'Are we exposed, and are we closing exposure inside policy?',
    metrics: [
      { id: 'vulns', label: 'Critical and high vulnerabilities', short: 'Vulns', unit: 'count', direction: 'lower', target: 15, aggregate: 'sum', source: SRC.qualys },
      { id: 'patchCompliance', label: 'Patch compliance', short: 'Patching', unit: 'pct', direction: 'higher', target: 95, aggregate: 'avg', source: SRC.sccm },
      { id: 'criticalFindings', label: 'Critical findings overdue', short: 'Overdue', unit: 'count', direction: 'lower', target: 0, aggregate: 'sum', source: SRC.qualys },
    ],
  },
  {
    id: 'resilience',
    name: 'Resilience',
    group: 'risk',
    kicker: 'Operational resilience',
    question: 'Could we recover our important business services within tolerance?',
    metrics: [
      { id: 'drCompliance', label: 'DR compliance', short: 'DR', unit: 'pct', direction: 'higher', target: 90, aggregate: 'avg', source: SRC.drRegister },
      { id: 'resilienceActions', label: 'Resilience actions open', short: 'Actions', unit: 'count', direction: 'lower', target: 3, aggregate: 'sum', source: SRC.drRegister },
      { id: 'controlHealth', label: 'Control health', short: 'Controls', unit: 'pct', direction: 'higher', target: 90, aggregate: 'avg', source: SRC.riskRegister },
    ],
  },
  {
    id: 'governance',
    name: 'Governance',
    group: 'risk',
    kicker: 'Audit and regulation',
    question: 'Are we meeting our commitments to audit and the regulator?',
    metrics: [
      { id: 'auditActions', label: 'Audit actions open', short: 'Audit', unit: 'count', direction: 'lower', target: 2, aggregate: 'sum', source: SRC.audit },
      { id: 'regActions', label: 'Regulatory actions open', short: 'Regulatory', unit: 'count', direction: 'lower', target: 1, aggregate: 'sum', source: SRC.audit },
      { id: 'overdueActions', label: 'Overdue actions', short: 'Overdue', unit: 'count', direction: 'lower', target: 0, aggregate: 'sum', source: SRC.audit },
    ],
  },
  {
    id: 'architecture',
    name: 'Architecture',
    group: 'architecture',
    kicker: 'Architecture and debt',
    question: 'Is the estate converging on the target architecture, or drifting from it?',
    metrics: [
      { id: 'techDebt', label: 'Tech debt backlog (items)', short: 'Tech debt', unit: 'count', direction: 'lower', target: 25, aggregate: 'sum', source: SRC.jira },
      { id: 'archExceptions', label: 'Architecture exceptions open', short: 'Exceptions', unit: 'count', direction: 'lower', target: 2, aggregate: 'sum', source: SRC.archRegister },
      { id: 'strategicAlignment', label: 'Strategic alignment', short: 'Alignment', unit: 'pct', direction: 'higher', target: 80, aggregate: 'avg', source: SRC.archRegister },
    ],
  },
  {
    id: 'estate',
    name: 'Estate',
    group: 'architecture',
    kicker: 'Estate and currency',
    question: 'What do we run, and how current and cloud-ready is it?',
    metrics: [
      { id: 'applications', label: 'Applications', short: 'Apps', unit: 'count', direction: 'lower', target: 12, aggregate: 'sum', source: SRC.serviceNowCmdb, note: CONTEXT },
      { id: 'infraFootprint', label: 'Infra footprint (hosts)', short: 'Hosts', unit: 'count', direction: 'lower', target: 60, aggregate: 'sum', source: SRC.gcpAssets },
      { id: 'currency', label: 'Currency (in vendor support)', short: 'Currency', unit: 'pct', direction: 'higher', target: 90, aggregate: 'avg', source: SRC.serviceNowCmdb },
      { id: 'cloudMigration', label: 'Cloud migration', short: 'Cloud', unit: 'pct', direction: 'higher', target: 70, aggregate: 'avg', source: SRC.gcpAssets },
      { id: 'endOfSupport', label: 'End of support within 12 months', short: 'End of support', unit: 'count', direction: 'lower', target: 5, aggregate: 'sum', source: SRC.serviceNowCmdbPartial },
    ],
  },
  {
    id: 'cost',
    name: 'Cost',
    group: 'architecture',
    kicker: 'Cost and FinOps',
    question: 'Are we spending what we planned, and is any of it wasted?',
    proposed: true,
    metrics: [
      { id: 'runCostVsBudget', label: 'Run cost vs budget', short: 'Vs budget', unit: 'pct', direction: 'lower', target: 100, aggregate: 'avg', source: SRC.azureCost },
      { id: 'cloudSpendTrend', label: 'Cloud spend change', short: 'Cloud spend', unit: 'pct', direction: 'lower', target: 3, aggregate: 'avg', source: SRC.gcpBilling },
      { id: 'orphanedSpend', label: 'Orphaned spend', short: 'Orphaned', unit: 'gbp', direction: 'lower', target: 5000, aggregate: 'sum', source: SRC.gcpBilling },
    ],
  },
  {
    id: 'delivery',
    name: 'Delivery',
    group: 'delivery',
    kicker: 'Roadmap delivery',
    question: 'Will we deliver what we have committed to this quarter?',
    metrics: [
      { id: 'milestones', label: 'Key milestones due (90 days)', short: 'Milestones', unit: 'count', direction: 'lower', target: 6, aggregate: 'sum', source: SRC.jira, note: CONTEXT },
      { id: 'roadmapHealth', label: 'Roadmap health (on track)', short: 'On track', unit: 'pct', direction: 'higher', target: 85, aggregate: 'avg', source: SRC.jira },
      { id: 'commitmentsAtRisk', label: 'Commitments at risk', short: 'At risk', unit: 'count', direction: 'lower', target: 1, aggregate: 'sum', source: SRC.jira },
    ],
  },
  {
    id: 'people',
    name: 'People',
    group: 'delivery',
    kicker: 'People and skills',
    question: 'Do we have the people and skills to run and change the platform?',
    metrics: [
      { id: 'vacancies', label: 'Vacancies', short: 'Vacancies', unit: 'count', direction: 'lower', target: 1, aggregate: 'sum', source: SRC.workday },
      { id: 'skillsRisks', label: 'Critical skills risks', short: 'Skills', unit: 'count', direction: 'lower', target: 1, aggregate: 'sum', source: SRC.skills },
      { id: 'contractorDependency', label: 'Contractor dependency', short: 'Contractors', unit: 'pct', direction: 'lower', target: 20, aggregate: 'avg', source: SRC.workday },
    ],
  },
]

const DOMAIN_BY_ID = new Map(DOMAINS.map((d) => [d.id, d]))

export const domainById = (id: DomainId) => DOMAIN_BY_ID.get(id)

export const groupById = (id: DomainGroup) => DOMAIN_GROUPS.find((g) => g.id === id) ?? DOMAIN_GROUPS[0]

/** Each group with the number of the given domains in it, for colspan header rows. */
export const groupSpans = (domains: Domain[]) =>
  DOMAIN_GROUPS.map((g) => ({ ...g, span: domains.filter((d) => d.group === g.id).length })).filter((g) => g.span > 0)

/** The order metrics.ts seeds the fixtures in. It predates the grouped domain
 *  order and is kept so regrouping the domains does not change a single figure. */
const SEED_ORDER: DomainId[] = [
  'stability', 'incidents', 'problems', 'maturity', 'architecture', 'risk', 'security', 'resilience',
  'change', 'estate', 'governance', 'delivery', 'people', 'cost', 'operability',
]

export const ALL_METRICS: MetricDef[] = SEED_ORDER.flatMap((id) => DOMAIN_BY_ID.get(id)?.metrics ?? [])

/** How far past target a metric can drift before it scores zero. */
export function spanFor(def: MetricDef): number {
  if (def.unit === 'pct') return def.direction === 'lower' ? 20 : 30
  if (def.direction === 'higher') return def.target
  return Math.max(def.target * 2, 5)
}

/** The distinct source systems behind a set of domains, for page footers. */
export const systemsOf = (domains: Domain[]) =>
  Array.from(new Set(domains.flatMap((d) => d.metrics.map((m) => m.source.system))))
