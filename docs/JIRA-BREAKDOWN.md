# Delivery plan: stages, stories and tasks

## 0. How to read this

The plan delivers the Platform Health report in seven stages for two developers. Each stage is a boxed unit of value: it can be finished, checked and signed off on its own, and nothing in a later stage is needed for it to be useful. Sequencing rule: the earliest stages use data that is already queryable and answers the question executives ask first (are we stable, are we exposed); later stages add breadth.

Every stage lists:

- **Data points.** Each metric it brings live: where it comes from, where it lands in the star schema, the owner to ask, the likely access route, the effort to obtain it and the fallback. Effort is Low (the field exists; query only), Medium (a definition or derived field must be agreed) or High (a new process, or data another team must start keeping).
- **Pages unlocked.** The report pages that move from synthetic to real figures.
- **Stories.** Each opens with its goal, estimate in person-days, dependencies, done-when test and any fallback, then a table of tasks. Estimates are effort, not elapsed time; lead time for access or approvals is called out separately. Story ids carry their stage (1.3 is the third story of Stage 1); cross-cutting stories are X.1 to X.4 (section 8).
- **Exit checklist.** What must be true to box the stage off.
- **Value.** What the audience gains when the stage closes.

### What the team starts with

- The React mock in the repository is the design reference and the source the Power BI project is generated from; it is not a delivery item.
- The Power BI Project (PBIP) is generated: a TMDL semantic model and a PBIR report of twenty-one 1920 by 1080 pages, written by `npm run deneb:pbip` from the layout manifest. Edits made in Desktop are lost on the next regenerate, so fixes go into the generator script or the manifest.
- The model is a star schema of twelve CSV tables: Lab (4 rows), Team (12), Domain (15), Metric (57), Quarter (6, Q2 2025 to Q3 2026), MetricValue (the fact: one value per team, metric and quarter), Action (27), Config (one row), SourceRefresh (15 systems), and Person, Skill and PersonSkill for the Structure and skills page. All figures are synthetic.
- Every block on every page is a Deneb (Vega-Lite) visual. Deneb is a hard prerequisite.
- The validation scripts are the quality gate: `npm run deneb:validate`, `npm run deneb:templates`, `npm run deneb:layout` and `npm run deneb:pbip` (DAX lint, model and report consistency). The reference figures are in the manifest's `checks` block.

### Two rules that apply to every source

**Land every source in the MetricValue shape.** TeamKey, MetricKey, QuarterKey, Value: one row per team, metric and quarter. Each source query is appended to the sample rows, and the sample is filtered to exclude every MetricKey that has gone live. Lab, Team, Domain and Metric stay as maintained reference tables, so a metric's target, direction and aggregate change in one place.

**Readiness describes the report, not the source.** In the generated model, Metric[Readiness] says whether a source could feed the metric. From Stage 0 it says whether the report is fed: live means fed from its source by scheduled refresh; partial means a source exists but the report still shows sample or manual figures; aspirational means no source exists yet. The Lineage page, its headline and the domain source strips then tell the truth at every stage.

### Plan for two developers

Developer A owns the model and data; Developer B owns the report, the service and the governed lists. Only one person changes the SemanticModel folder at a time (0.3).

| Week | Developer A (model and data) | Developer B (report, service, lists) |
| --- | --- | --- |
| 1 | 0.1, 0.4, 0.5, then 1.1, 1.2, X.1 | 0.2, 0.3, 0.6, then 1.5, X.4 |
| 2 | 1.3, 1.4 | 1.6, 2.1, 2.2, X.3 |
| 3 | 2.4, 2.5, 1.8 | 1.7, 2.3, X.2, 2.6 |
| 4 | 3.1 | 3.4, 6.8 |
| 5 | 3.2, 3.3 | 3.4 finished, 4.1 |
| 6 | 4.2, 4.3 | 4.4, 6.1 |
| 7 | 4.5, 5.1 | 5.5, 6.2 |
| 8 | 5.2, 5.3 | 5.4, 6.2 finished |
| 9 | 5.6, 5.7 | 6.3, 6.5 |

## 1. Stage 0: Foundations (days 1 to 3)

Data points: none; the model runs on the synthetic CSVs. Pages unlocked: all twenty-one, on synthetic data.

### 0.1 Workspace, licensing and day-one requests
Goal: a workspace to publish to, licensing settled, and every request with lead time raised on day 1. Estimate: 0.5. Depends on: none. Done when: both developers can publish a blank report, and every request is logged with an owner and expected date.

| Task | Detail |
| --- | --- |
| T1 | Create the workspace, named for the dashboard. Add both developers as Members and the delivery lead as Viewer, through security groups. Create or request the app audience group. |
| T2 | Confirm licensing: Pro for every viewer, or a Premium Per User or Fabric capacity that lets free users view the app. Record the decision (X.4). |
| T3 | Raise every request with lead time: Deneb as an organisational visual (0.2), a gateway (1.6), ServiceNow read access (1.1), Intune, SCCM, scanner export and GCP asset inventory access (2.1), a Dynatrace token and a Jira service account (Stage 3). |

### 0.2 Deneb approval and Desktop setup
Goal: Deneb renders in Desktop and in the service for every author and viewer. Estimate: 0.5, plus approval lead time (often one to two weeks). Depends on: 0.1. Done when: a Deneb visual renders in the service for a Viewer account. Fallback: none that is cheap; rebuilding in native visuals costs several weeks and loses most of the design, so escalate a refusal on day 1 as the top delivery risk.

| Task | Detail |
| --- | --- |
| T1 | Check the tenant setting for AppSource visuals. If only organisational visuals are allowed, ask the Power BI administrator to add Deneb. |
| T2 | Install Deneb in Desktop on both machines. Turn on the PBIR preview (Options, Preview features, "Store reports using enhanced metadata format"). Install Fraunces, Inter and JetBrains Mono, or accept the fallbacks. |
| T3 | Publish a one-visual Deneb test report and open it in the service as a Viewer. |

### 0.3 Git repository for the PBIP and the working agreement
Goal: the project lives in git, nothing sensitive is committed, and two people can work without overwriting each other. Estimate: 1. Depends on: none. Done when: each developer has merged one change through a pull request, and `git status` is clean after opening and saving in Desktop.

| Task | Detail |
| --- | --- |
| T1 | Agree the branch model: a short-lived branch per story, a pull request into main, one reviewer. Keep the repository layout: project, model, Deneb specs and templates, generator scripts and manifest each in their own folder. |
| T2 | Extend `.gitignore` for Desktop's local files (`**/.pbi/localSettings.json`, `**/.pbi/cache.abf`). Never commit local folder paths, credentials, connection strings with secrets, or extracts from live sources; only the synthetic CSVs are committed. |
| T3 | Write the working agreement: one developer owns the SemanticModel folder at a time and says so in the team channel; the other works only in report folders. TMDL is one file per table and PBIR one file per visual, so merges are clean when owners do not overlap. |
| T4 | Before each pull request: close Desktop, run the validation gate (6.8), and commit regenerated files with the change that caused them. |

