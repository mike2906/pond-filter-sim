# Working on pond-filter-sim

- Spec: https://claude.ai/artifact/7yVnrzmr23q722Y7acoUWn. Follow it; flag disagreements rather than silently diverging.
- `packages/engine` is pure TypeScript with no DOM or React. Its tsconfig has no DOM lib, so browser APIs fail typecheck there on purpose.
- SI units inside the engine (m, m³/s, Pa, s). Elevations are relative to the pond surface (datum 0), positive up. Convert only at the UI boundary (`units.ts`, `apps/web/src/format.ts`).
- Every physics function cites its source in a doc comment, and its tests check published reference values, not only round trips. Anything unvalidated is labelled as such.
- `model.ts` is the contract between engine and UI. Changing it means bumping `SCHEMA_VERSION` (once v1 ships) and updating fixtures.
- Before pushing: `npm run typecheck && npm test && npm run build`, and `npm run e2e` for UI changes.
- Mike's reference designs live in the project files (`reference-designs/mike-reference-designs.md`); they become engine fixtures in M1.
