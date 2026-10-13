# Incident data: extract, calculations and scoring

The detailed definitions behind the Incidents domain. [JIRA-BREAKDOWN.md](JIRA-BREAKDOWN.md) Stage 1 says which ServiceNow fields feed each metric and when; this document says exactly what to request, how each figure is calculated, and how it becomes a score, so the developer building the extract and the people reading the page work from the same rules. It is the record story 1.1 T3 asks for on the incident side; decisions taken against section 5 go in the X.4 decision log.

## 1. What the Incidents page shows

The page answers one question: are incidents under control and shrinking? Five metrics per team, each with a target in [src/data/domains.ts](../src/data/domains.ts). A team at or better than target scores 100.

| Metric | MetricKey | Target per team | Good direction | Window |
| --- | --- | --- | --- | --- |
| P1 and P2 incidents | p1p2Incidents | 6 | Lower | 90 days to quarter end |
| Major incidents | majorIncidents | 1 | Lower | 90 days to quarter end |
| Mean time to restore (hours) | mttr | 4 | Lower | P1 and P2 resolved in the 90 days to quarter end |
| Repeat incidents (% of incidents) | repeatIncidents | 10% | Lower | 90 days to quarter end |
| Open incidents over 5 days | incidentBacklog | 5 | Lower | State at quarter end |

Each metric lands in MetricValue as one row per TeamKey and QuarterKey, for the six quarters in the Quarter table. The current quarter's row is calculated as at the latest refresh.

## 2. The extract

Everything comes from one ServiceNow table, `incident`, joined to TeamSourceMap. No other table is needed for this page.

### 2.1 Fields to request

| Field | Used for | Notes |
| --- | --- | --- |
| `sys_id` | Unique key | Upsert on this. |
| `number` | Reconciliation and drill-through | INC number. |
| `priority` | P1 and P2 filter | Values 1 to 5. Pull `impact` and `urgency` too, so priority overrides can be spotted. |
| `state` | Open and closed logic, exclusions | Default values: 1 New, 2 In Progress, 3 On Hold, 6 Resolved, 7 Closed, 8 Cancelled. Confirm against our instance (1.1 T2). |
| `opened_at` | Windows, age, MTTR start | UTC. |
| `resolved_at` | MTTR end, backlog reconstruction | UTC. Blank while open. Resolved is when service was restored; closed is administrative. |
| `closed_at` | Reconciliation only | |
| `sys_updated_on` | Incremental pulls | UTC. |
| `assignment_group` | Team attribution (current plan) | Who worked the incident. See decision 1. |
| `cmdb_ci` | Repeat logic; team attribution if decision 1 goes that way | The configuration item affected. |
| `business_service`, `service_offering` | Attribution fallback when `cmdb_ci` is blank | |
| `category`, `subcategory` | Repeat logic, if tightened | |
| `parent_incident` | Exclude child incidents | A child is counted through its parent, so one outage is counted once. |
| `problem_id` | problemLinkage on the Problems page | Not used here; pulling it now saves a second extract. |
| `major_incident_state` | majorIncidents | Present if Major Incident Management is enabled. If majors are flagged another way (a custom field or tag), use that field. |
| `reopen_count` | Data quality | Reopened incidents distort backlog reconstruction. |
| Impact start and end, if held (`u_*`) | Better MTTR | See decision 3. |

Do not request `caller_id`, `short_description`, `description`, `comments` or `work_notes`. They hold personal data, no calculation uses them, and leaving them out keeps the extract consistent with the no-personal-data rule in the README.

### 2.2 Calling the Table API

Where the reporting replica is not available (1.1 T1), use the Table API with the read-only service account:

```
GET https://<instance>.service-now.com/api/now/table/incident
  ?sysparm_query=<encoded query>
  &sysparm_fields=sys_id,number,priority,impact,urgency,state,opened_at,resolved_at,closed_at,
                  sys_updated_on,assignment_group,cmdb_ci,business_service,service_offering,
                  category,subcategory,parent_incident,problem_id,major_incident_state,reopen_count
  &sysparm_display_value=all
  &sysparm_exclude_reference_link=true
  &sysparm_limit=1000
  &sysparm_offset=0
```

`sysparm_display_value=all` returns each reference as both a sys_id and a display name. Join on the sys_id; show the name. Page in steps of 1,000 until a page returns fewer rows than the limit.

**First load.** Six quarters of a 90-day window reach back about 19 months from today, plus anything still open:

```
opened_at>=<first day of the earliest quarter, minus 90 days>^ORstateIN1,2,3^ORDERBYsys_updated_on
```

**Daily load (06:00, per X.4).** Only what changed since the last successful run, upserted on `sys_id`:

```
sys_updated_on>=<last run time>^ORDERBYsys_updated_on
```

### 2.3 Team attribution

Each incident gets a TeamKey through TeamSourceMap (1.2, X.1), with SourceSystem `ServiceNow` and SourceIdentifier the sys_id of whichever field decision 1 settles on. Incidents with no mapping go to the X.3 check query, never dropped. The unmapped share is the first figure to look at after each load: if it rises, every team figure is understated.