### 0.4 Open the generated project and check its settings
Goal: the PBIP opens and refreshes cleanly on both machines, looks like the design, and every assumption is confirmed or fixed in the generator. Estimate: 2. Depends on: 0.2. Done when: the project opens with no errors on both machines, all twenty-one pages draw, every page has been walked against the design reference once, and every fix is in the generator.

| Task | Detail |
| --- | --- |
| T1 | Clone, run `npm install`, create the git-ignored local settings file holding the CSV folder path, run `npm run deneb:pbip`, open the PBIP, check the `CsvFolder` parameter and Refresh. |
| T2 | Confirm the Deneb visual GUID against the generator's constant, and work through the "Untested assumptions" in the Power BI pack README. Fix each fault in the generator and regenerate. |
| T3 | Confirm the theme, page size 1920 by 1080, report filters on Lab and Team, the Period page filter defaulting to Last 6 quarters, the locked Domain and Page filters, canvas render mode and Advanced selection mode on the cross-filtering visuals. |
| T4 | Walk every page against the design reference at estate scope. Log each difference against the generator, the manifest or a measure. |

### 0.5 Load the CSV star schema and confirm the reference figures
Goal: the model produces the reference numbers, so any later difference is a data difference, not a DAX one. Estimate: 1. Depends on: 0.4. Done when: every figure in `checks` matches, and one lab and one team match the design reference on Overview, Labs and teams and one domain page.

| Task | Detail |
| --- | --- |
| T1 | Confirm column types against the model README, UTF-8 file origin, culture English (United Kingdom), Auto date/time off, the ten relationships, the sort-by columns and the five calculated columns. |
| T2 | With no Lab or Team filter and Last 6 quarters, confirm composite 74 (Watch), 13 core domains with 2 Healthy and 11 Watch, 3 teams needing action, and each domain score in `checks`. |
| T3 | Repeat for one lab and one team. Confirm the Actions page counts 27 open actions, not a multiplied figure. |

### 0.6 Honest baseline and a private app
Goal: stakeholders can see the whole report, and nothing on it claims to be real. Estimate: 0.5. Depends on: 0.5. Done when: a stakeholder opens the app, and the Lineage page reads 0 metrics live.

| Task | Detail |
| --- | --- |
| T1 | Apply the readiness rule: every metric partial, or aspirational where no source exists (skillsRisks, runCostVsBudget, cloudSpendTrend, orphanedSpend). Set every SourceRefresh LastRefresh to the synthetic export date, so footers read as a date, not "today 06:00". |
| T2 | Publish, create the app, and grant it to the delivery team and a few named stakeholders. Landing note: "All figures are synthetic. This app is for reacting to layout and questions." |

Exit checklist:
- Deneb renders in the service for a Viewer; the project opens and refreshes on both machines, with every fix in the generator.
- The reference figures match; both developers have merged a change through a pull request.
- The private app is published with the synthetic-data note, and every lead-time request is logged.

Value: the whole report is visible on synthetic data, so stakeholders react to its shape, questions and pages before real data arrives, when changes cost hours rather than weeks.

## 2. Stage 1: First live truth (weeks 1 to 2)

One source, ServiceNow, brings four operations domains live and answers "are we stable?" with real figures. Every row lands in MetricValue[Value] under the MetricKey shown. Field names are standard ServiceNow names; confirm them in 1.1. Access route for every row: a reporting replica through the gateway, or the Table API. Pages unlocked: Stability, Incidents, Problems and Change; Overview, Labs and teams, Actions and Movement show those four domains live and the rest marked partial.

| Data point | Lands in (MetricKey) | Source and fields | Owner | Effort | Fallback |
| --- | --- | --- | --- | --- | --- |
| Open SNCs | openSncs | SNC record (table to confirm): state, opened, closed, assignment group | Service Management | Low | Scheduled report export to SharePoint |
| Median SNC age | sncAge | SNC record: opened, closed | Service Management | Low | Export |
| Repeat SNCs | repeatSncs | SNC record: repeat flag, or same CI within an agreed window | Service Management | Medium | Sample, partial |
| P1 and P2 incidents (90 days) | p1p2Incidents | incident: priority, opened_at, assignment_group | Service Management | Low | Export |
| Major incidents (90 days) | majorIncidents | incident: major_incident_state, opened_at | Major incident manager | Low | Export |
| Open incidents over 5 days | incidentBacklog | incident: state, opened_at, resolved_at | Service Management | Low | Export |
| Repeat incidents | repeatIncidents | incident: cmdb_ci, parent_incident or problem_id within an agreed window | Service Management | Medium | Sample, partial |
| Mean time to restore | mttr | incident: opened_at, resolved_at for P1 and P2 | Service Management, Site Reliability | Low if held in ServiceNow | Deferred to Stage 3 (Dynatrace) |
| Open problems | openProblems | problem: state, opened_at, closed_at | Problem manager | Low | Export |
| RCAs overdue | rcaOverdue | problem: RCA due and completed dates (often custom fields) | Problem manager | Medium | Sample, partial |
| Known error backlog | knownErrors | problem: known_error flag, state | Problem manager | Low | Export |
| Median problem age | problemAge | problem: opened_at, closed_at | Problem manager | Low | Export |
| Incidents linked to a problem | problemLinkage | incident: problem_id, over P1 to P3 resolved in the quarter | Problem manager | Medium (agree the denominator) | Sample, partial |
| Failed changes (90 days) | failedChanges | change_request: close_code, closed_at | Change manager | Low | Export |
| Change success rate | changeSuccess | change_request: close_code | Change manager | Low | Export |
| Emergency changes | emergencyChanges | change_request: type | Change manager | Low | Export |
| Change lead time | changeLeadTime | change_request: created, approved or start date | Change manager | Medium (agree start and end) | Sample, partial |
| Releases per month | releases | rm_release, only if release management is used | Release manager | Medium | Sample until Jira (3.4) |

**The team mapping problem.** ServiceNow knows assignment groups, not the twelve teams. Groups are many to one with teams; some are shared, some sit outside scope, and some are renamed over time. The answer is one mapping table, TeamSourceMap (SourceSystem, SourceIdentifier, TeamKey, ValidFrom, ValidTo, Note), held as a SharePoint list owned by the Delivery Office (X.1). Each identifier maps to exactly one TeamKey at any date. A shared group is split at source or assigned to a primary team, and the choice goes in the decision log. Unmapped rows are counted by the data quality check (X.3), never dropped silently.

### 1.1 ServiceNow access and definitions
Goal: a read-only route into ServiceNow and agreed definitions for every metric above. Estimate: 1, plus access lead time. Depends on: 0.1. Done when: the account can query every record type, and each definition is written down. Fallback: if access has not arrived by the middle of week 2, scheduled report exports with the same fields into the SharePoint library; mapping and metric logic are unchanged.

| Task | Detail |
| --- | --- |
| T1 | Agree the route (reporting replica preferred) and obtain a read-only service account. No personal credentials in the model. |
| T2 | Confirm the record types and fields above against the instance, including the SNC table and any custom RCA fields. |
| T3 | Agree definitions with the service management owner: repeat, overdue RCA, failed and emergency change, lead time start and end, the linkage denominator, and whether MTTR comes from ServiceNow or Dynatrace. Record each (X.4). |

