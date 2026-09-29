# platform-health

- App: Platform health dashboard mock styled as a Power BI workspace app, fixed 1920x1080 report pages inside Power BI service chrome; read README.md before changing structure.
- Commands: `npm run dev` (port 5180, strictPort), `npm run build` (runs tsc first), `npm run lint`.
- Power BI kit: `powerbi/` holds the model, Deneb specs and templates, layout manifest, PBIP project and the `npm run deneb:*` generators.
- Delegation: the session runs as the orchestrator; changes go through `worker`, checks through `test`, finished units through `reviewer` (see `.claude/agents`).

## For the test agent

Run `npm run build`. Report failures only.
