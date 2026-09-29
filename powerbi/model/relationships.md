# Relationships

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