### 1.2 Assignment group mapping
Goal: every in-scope assignment group maps to one team. Estimate: 1. Depends on: 1.1, X.1. Done when: every group with records in the last six quarters is mapped or marked out of scope, and the lab leads agree the list.

| Task | Detail |
| --- | --- |
| T1 | List active assignment groups with a count of records in the last six quarters. |
| T2 | With each lab lead, assign groups to TeamKey. Mark out-of-scope groups explicitly. Load the rows into TeamSourceMap. |

### 1.3 Extract queries and staging view
Goal: one staging query per record type, filtered and mapped. Estimate: 2. Depends on: 1.1, 1.2. Done when: each staging query returns mapped rows for all six quarters, with row counts recorded.

| Task | Detail |
| --- | --- |
| T1 | Build staging queries for SNCs, incidents, problems and changes: only the fields needed, the last six quarters, plus older records still open at a quarter end. |
| T2 | Merge each with TeamSourceMap to add TeamKey. Route unmapped rows to a check query (X.3). |
| T3 | Push filters into a view or native query where the database allows, so the gateway moves as few rows as possible. |

### 1.4 Shape to MetricValue, load and reconcile
Goal: the sixteen ServiceNow metrics, plus MTTR and releases where ServiceNow holds them, come from ServiceNow. Estimate: 2.5. Depends on: 1.3, 1.5. Done when: the four domain pages show ServiceNow figures, three teams per domain reconcile to ServiceNow list views within an agreed tolerance, and other domains are unchanged. Fallback: if six quarters cannot be reconstructed, load the current quarter only, keep sample history with the metric partial, and start a quarterly snapshot so real history builds up.

| Task | Detail |
| --- | --- |
| T1 | Compute each metric per team and quarter. For open counts and ages, reconstruct the state at each quarter end from opened and closed dates; for 90-day counts, use the 90 days to quarter end. |
| T2 | Shape each result to TeamKey, MetricKey, QuarterKey, Value and append them into one ServiceNow query. |
| T3 | Make MetricValue the ServiceNow query appended to the sample rows, filtering the sample to exclude the live keys. |
| T4 | Reconcile three teams per domain for the current quarter with the owner. |

### 1.5 Reference tables and quarter calendar in SharePoint
Goal: the service refreshes reference tables without anyone's machine, and the quarters roll forward. Estimate: 1. Depends on: 0.5. Done when: a service refresh succeeds for every reference table with no gateway, and the 0.5 figure check still passes on sample domains.

| Task | Detail |
| --- | --- |
| T1 | Create a SharePoint library for reference data. Upload Lab, Team, Domain, Metric, Config and SourceRefresh, and the sample MetricValue, Action, Person, Skill and PersonSkill until their sources land. |
| T2 | Repoint each query to the SharePoint folder connector with the same columns and types. Update the generator to match, or record that these queries are now maintained in Desktop. |
| T3 | Generate Quarter from the refresh date: six quarters ending at the current one, IsCurrent on the latest. Shift the sample quarters so the latest sample quarter is the current one. Set Config[RefreshDate] from the refresh time. |

### 1.6 Gateway, scheduled refresh and failure alerts
Goal: the model refreshes every morning, and someone hears when it does not. Estimate: 1.5, plus gateway lead time. Depends on: 0.1, 1.1. Done when: three consecutive scheduled refreshes succeed, and a deliberately broken credential raises an alert. Fallback: without a gateway, use the export route so every source sits in SharePoint.

| Task | Detail |
| --- | --- |
| T1 | Install or reuse an on-premises data gateway, a cluster of two where possible. Add the ServiceNow source with the service account and bind the model. SharePoint sources need no gateway. |
| T2 | Schedule a daily refresh at 06:00 UK time. Send failure notifications to a shared mailbox or Teams channel. |

### 1.7 Page verification on live data
Goal: the live domain pages and the summary pages read correctly on real figures. Estimate: 1. Depends on: 1.4. Done when: every check is recorded and each defect is fixed or accepted by the delivery lead.

| Task | Detail |
| --- | --- |
| T1 | Check Stability, Incidents, Problems and Change at estate, one lab and one team, for Last 2, 4 and 6 quarters, including blanks where a team has no records. |
| T2 | Check headlines and read-outs follow the narrative rules on the new figures, and that Overview, Labs and teams and Movement mix live and sample domains as expected. |
| T3 | Log each difference against the generator, the manifest, a measure or a source query. |

### 1.8 Readiness flags and footer
Goal: the footer and the Lineage page tell the truth about ServiceNow. Estimate: 0.5. Depends on: 1.4, X.2. Done when: Lineage shows exactly the reconciled metrics as live, and the ServiceNow footer entry changes after a refresh.

| Task | Detail |
| --- | --- |
| T1 | Set Readiness to live for each reconciled ServiceNow metric; leave any on sample as partial. |
| T2 | Feed the ServiceNow row of SourceRefresh from the latest record timestamp (X.2), and check the footer on the four domain pages. |

Exit checklist:
- Every in-scope assignment group is mapped, and the ServiceNow metrics reconcile for three teams per domain.
- Three consecutive scheduled refreshes have succeeded, and alerting has been tested.
- Readiness and the ServiceNow footer entry are accurate.

Value: leadership sees real stability, incident, problem and change figures per team and quarter, from the system of record, every morning.

## 3. Stage 2: Exposure (weeks 2 to 3)

Security and estate basics answer "are we exposed?". This stage closes the MVP. Pages unlocked: Security and Estate; the Overview now carries six live domains.

| Data point | Lands in (MetricKey) | Source and fields | Owner | Access route | Effort | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| Patch compliance | patchCompliance | SCCM update compliance views; Intune device compliance | End User and Hosting | SCCM reporting database through the gateway; Intune through Graph or its data warehouse | Medium | Monthly compliance export |
| Critical and high vulnerabilities | vulns | Qualys or Tenable: asset tag, severity, status, first found | Cyber Security | Scheduled CSV drop to SharePoint | Low | Weekly manual export |
| Critical findings overdue | criticalFindings | The same export with SLA due date | Cyber Security | As above | Medium | Due date from first found and the SLA policy |
| Applications | applications (context, not scored) | CMDB business application or service: support group | Configuration Management | ServiceNow route from Stage 1 | Low | CMDB export |
| Infra footprint (hosts) | infraFootprint | CMDB server classes merged with GCP asset inventory instances | Configuration Management, Hosting and Cloud | ServiceNow route; GCP inventory BigQuery export | Medium | CMDB hosts only |
| Currency (in vendor support) | currency | CMDB: product model, vendor support end date | Configuration Management | ServiceNow route | Medium | Sample, partial |
| End of support within 12 months | endOfSupport | The same date field | Configuration Management | ServiceNow route | High (date completeness) | Partial, with a count of gaps |
| Cloud migration | cloudMigration | GCP asset inventory against CMDB hosts, by owning service | Hosting and Cloud | BigQuery connector | Medium | Programme tracker spreadsheet |

### 2.1 Exposure access and asset-to-team mapping
Goal: access to each exposure source and one route from device, asset or host to team. Estimate: 1, plus access lead time. Depends on: 0.1, X.1. Done when: each source can be queried or has a file landing, and mapping rows exist for each.

