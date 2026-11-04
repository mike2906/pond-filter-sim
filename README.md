# Pond Filter Simulator

A browser app for designing pond filters with real hydraulics: flow, chamber water levels, head loss per stage, pumps and airlifts, and how it all changes as media clogs.

- **Live app:** https://mike2906.github.io/pond-filter-sim/ (after the first deploy)
- **Spec and build plan:** https://claude.ai/artifact/7yVnrzmr23q722Y7acoUWn

Status: milestone 0 (foundations). The app shell, units, themes and the water-property engine work; the hydraulic solver arrives in milestone 1.

## Layout

| Path | What it is |
| --- | --- |
| `packages/engine` | Pure TypeScript physics engine. No UI or DOM code. SI units throughout. |
| `packages/engine/src/model.ts` | The design schema and solver result types shared with the UI. |
| `packages/engine/fixtures` | Example designs used in tests. |
| `apps/web` | React app (Vite). Plan and section drawing, panels, phone bottom sheet. |

## Develop

Requires Node 22.

```sh
npm install
npm run dev        # app at http://localhost:5173
npm test           # engine unit tests
npm run typecheck
npm run e2e        # phone and desktop smoke tests (Playwright, Chromium)
```

`BASE_PATH` overrides the build's base path; by default the build uses relative paths so it works on GitHub Pages or embedded in another site.

## Deploy

Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/deploy.yml`. In the repository settings, Pages must use **GitHub Actions** as its source.