## 3. Calculations

Three exclusions apply to every metric: state Cancelled (8); incidents with a `parent_incident` (counted through the parent); and test or duplicate records, identified by close code once agreed. "Quarter end" below means the last day of the quarter for QuarterKey, or the refresh date for the current quarter.

**p1p2Incidents.** Count where `priority` is 1 or 2 and `opened_at` falls in the 90 days to quarter end.

**majorIncidents.** Count where `major_incident_state` is accepted (or our equivalent flag) and `opened_at` falls in the 90 days to quarter end.

**mttr.** For incidents with `priority` 1 or 2 and `resolved_at` in the 90 days to quarter end: the mean of `resolved_at` minus `opened_at`, in hours, to one decimal place. Use impact start and end instead if decision 3 adopts them. Show the median beside it in drill-through; one long outage moves a mean a long way.

**repeatIncidents.** Of incidents opened in the 90 days to quarter end, the percentage where another incident on the same `cmdb_ci` was opened in the 30 days before it. This is the proposed rule; see decision 2.

**incidentBacklog.** Count where `opened_at` is on or before quarter end minus 5 days, and `resolved_at` is blank or after quarter end. This is the quarter-end reconstruction 1.4 T1 describes, so history needs no snapshots. The exception is a reopened incident, which keeps only its latest resolution date; check `reopen_count`, and either accept the small error or start a quarterly snapshot from now.

**Rolling up to labs and the estate.** Counts add, which `aggregate: 'sum'` already handles. MTTR and repeat % are `aggregate: 'avg'`, and the current `aggregateMetrics` takes the plain mean of team values, so a team with two incidents weighs the same as a team with two hundred. For real data, the KPI tiles at lab and estate level should be recalculated from the pooled incidents. Scores are unaffected: they are already the mean of each team's own score.

## 4. How a figure becomes a score

The rules are in the README's Health model and `src/data/health.ts`; they need no change for real data. What follows applies them to incidents, because the business will ask what a given number does to the score.

Beyond target, a metric's score falls in a straight line to 0 across its span: `score = 100 - 100 x (distance past target) / span`, never below 0.

| Metric | Target | Span | Scores 0 at |
| --- | --- | --- | --- |
| P1 and P2 incidents | 6 | 12 | 18 incidents |
| Major incidents | 1 | 5 | 6 majors |
| Mean time to restore | 4 hours | 8 hours | 12 hours |
| Repeat incidents | 10% | 20 points | 30% |
| Open over 5 days | 5 | 10 | 15 open |

For counts, target and span multiply by the teams in scope: a lab of three teams has a P1 and P2 target of 18. Rates and averages keep the same target at every level. The team's Incidents score is the mean of its five metric scores; bands are 80 and above Healthy, 60 to 79 Watch, below 60 Act.

**Worked example.** A team with 9 P1 and P2 incidents is 3 past a target of 6. 3 of a span of 12 costs 25 points, so that metric scores 75 (Watch). With the other four scoring 100, 100, 70 and 90, the team's Incidents score is (75 + 100 + 100 + 70 + 90) / 5 = 87, Healthy.

## 5. Decisions to record in X.4

1. **Whose incident is it?** The plan maps by assignment group (1.2), which shows who did the fixing and loads resolver groups and the Service Desk with other teams' failures. Mapping by affected CI or service shows how stable each team's own estate is, which is the question this page asks. Recommendation: attribute by CI and service, fall back to assignment group where the CI is blank, and keep assignment group in drill-through. TeamSourceMap takes either identifier, so this changes the mapping rows, not the model. It decides who owns each number, so it needs the lab leads' agreement in 1.2.
2. **What counts as a repeat?** Proposed: same CI within 30 days. Stricter alternatives are same CI and category, or a shared `problem_id`. The stricter the rule, the lower the figure, so set it before the first live load.
3. **When is service restored?** Opened to resolved measures how long the ticket was open, and overstates restore time when an incident is raised late or held open for confirmation. If impact start and end are captured, use them. `domains.ts` currently lists Dynatrace as the MTTR source, but Dynatrace only sees outages it detected; recommendation is ServiceNow as the system of record and Dynatrace problem duration as a cross-check in 3.1. Load from one source only (3.1 T2), and update the `mttr` source in `domains.ts` to match the decision.
4. **Does On Hold count as open?** For incidentBacklog it should, because the customer is still waiting. Record it explicitly; resolver teams will challenge it.
5. **Are the targets right?** The current targets are placeholders. Set them per team from the first three months of real data, then hold them for a year so movement means something.

## 6. Checks before the metrics go live

These sit alongside the 1.4 reconciliation.

- P1 and P2 for the last full month matches the figure Service Management already reports.
- Unmapped incidents under 5% of volume.
- Every incident has a `cmdb_ci` or `business_service`; list the exceptions and the groups raising them.
- No open incident carries a `resolved_at`, and no resolved incident lacks one.
- Ten incidents traced by hand from ServiceNow through to their score contribution.