| Task | Detail |
| --- | --- |
| T1 | Chase the day-one requests: SCCM reporting database, Intune data, the scanner export, CMDB classes and GCP asset inventory. |
| T2 | Agree the join to team (CMDB owning service or support group for devices and hosts, asset tag or group for the scanner, project label `team` for GCP) and add the identifiers to TeamSourceMap. |

### 2.2 Patch compliance from Intune and SCCM
Goal: patchCompliance comes from the endpoint tools. Estimate: 1.5. Depends on: 2.1. Done when: three teams match the endpoint team's own report.

| Task | Detail |
| --- | --- |
| T1 | Compute compliance per team at each quarter end: devices compliant with the current baseline over devices in scope, without double-counting co-managed devices. |
| T2 | Append, remove from sample, set Readiness live, feed SourceRefresh. |

### 2.3 Vulnerabilities from the scanner CSV drop
Goal: vulns and criticalFindings come from the scanner. Estimate: 1.5. Depends on: 2.1. Done when: estate counts match the scanner dashboard for the same day.

| Task | Detail |
| --- | --- |
| T1 | Agree a daily export of open critical and high findings with asset tag, first found and SLA due date, dropped into the SharePoint library. |
| T2 | Compute findings and overdue criticals per team at quarter end. Keep a snapshot per quarter end, as the export holds only today's state. |
| T3 | Append, remove from sample, set Readiness live, feed SourceRefresh from the file date. |

### 2.4 CMDB applications, hosts, currency and end of support
Goal: the Estate page counts real applications and hosts and shows vendor support. Estimate: 1.5. Depends on: 1.4, 2.1. Done when: application and host counts for three teams match CMDB list views.

| Task | Detail |
| --- | --- |
| T1 | Extend the ServiceNow queries to CMDB application and server classes. Agree the vendor support date field and count the gaps. |
| T2 | Compute applications, infraFootprint (CMDB part), currency and endOfSupport per team. Leave endOfSupport partial until gaps fall below a threshold the owner agrees. |

### 2.5 Cloud migration and infra footprint from GCP inventory
Goal: cloudMigration and the GCP part of infraFootprint come from the asset inventory. Estimate: 1.5. Depends on: 2.1, 2.4. Done when: host totals reconcile to the GCP console and the CMDB within an agreed tolerance.

| Task | Detail |
| --- | --- |
| T1 | Connect to the asset inventory BigQuery export with the Google BigQuery connector and a service account. |
| T2 | Merge with CMDB hosts on host name, report unmatched hosts in X.3, and compute cloud share per team at quarter end. |

### 2.6 Publish the MVP app and sign it off
Goal: the audience reaches the dashboard through an app in reading order, and the delivery lead signs the MVP exit checklist. Estimate: 1.5. Depends on: 1.7, 2.2 to 2.5, X.2, X.3. Done when: a Viewer in the audience group moves through every page and filters by lab and team, and the checklist is signed with the known gaps attached.

| Task | Detail |
| --- | --- |
| T1 | Publish, and order the app: Executive summary, Operations, Risk and control, Architecture and estate, Delivery and people, Data and sources. Label "Operability (Proposed)" and "Cost (Proposed)". Hide page tabs; keep the filter pane. |
| T2 | Hide the Structure and skills page until Stage 5: synthetic people read as real ones. |
| T3 | Replace the landing note with a "what is live" note naming the six live domains. Grant access to the audience group. |
| T4 | Walk the MVP exit checklist with the delivery lead. |

MVP exit checklist. The exit falls at the end of week 3, or early in week 4 once the Stage 2 sources have a full week of refresh. If lead times slip, 2.5 moves to week 4 and cloudMigration stays partial; the exit does not wait for it.

| Check | Pass when |
| --- | --- |
| Six live domains | Stability, Incidents, Problems, Change, Security and Estate show source figures; any metric still on sample is partial and named in the gaps list |
| Refresh proven for a week | Seven consecutive scheduled refreshes have succeeded, and a failure alert has been tested |
| App published with navigation | A Viewer outside the workspace reaches every page from the navigation pane |
| Per-source refresh footer accurate | Each live source's entry changes after a refresh; sample sources read as their export date |
| Readiness lineage accurate | The Lineage page shows live exactly for the reconciled metrics |
| Figures | Live metrics pass their reconciliations; sample domains still match the reference figures |
| Filters | Lab, Team and Period change every page |
| Data quality | Every load passes its row count, key join and range checks (X.3) |
| Source control | Main regenerates the project, and the validation gate passes |

Value: the MVP. Leadership sees whether the platform is stable and whether it is exposed, per team, refreshed daily, with an honest statement of what is still sample.

## 4. Stage 3: Signals from engineering (weeks 4 to 5)

Pages unlocked: Operability (still proposed), Maturity partially (MTTA and runbook coverage; the maturity levels arrive in Stage 5), Delivery fully, Architecture partially (tech debt), and the releases tile on Change.

| Data point | Lands in (MetricKey) | Source and fields | Owner | Access route | Effort | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| Mean time to acknowledge | mtta | Dynatrace problems: open and acknowledge times | Site Reliability | Dynatrace API, read token | Low | Scheduled Dynatrace report export |
| Mean time to restore | mttr (unless taken from ServiceNow in 1.1) | Dynatrace problems: open and close times | Site Reliability | As above | Low | ServiceNow figure |
| SLO attainment | sloAttainment | Dynatrace SLOs | Site Reliability | As above | Medium (not every service has SLOs) | Partial, teams with SLOs only |
| Monitoring coverage | monitoringCoverage | Monitored hosts over CMDB hosts | Site Reliability | Dynatrace API plus CMDB from 2.4 | Medium | Partial |
| Actionable alerts | alertNoise | Alerts that led to a problem or incident, over all alerts | Site Reliability | Dynatrace API | Medium | Partial |
| Runbook coverage | runbookCoverage | ServiceNow knowledge articles linked to services | Service Management | ServiceNow route | Medium | Partial |
| Key milestones due (90 days) | milestones (context) | Jira: milestone issue type, due date | Delivery Office | Jira REST API or connector, service token | Medium | Delivery Office spreadsheet |
| Roadmap health | roadmapHealth | Jira: milestone status or on-track field | Delivery Office | As above | Medium | As above |
| Commitments at risk | commitmentsAtRisk | Jira: at-risk flag or status | Delivery Office | As above | Medium | As above |
| Tech debt backlog | techDebt | Jira: tech debt label or issue type, open | Delivery Office | As above | Low once the label is agreed | Saved filter export |
| Releases per month | releases | Jira: fix versions released | Delivery Office | As above | Low | Sample, partial |

### 3.1 Dynatrace access, MTTR and MTTA
Goal: mtta, and mttr where Dynatrace owns it, come from Dynatrace. Estimate: 3, plus token lead time. Depends on: 0.1, X.1. Done when: MTTA is live for all twelve teams and agrees with Dynatrace for two teams.

| Task | Detail |
| --- | --- |
| T1 | Create an API token with read scopes for problems, SLOs and entities. Map management zone or the `team` tag to TeamKey in TeamSourceMap. |
| T2 | Compute MTTA and MTTR per team and quarter from problem open, acknowledge and close times. Apply the MTTR ownership decision from 1.1; never load it from both sources. |
| T3 | Append, remove from sample, set Readiness live, feed SourceRefresh. |

