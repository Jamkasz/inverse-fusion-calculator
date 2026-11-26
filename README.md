# Inverse Fusion Calculator

A static, client-side web app that plans a Persona 5 Royal fusion **backwards**.
Instead of asking "what do these two personas make?", you choose a target persona,
the skills it should have (each with a source) and optionally a trait, and the app
works out a step-by-step fusion plan that produces exactly that build. Everything
runs in the browser; there is no backend and no account.

Game data and the reference fusion algorithm are vendored from the open-source
[chinhodado/persona5_calculator](https://github.com/chinhodado/persona5_calculator)
project (Apache-2.0) at the pinned commit below, then converted into typed data at
build time. See [`NOTICE`](./NOTICE) for attribution.

**Pinned upstream commit:** `802422dad1f5b9eee441e594e738aceaeb9e5a85`

## Development

Requires Node 22.13 or newer (CI uses Node 22).

```bash
npm install      # install dependencies
npm run dev      # start the Vite dev server
npm test         # run the Vitest suite once
npm run build    # type-check, then build the static site into dist/
npm run preview  # serve the production build locally
npm run fetch    # re-download the pinned reference files into vendor/reference/
```

### Refreshing vendored data

The files under `vendor/reference/` are unmodified copies of upstream files at the
pinned commit. They are committed to this repository so builds and tests are
reproducible and offline. To refresh them (for example after changing the pin):

```bash
npm run fetch
```

The script downloads all reference files and writes the commit hash to
`vendor/reference/PINNED_SHA`. It exits non-zero if any download fails or is
empty. To move to a new upstream version, update `SHA` in
`tools/fetch-reference.mjs`, update `PINNED_COMMIT` in `src/ui/App.tsx` and the
pin in `NOTICE`, then run `npm run fetch`, `npm test` and `npm run build`.

## Attribution

This project is unofficial and is not affiliated with ATLUS or SEGA. The
reference calculator by chinhodado is licensed under the Apache License 2.0; the
upstream license text is kept at `vendor/reference/LICENSE`. See [`NOTICE`](./NOTICE)
for the full attribution.

- Reference site: <https://chinhodado.github.io/persona5_calculator/indexRoyal.html>
- Upstream repository: <https://github.com/chinhodado/persona5_calculator>
- Pinned commit: <https://github.com/chinhodado/persona5_calculator/commit/802422dad1f5b9eee441e594e738aceaeb9e5a85>

## License

The project code is licensed under the Apache License, Version 2.0
(Copyright 2026 Jamkasz); the full license text is in [`LICENSE`](./LICENSE).

Files under `vendor/reference/` remain unmodified Apache-2.0 copies of the
upstream reference calculator and are attributed in [`NOTICE`](./NOTICE).

This project is unofficial and is not affiliated with or endorsed by ATLUS or
SEGA. The deployed site also serves the license at `LICENSE` and the
attribution at `NOTICE`.

## Deploy (manual steps for the product owner)

These steps are intentionally **manual** and are not performed by the build. The
repository name determines the public URL, so a game-neutral name is preferred.

1. **Create a PUBLIC GitHub repository named `inverse-fusion-calculator`.**
   The name becomes part of the site URL, so keep it game-neutral. Do not add a
   README, `.gitignore` or license from GitHub's template — the repo already has
   everything it needs.
2. **Enable GitHub Pages BEFORE pushing:** in the new repository, open
   **Settings → Pages** and set **Source** to **"GitHub Actions"**. GitHub offers
   this source even before the workflow file exists in the repository.
3. **Push the `main` branch** to that repository:
   ```bash
   git remote add origin https://github.com/<github-username>/inverse-fusion-calculator.git
   git push -u origin main
   ```
   The workflow in `.github/workflows/deploy.yml` then runs on every push to
   `main` (tests, build, publish).
4. **Visit the site** at
   `https://<github-username>.github.io/inverse-fusion-calculator/`.

> **If the first run happened before Pages was enabled:** the
> `actions/configure-pages` step fails when Pages is not already on, and enabling
> Pages afterwards does not re-trigger the workflow. After setting the source in
> step 2, re-run the workflow from the repository's **Actions** tab (select the
> run → **Re-run all jobs**), or trigger it manually via **Run workflow**
> (`workflow_dispatch`).

The Vite `base` is already set to `/inverse-fusion-calculator/`, matching the
repository name. If you choose a different repository name, update `base` in
`vite.config.ts` before deploying.
