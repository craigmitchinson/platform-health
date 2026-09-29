// Data model for the Platform Health dashboard mock. Every figure on every page
// is derived from these shapes, so the pages stay pure views over the fixtures.

export type LabId = 'payments' | 'customer' | 'data' | 'core'

export type TeamId =
  | 'automation'
  | 'agents'
  | 'observability'
  | 'onboarding'
  | 'digital'
  | 'contact'
  | 'warehouse'
  | 'analytics'
  | 'reporting'
  | 'policy'
  | 'portal'
  | 'claims'

export interface Lab {
  id: LabId
  name: string
  /** Two-character code shown on the lab chip. */
  code: string
  lead: string
}

export interface Team {
  id: TeamId
  name: string
  labId: LabId
  lead: string
}

export type SourceMode = 'sql' | 'semantic' | 'spreadsheet' | 'csv' | 'api'
export type Readiness = 'live' | 'partial' | 'aspirational'

export interface Source {
  system: string
  mode: SourceMode
  refresh: string
  owner: string
  readiness: Readiness
}

export type Aggregate = 'sum' | 'avg' | 'max'
/** Which way is good. */
export type Direction = 'lower' | 'higher'
export type Unit = 'count' | 'pct' | 'days' | 'gbp' | 'perMonth' | 'level'

export type MetricId =
  // stability
  | 'openSncs'
  | 'sncAge'
  | 'repeatSncs'
  // incidents
  | 'p1p2Incidents'
  | 'majorIncidents'
  | 'mttr'
  | 'repeatIncidents'
  | 'incidentBacklog'
  // problems
  | 'openProblems'
  | 'rcaOverdue'
  | 'knownErrors'
  | 'problemAge'
  | 'problemLinkage'
  // maturity
  | 'serviceMaturity'
  | 'triageMaturity'
  | 'incidentMaturity'
  | 'recoveryMaturity'
  | 'resolutionMaturity'
  | 'runbookCoverage'
  | 'mtta'
  // architecture
  | 'techDebt'
  | 'archExceptions'
  | 'strategicAlignment'
  // risk
  | 'brams'
  | 'techRisks'
  | 'riskTrend'
  // security
  | 'vulns'
  | 'patchCompliance'
  | 'criticalFindings'
  // resilience
  | 'drCompliance'
  | 'resilienceActions'
  | 'controlHealth'
  // change
  | 'failedChanges'
  | 'changeSuccess'
  | 'releases'
  | 'emergencyChanges'
  | 'changeLeadTime'
  // estate
  | 'applications'
  | 'infraFootprint'
  | 'currency'
  | 'cloudMigration'
  | 'endOfSupport'
  // governance
  | 'auditActions'
  | 'regActions'
  | 'overdueActions'
  // delivery
  | 'milestones'
  | 'roadmapHealth'
  | 'commitmentsAtRisk'
  // people
  | 'vacancies'
  | 'skillsRisks'
  | 'contractorDependency'
  // cost (proposed)
  | 'runCostVsBudget'
  | 'cloudSpendTrend'
  | 'orphanedSpend'
  // operability (proposed)
  | 'sloAttainment'
  | 'monitoringCoverage'
  | 'alertNoise'

export interface MetricDef {
  id: MetricId
  label: string
  short: string
  unit: Unit
  direction: Direction
  /** Per-team target; a team at or better than this scores 100. */
  target: number
  aggregate: Aggregate
  source: Source
  /** Set for context-only metrics that are shown but not scored. */
  note?: string
}

export type DomainId =
  | 'stability'
  | 'incidents'
  | 'problems'
  | 'maturity'
  | 'architecture'
  | 'risk'
  | 'security'
  | 'resilience'
  | 'change'
  | 'estate'
  | 'governance'
  | 'delivery'
  | 'people'
  | 'cost'
  | 'operability'

export type DomainGroup = 'operations' | 'risk' | 'architecture' | 'delivery'

export interface Domain {
  id: DomainId
  name: string
  group: DomainGroup
  kicker: string
  /** What this page answers. */
  question: string
  metrics: MetricDef[]
  /** Proposed domains are not yet sourced or agreed. */
  proposed?: boolean
}

export interface MetricSample {
  value: number
  /** Six quarterly points, the last equal to value. */
  trend: number[]
}

export type TeamMetrics = Record<TeamId, Record<MetricId, MetricSample>>

export interface Action {
  id: string
  domainId: DomainId
  teamId: TeamId
  text: string
  /** ISO date. */
  due: string
  severity: 'act' | 'watch'
}

export type HealthBand = 'healthy' | 'watch' | 'act'

/** When a source system last refreshed, for the page footers. */
export interface SourceRefresh {
  system: string
  /** A shorter name for the footer where the full one will not fit. */
  short?: string
  /** ISO timestamp, UTC, on the same clock as REFRESHED_ISO. */
  at: string
}

export type Role =
  | 'Platform lead'
  | 'Lab lead'
  | 'Team lead'
  | 'Product manager'
  | 'Architect'
  | 'Engineer'
  | 'Senior engineer'
  | 'SRE'
  | 'Data engineer'
  | 'QA engineer'
  | 'Analyst'
  | 'Delivery manager'

export type RoleGroup = 'Leadership' | 'Product and delivery' | 'Engineering' | 'SRE and operations' | 'Data' | 'QA'

export type Employment = 'permanent' | 'contractor'

export type SkillId =
  | 'kubernetes'
  | 'gcp'
  | 'terraform'
  | 'dynatrace'
  | 'servicenow'
  | 'kafka'
  | 'python'
  | 'java'
  | 'dotnet'
  | 'sql'
  | 'dataModelling'
  | 'bigquery'
  | 'security'
  | 'incidentCommand'
  | 'mainframe'
  | 'agentFrameworks'

export interface Skill {
  id: SkillId
  name: string
}

/** One synthetic person. Leaders are shown by role and lab, never by name. */
export interface Person {
  id: string
  role: Role
  /** 1 (entry) to 5 (most senior). */
  grade: 1 | 2 | 3 | 4 | 5
  /** Null for the platform lead only. */
  labId: LabId | null
  /** Null for the platform lead and the lab leads. */
  teamId: TeamId | null
  employment: Employment
  skills: SkillId[]
  /** 1 platform lead, 2 lab lead, 3 team lead, 0 everyone else. */
  leadLevel: 0 | 1 | 2 | 3
  /** The person this one reports to; null for the platform lead. */
  parentId: string | null
}

/** Estate-wide depth of a critical skill: one holder, two, or three and more. */
export type SkillFlag = 'single' | 'thin' | 'covered'