### 3.2 SLOs, monitoring coverage and alert noise
Goal: the Operability metrics load for the teams that have them. Estimate: 2. Depends on: 3.1, 2.4. Done when: the Operability page shows real figures for the teams covered, and the gaps are listed by team.

| Task | Detail |
| --- | --- |
| T1 | Load SLO attainment, monitoring coverage and actionable alerts per team and quarter; leave them partial while any team lacks them. |
| T2 | Agree with the service owner when Operability is complete enough to score (5.7). |

### 3.3 Runbook coverage from ServiceNow knowledge
Goal: runbookCoverage comes from the knowledge base. Estimate: 1. Depends on: 1.4, 2.4. Done when: three teams match a knowledge base report.

| Task | Detail |
| --- | --- |
| T1 | Agree with Service Management what counts as a runbook and how it links to a service. |
| T2 | Compute services with a current runbook over services in scope, per team. Keep it partial until the linkage is agreed as complete. |

### 3.4 Jira conventions, delivery metrics, tech debt and releases
Goal: the Delivery page and the tech debt and releases tiles come from Jira. Estimate: 4.5. Depends on: 0.1, X.1. Done when: the conventions are written down, and tech debt and at-risk counts for two teams match a saved Jira filter. Fallback: if conventions differ across teams, load techDebt and releases only and keep the roadmap metrics partial.

| Task | Detail |
| --- | --- |
| T1 | Agree conventions with the Delivery Office: the tech debt label or type, what a release is, the milestone issue type, and how on track and at risk are recorded. |
| T2 | Obtain a service account and token. Map project or component to TeamKey in TeamSourceMap. |
| T3 | Query through the Jira REST API or connector, paging and requesting only the fields needed. Compute milestones, roadmapHealth, commitmentsAtRisk, techDebt and releases per team and quarter. |
| T4 | Append, remove from sample, set Readiness live, feed SourceRefresh. |

Exit checklist:
- Dynatrace and Jira refresh daily with alerting, and readiness and the footer are accurate for both.
- MTTA, tech debt, releases and the three Delivery metrics reconcile and are live.
- The Operability and runbook gaps are listed by team.

Value: the report moves from outcomes to causes: how fast teams respond, whether they can see their services, and whether commitments and tech debt are under control.

## 5. Stage 4: Registers and controls (weeks 5 to 7)

Access route for every row: the SharePoint Online list connector (implementation 2.0). Pages unlocked: Risk, Resilience, Governance and Architecture fully, and the Actions page on real actions.

| Data point | Lands in | Source and fields | Owner | Effort | Fallback |
| --- | --- | --- | --- | --- | --- |
| BRAMs open | brams | Risk register: type, status, team, opened | Technology Risk | Medium | Excel extract with the same columns |
| Open tech risks | techRisks | Risk register: status, team | Technology Risk | Medium | As above |
| Net new risks this quarter | riskTrend | Risk register: opened, closed | Technology Risk | Medium | As above |
| Control health | controlHealth | Risk register or control library: tested, effective | Technology Risk | High | Partial |
| Architecture exceptions open | archExceptions | Architecture register: status, team, expiry | Enterprise Architecture | Medium | Excel extract |
| Strategic alignment | strategicAlignment | Architecture register: alignment rating per application | Enterprise Architecture | High (needs a rating) | Partial |
| DR compliance | drCompliance | DR register: service, last test, result | Operational Resilience | Medium | Partial |
| Resilience actions open | resilienceActions | DR register: actions, status | Operational Resilience | Medium | As above |
| Audit actions open | auditActions | Audit tracker: type, status, team | Internal Audit | Medium | Owner's workbook |
| Regulatory actions open | regActions | Audit tracker: regulatory flag | Internal Audit | Medium | As above |
| Overdue actions | overdueActions | Audit tracker: due date, status | Internal Audit | Low once the list exists | As above |
| Open actions | Action table (ActionKey, TeamKey, DomainKey, DueDate, Severity) | Open items from all four registers | Each register owner | Medium | Sample actions for unconnected domains |

### 4.1 Spreadsheets into governed lists
Goal: each register is a SharePoint list with an owner, fixed columns and a monthly review, so the report reads a system rather than a file. Estimate: 2. Depends on: X.1. Done when: four lists exist with owners, migrated rows and a review date. Fallback: where an owner will not move to a list, a fixed Excel table layout with data validation on the keys.

| Task | Detail |
| --- | --- |
| T1 | For each register, agree the owner, columns and choice values. Every list carries a Team lookup holding TeamKey, a date or quarter, a status and a due date. |
| T2 | Create the lists, migrate the current rows, turn on version history, and restrict edit rights to the owning team. |
| T3 | Put a monthly review in each owner's calendar: close stale items and confirm team assignment. |

### 4.2 Risk register
Goal: brams, techRisks, riskTrend and controlHealth come from the register. Estimate: 2. Depends on: 4.1. Done when: the Risk page shows register figures and the owner agrees the counts.

| Task | Detail |
| --- | --- |
| T1 | Compute counts per team at quarter end; net new risks as opened less closed in the quarter; control health as effective over tested controls. |
| T2 | Append, remove from sample, set Readiness, feed SourceRefresh from the list's last modified time. |

### 4.3 Architecture register
Goal: archExceptions and strategicAlignment come from the register. Estimate: 1.5. Depends on: 4.1, 2.4. Done when: the Architecture page shows register figures and Enterprise Architecture agrees them.

| Task | Detail |
| --- | --- |
| T1 | Compute open exceptions per team, and alignment as aligned applications over rated applications. Leave alignment partial until every application has a rating. |
| T2 | Append, remove from sample, set Readiness, feed SourceRefresh. |

### 4.4 DR register and audit tracker
Goal: drCompliance, resilienceActions, auditActions, regActions and overdueActions come from their owners' lists. Estimate: 3. Depends on: 4.1. Done when: the Resilience and Governance pages match the owners' own summaries.

| Task | Detail |
| --- | --- |
| T1 | Compute DR compliance as services tested within policy over services in scope, and open resilience actions, per team. |
| T2 | Count open audit and regulatory actions, and overdue actions, per team at quarter end. Agree with Internal Audit which fields may be shown; restricted findings stay out of the model. |
| T3 | Append, remove from sample, set Readiness, feed SourceRefresh. |

### 4.5 Actions from the registers
Goal: the Action table holds real open items. Estimate: 2. Depends on: 4.2 to 4.4. Done when: the Actions page and timeline match the lists.

| Task | Detail |
| --- | --- |
| T1 | Decide with each owner which items become actions, and map severity to the report's scale. |
| T2 | Build Action as the union of the four lists, keeping ActionKey, TeamKey, DomainKey, DueDate and Severity. Keep sample actions only for domains with no source. |
| T3 | Check the Actions count equals open items in the lists, with no multiplication. |

Exit checklist:
- Four governed lists with owners and a monthly review.
- Risk, Resilience, Governance and Architecture show register figures agreed by their owners, and the Actions page shows real open actions.
- Readiness and the footer are accurate; a list untouched for a month reads as a date.

Value: risk, control and resilience sit beside operations, and every open action has an owner, a team and a due date.

## 6. Stage 5: People and cost (weeks 7 to 9)

Pages unlocked: People, Structure and skills, Maturity fully, and Cost (still proposed until 5.7). Aspirational today: the skills register, GCP billing and Azure cost. Azure hosts only VDI and VMs, so it covers that slice of run cost and nothing more.

| Data point | Lands in | Source and fields | Owner | Access route | Effort | Cheapest credible proxy |
| --- | --- | --- | --- | --- | --- | --- |
| Vacancies | vacancies | Workday: open positions by supervisory organisation | People Partners | Existing Workday semantic model, or a scheduled aggregate extract | Medium, plus HR lead time | Monthly aggregate spreadsheet from People Partners |
| Contractor dependency | contractorDependency | Workday: worker type by organisation | People Partners | As above | Medium | As above |
| Headcount and structure | Person table (Role, RoleGroup, Grade, Employment, IsLead, ParentKey) | Workday: worker, role, grade, manager | People Partners | Aggregate extract; HR approval needed | High (privacy) | Page stays hidden |
| Critical skills risks | skillsRisks; Skill and PersonSkill tables | Skills register (aspirational: none exists) | People Partners, lab leads | Microsoft Form into a SharePoint list | High (new process) | One-off survey of critical skill cover per team |
| Maturity levels | triageMaturity, incidentMaturity, recoveryMaturity, resolutionMaturity; serviceMaturity as their mean | Quarterly self-assessment | Service Management | Form into a SharePoint list | Medium | Service management owner fills a workbook |
| Cloud spend change | cloudSpendTrend | GCP billing export (aspirational) | FinOps | BigQuery connector | Medium | Monthly FinOps spreadsheet by project |
| Orphaned spend | orphanedSpend | GCP billing: untagged or idle resources | FinOps | As above | High | Untagged spend only |
| Run cost against budget | runCostVsBudget | Azure Cost Management for VDI and VMs (aspirational), GCP billing, a finance budget table | FinOps, Finance | Azure Cost Management connector; budget as a SharePoint file | High | Monthly cost analysis export and the annual budget workbook |

### 5.1 Privacy decision and Workday access
Goal: HR agrees what people data may be shown and how. Estimate: 1, plus HR lead time. Depends on: X.1. Done when: the privacy decision is written and signed by HR.

| Task | Detail |
| --- | --- |
| T1 | Ask HR analytics for an existing Workday semantic model or an aggregate extract: counts per supervisory organisation, not person rows. Map cost centre or supervisory organisation to TeamKey. |
| T2 | For Structure and skills, agree whether person-level rows are allowed, or only leads named and everyone else aggregated. Decide whether row-level security is needed (6.4). |

### 5.2 Vacancies and contractor dependency
Goal: the People page shows real vacancies and contractor share. Estimate: 1.5. Depends on: 5.1. Done when: two teams match People Partners' figures.

| Task | Detail |
| --- | --- |
| T1 | Compute vacancies and contractor share per team at quarter end. |
| T2 | Append, remove from sample, set Readiness, feed SourceRefresh. |

### 5.3 Person table for the structure page
Goal: Structure and skills shows the real organisation, within the privacy decision. Estimate: 2. Depends on: 5.1. Done when: HR has approved the page and it is visible in the app.

| Task | Detail |
| --- | --- |
| T1 | Build Person from the Workday extract in the existing shape; derive LeadLevel and ParentKey from the management chain. Aggregate or mask as 5.1 agreed. |
| T2 | Unhide the page in the app once HR has reviewed it. |

### 5.4 Skills register
Goal: a skills register exists and feeds skillsRisks, Skill and PersonSkill. Estimate: 2.5. Depends on: 5.1. Done when: one quarter's responses show on the People and Structure and skills pages.

| Task | Detail |
| --- | --- |
| T1 | Agree the critical skills list with the lab leads. Build a form and list: team, skill, cover level, critical flag, and person where 5.1 allows. |
| T2 | Load Skill and PersonSkill; count skillsRisks as critical skills with cover below the agreed level. |
| T3 | Put a quarterly refresh in the lab leads' calendar. |

### 5.5 Maturity self-assessment
Goal: the four capability levels come from a quarterly form. Estimate: 2. Depends on: 4.1. Done when: one quarter's responses show on the Maturity page and the maturity ladder.

| Task | Detail |
| --- | --- |
| T1 | Build a form: one response per team per quarter, a level from 1 to 5 per capability, and evidence notes. Land responses in a list. |
| T2 | Map to the four maturity keys; compute serviceMaturity as their mean, never assessed on its own. Agree who moderates scores before publication. |

### 5.6 Cost: GCP billing, Azure cost and the budget table
Goal: the Cost domain gets real spend change, orphaned spend and run cost against budget. Estimate: 4. Depends on: 2.5. Done when: spend per team reconciles to the billing consoles within an agreed tolerance, and Finance agrees the budget table.

| Task | Detail |
| --- | --- |
| T1 | Confirm the GCP billing export to BigQuery is on and projects carry a `team` label. Compute quarter-on-quarter spend change and orphaned spend per team. |
| T2 | Connect Azure Cost Management for the VDI and VM subscriptions; map subscription or resource group tag to TeamKey. |
| T3 | Load the annual budget per team from Finance as a governed file, and compute run cost against budget. |
| T4 | Append, remove from sample, set Readiness, feed SourceRefresh. |

### 5.7 Promoting a proposed domain
Goal: a written rule for when Operability and Cost stop being proposed. Estimate: 1 per promotion. Depends on: 3.2, 5.6. Done when: the rule is written down and has been applied or deliberately deferred.

| Task | Detail |
| --- | --- |
| T1 | Agree the rule: a domain becomes core when all its scored metrics are live for every team for one full quarter. |
| T2 | To promote, set Domain[IsCore] to true, update the core domain lists and `domainOrder` params in the heat matrix and lab sparkline grid, and regenerate. Announce the composite change a month ahead. |

Exit checklist:
- HR has signed the privacy decision and approved both people pages.
- People, Structure and skills and Maturity show real data.
- Cost shows real spend for at least GCP, or its proxy is named on the landing note; the promotion rule is written.

Value: the report covers the whole platform: who runs it, what it costs, and how mature its operating practice is.

## 7. Stage 6: Make it excellent (ongoing)

No new data points. Pull 6.1 forward if the two developers collide on the report before week 6. Value: the report becomes fast, navigable, accessible and safe to change, and its readiness stays honest.

### 6.1 Split into one report per model group
Goal: six thin reports over one shared model, so two people edit different reports at once. Estimate: 3. Depends on: 0.3, 0.4. Done when: six reports open against one model with figures unchanged, and the app lists them in order. Move a group to its own model only when a source's size or refresh window demands it (ServiceNow is the likely first), keeping measure names identical so no visual changes.

| Task | Detail |
| --- | --- |
| T1 | Extend the generator to write six report folders from its report registry: Executive summary, Operations, Risk and control, Architecture and estate, Delivery and people, Data and sources. |
| T2 | Point each report at the one SemanticModel locally; after publishing, rebind each to the published model. Keep Lab and Team report filters in each. |
| T3 | Rerun the 0.5 figure check and update the app navigation to six reports. |

| Option | For | Against |
| --- | --- | --- |
| One shared model, six thin reports (recommended) | One refresh, one set of measures; report work never collides | One person changes the model at a time; Lab and Team filters do not persist between reports |
| A model per report group | Each source refreshes, fails and is secured on its own | Measures duplicated and drifting; the composite still needs every domain |
| Keep one report | Nothing to build | Two people cannot safely edit at once |

### 6.2 Cross-filtering, drill-through and tooltips
Goal: readers reach any domain or team in two clicks, and every mark explains itself. Estimate: 4.5. Depends on: 6.1. Done when: any domain and any team are two clicks from the Overview, and ten visuals' tooltips each name value, unit and band.

| Task | Detail |
| --- | --- |
| T1 | Confirm the cross-filtering Deneb visuals filter their page in the service. |
| T2 | Add drill-through from the Overview domain cards and heat matrix to domain pages, and a team drill-through page from the bar list, team matrix and movement table. Where Deneb drill-through fails, use navigation buttons. |
| T3 | Check tooltips show formatted values and band words; add metric definition and source to KPI tile tooltips. |

### 6.3 Performance tuning
Goal: every page renders in under three seconds in the service. Estimate: 2. Depends on: 1.4. Done when: every page is under three seconds on a cold load, with the Performance Analyzer log attached.

| Task | Detail |
| --- | --- |
| T1 | Run Performance Analyzer on each page; record DAX and visual time. |
| T2 | Trim measures: remove unused build measures, replace repeated CALCULATE chains with variables, and check the shifted Q1 to Q5 measures, which run five times per row. |
| T3 | Keep canvas render mode; use SVG only where export crispness matters. Check no Deneb visual receives more rows than it draws. |

### 6.4 Row-level security, if needed
Goal: apply the 5.1 decision. Estimate: 2. Depends on: 5.1, 6.1. Done when: each role is tested with two users, or the decision not to apply is recorded.

| Task | Detail |
| --- | --- |
| T1 | The default is none; people data is the likely exception. If needed, add a role filtering Team through a UserTeam table and test with View as role. Lineage stays estate-wide. |

### 6.5 Accessibility check
Goal: the report meets the accessibility rules the design follows. Estimate: 2. Depends on: 0.4. Done when: results are recorded per page and failures fixed or logged.

| Task | Detail |
| --- | --- |
| T1 | Set alt text on every Deneb visual and a logical tab order on every page. |
| T2 | Confirm no state is colour-only: band words beside band colours; better, worse or held beside movement. |
| T3 | Test keyboard and Narrator on the Overview, one domain page and Lineage; check muted text contrast. |

### 6.6 New Deneb visuals
Goal: use the spare templates and add views that answer a real question. Estimate: 1 per spare template, 2 per new visual (budget 6). Depends on: 0.3. Done when: each visual passes validation and is placed through the manifest, not by hand.

| Task | Detail |
| --- | --- |
| T1 | Place the spare templates where the design shows them (metric heat on domain pages, lab sparkline grid, lab legend), and work through the layout audit's ranked findings: squeezed blocks, empty regions, ellipsised or overflowing text. |
| T2 | Candidates: a risk likelihood by impact grid, vulnerability ageing bands, an SLO burn-down, an incident calendar heat, spend by team. Add each with a meta file and sample, and pass validation. |

### 6.7 Monthly readiness review
Goal: readiness on the Lineage page stays honest. Estimate: 0.5 per month. Depends on: 2.6. Done when: the first review is held and its changes merged.

| Task | Detail |
| --- | --- |
| T1 | Monthly, the delivery lead and one developer review every metric's Readiness, Owner and Refresh. Move a metric to live only after a clean month; back to partial if its feed breaks for more than a week. |
| T2 | Chase owners of partial and aspirational metrics. |

### 6.8 Change process gated by validation
Goal: every change to a spec, template, measure or layout goes through git with the validation scripts as the gate. Estimate: 1.5. Depends on: 0.3. Done when: one deliberately broken measure has been caught by the gate.

| Task | Detail |
| --- | --- |
| T1 | Write the gate: `npm run deneb:validate`, `npm run deneb:templates`, `npm run deneb:layout`, `npm run deneb:pbip` and `npm run build` pass before merge. Run it in CI if available, otherwise locally with the result in the pull request. |
| T2 | Keep the DAX rules the lint enforces: quote every table reference, underscore every variable, never clear a whole dimension table, return blank rather than 0. Publish from main only. |

## 8. Cross-cutting stories

These run alongside every stage. Each source story adds its own rows or checks; the estimates here cover the shared work.

### X.1 Team mapping table
Goal: one place that turns any source identifier into a TeamKey. This is the single most important artefact in the plan: every figure per team depends on it. Estimate: 1 (0.5 in week 1). Depends on: 0.1. Done when: the list exists, feeds the model, and has an owner and review date.

| Task | Detail |
| --- | --- |
| T1 | Create TeamSourceMap as a SharePoint list (SourceSystem, SourceIdentifier, TeamKey, ValidFrom, ValidTo, Note), owned by the Delivery Office. One TeamKey per identifier at any date; reorganisations use ValidFrom and ValidTo rather than overwriting. |
| T2 | Load it into the model and merge it into every source query. |
| T3 | Review it quarterly with the lab leads, driven by the unmapped counts in X.3. |

### X.2 SourceRefresh and refresh monitoring
Goal: the footer's per-source line is true, and failures are seen before readers notice. The footer's right-hand text, [Page Sources Refreshed], lists the systems behind the page's metrics, most recent first, as "today 06:00", "yesterday 18:00" or a date against Config[RefreshDate]; it reads SourceRefresh (System, Short, LastRefresh, Cadence) matched to Metric[SourceSystem]. Estimate: 2.5 (1.5 before the MVP exit). Depends on: 1.6. Done when: every live source's entry changes after a refresh, a month-old list reads as a date, and the runbook has been tested once.

| Task | Detail |
| --- | --- |
| T1 | For each live source, compute LastRefresh from the latest record timestamp (preferred) or the refresh time; for lists and files, the last modified time; for sample sources, the export date. |
| T2 | Build SourceRefresh as the union, with System values identical to Metric[SourceSystem]. Check the footer on the Overview and a single-source domain page. |
| T3 | Review refresh history weekly and note slowing sources. Consider a worded marker when a source is older than its cadence. |
| T4 | Write a runbook naming who to contact per source when its refresh fails, and walk one simulated failure through it. |

### X.3 Data quality checks per load
Goal: every load is checked the way the repository's model export checks itself: rows join, and figures are in range. Estimate: 2 (1 before the MVP exit). Depends on: 1.3. Done when: a deliberately unmapped group and a deliberately out-of-range value are both caught.

| Task | Detail |
| --- | --- |
| T1 | Add a check query per source: row count against the previous refresh, unmapped identifiers, and rows whose TeamKey, MetricKey or QuarterKey does not join. |
| T2 | Add range checks per metric: percentages 0 to 100, counts not negative, ages plausible. |
| T3 | Surface results on a hidden page or a small checks report. Agree who looks after each refresh, and what failure pulls a metric back to partial. |

### X.4 Decision log and refresh schedules
Goal: every definition, mapping choice and schedule is recorded once. With one shared model every source refreshes together; the schedule table governs once a group has its own model. Estimate: 0.5. Depends on: none. Done when: the log exists with the Stage 0 decisions in it.

| Task | Detail |
| --- | --- |
| T1 | Start a decision log in the repository: date, decision, owner, reason. |
| T2 | Record the schedule per source below, and revisit it when a group moves to its own model (6.1). |

| Source | Proposed cadence | Why |
| --- | --- | --- |
| ServiceNow (with CMDB and knowledge) | Daily 06:00 | Operational; changes daily |
| Intune and SCCM, GCP asset inventory | Daily | Moves daily |
| Qualys or Tenable | Daily, after the drop lands | Bounded by the export |
| Dynatrace | Daily 06:00; hourly only if needed | Pages read quarters |
| Jira | Daily 07:00 | Hourly adds load without changing a quarterly score |
| Registers, trackers and forms | Daily | Cheap; the footer shows real age |
| Workday | Weekly | Sensitive and slow-moving |
| GCP billing, Azure Cost Management | Daily | Billing lands daily |

## 9. Summary

| Stage | Weeks | Data sources | Pages unlocked | Person-days |
| --- | --- | --- | --- | --- |
| 0 Foundations | Days 1 to 3 | Synthetic CSVs | All twenty-one, synthetic | 5.5 |
| 1 First live truth | 1 to 2 | ServiceNow | Stability, Incidents, Problems, Change; Overview partly live | 10.5 |
| 2 Exposure (MVP exit) | 2 to 3 | Intune, SCCM, Qualys or Tenable, CMDB, GCP asset inventory | Security, Estate | 8.5 |
| 3 Signals from engineering | 4 to 5 | Dynatrace, Jira, ServiceNow knowledge | Operability, Delivery; Maturity and Architecture partly | 10.5 |
| 4 Registers and controls | 5 to 7 | Risk, architecture, DR and audit registers | Risk, Resilience, Governance, Architecture, Actions | 10.5 |
| 5 People and cost | 7 to 9 | Workday, skills register, maturity form, GCP billing, Azure cost | People, Structure and skills, Maturity, Cost | 14 |
| 6 Make it excellent | Ongoing | None | None new | 21, plus 0.5 per month |
| Cross-cutting | Throughout | All | None | 6 |
| Total | | | | 86.5 |

The MVP (Stages 0 to 2 plus 3.5 days of cross-cutting work) is 28 person-days against 30 available in three weeks. The buffer is thin; access lead time is the main risk, and every source story carries a fallback.

| Id | Title | Stage | Estimate (days) | Depends on |
| --- | --- | --- | --- | --- |
| 0.1 | Workspace, licensing and day-one requests | 0 | 0.5 | none |
| 0.2 | Deneb approval and Desktop setup | 0 | 0.5 | 0.1 |
| 0.3 | Git repository for the PBIP and the working agreement | 0 | 1 | none |
| 0.4 | Open the generated project and check its settings | 0 | 2 | 0.2 |
| 0.5 | Load the CSV star schema and confirm the reference figures | 0 | 1 | 0.4 |
| 0.6 | Honest baseline and a private app | 0 | 0.5 | 0.5 |
| 1.1 | ServiceNow access and definitions | 1 | 1 | 0.1 |
| 1.2 | Assignment group mapping | 1 | 1 | 1.1, X.1 |
| 1.3 | Extract queries and staging view | 1 | 2 | 1.1, 1.2 |
| 1.4 | Shape to MetricValue, load and reconcile | 1 | 2.5 | 1.3, 1.5 |
| 1.5 | Reference tables and quarter calendar in SharePoint | 1 | 1 | 0.5 |
| 1.6 | Gateway, scheduled refresh and failure alerts | 1 | 1.5 | 0.1, 1.1 |
| 1.7 | Page verification on live data | 1 | 1 | 1.4 |
| 1.8 | Readiness flags and footer | 1 | 0.5 | 1.4, X.2 |
| 2.1 | Exposure access and asset-to-team mapping | 2 | 1 | 0.1, X.1 |
| 2.2 | Patch compliance from Intune and SCCM | 2 | 1.5 | 2.1 |
| 2.3 | Vulnerabilities from the scanner CSV drop | 2 | 1.5 | 2.1 |
| 2.4 | CMDB applications, hosts, currency and end of support | 2 | 1.5 | 1.4, 2.1 |
| 2.5 | Cloud migration and infra footprint from GCP inventory | 2 | 1.5 | 2.1, 2.4 |
| 2.6 | Publish the MVP app and sign it off | 2 | 1.5 | 1.7, 2.2 to 2.5, X.2, X.3 |
| 3.1 | Dynatrace access, MTTR and MTTA | 3 | 3 | 0.1, X.1 |
| 3.2 | SLOs, monitoring coverage and alert noise | 3 | 2 | 3.1, 2.4 |
| 3.3 | Runbook coverage from ServiceNow knowledge | 3 | 1 | 1.4, 2.4 |
| 3.4 | Jira conventions, delivery metrics, tech debt and releases | 3 | 4.5 | 0.1, X.1 |
| 4.1 | Spreadsheets into governed lists | 4 | 2 | X.1 |
| 4.2 | Risk register | 4 | 2 | 4.1 |
| 4.3 | Architecture register | 4 | 1.5 | 4.1, 2.4 |
| 4.4 | DR register and audit tracker | 4 | 3 | 4.1 |
| 4.5 | Actions from the registers | 4 | 2 | 4.2 to 4.4 |
| 5.1 | Privacy decision and Workday access | 5 | 1 | X.1 |
| 5.2 | Vacancies and contractor dependency | 5 | 1.5 | 5.1 |
| 5.3 | Person table for the structure page | 5 | 2 | 5.1 |
| 5.4 | Skills register | 5 | 2.5 | 5.1 |
| 5.5 | Maturity self-assessment | 5 | 2 | 4.1 |
| 5.6 | Cost: GCP billing, Azure cost and the budget table | 5 | 4 | 2.5 |
| 5.7 | Promoting a proposed domain | 5 | 1 per promotion | 3.2, 5.6 |
| 6.1 | Split into one report per model group | 6 | 3 | 0.3, 0.4 |
| 6.2 | Cross-filtering, drill-through and tooltips | 6 | 4.5 | 6.1 |
| 6.3 | Performance tuning | 6 | 2 | 1.4 |
| 6.4 | Row-level security, if needed | 6 | 2 | 5.1, 6.1 |
| 6.5 | Accessibility check | 6 | 2 | 0.4 |
| 6.6 | New Deneb visuals | 6 | 6 (1 to 2 each) | 0.3 |
| 6.7 | Monthly readiness review | 6 | 0.5 per month | 2.6 |
| 6.8 | Change process gated by validation | 6 | 1.5 | 0.3 |
| X.1 | Team mapping table | Cross-cutting | 1 | 0.1 |
| X.2 | SourceRefresh and refresh monitoring | Cross-cutting | 2.5 | 1.6 |
| X.3 | Data quality checks per load | Cross-cutting | 2 | 1.3 |
| X.4 | Decision log and refresh schedules | Cross-cutting | 0.5 | none |
