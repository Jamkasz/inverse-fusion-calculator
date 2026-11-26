# Inverse Fusion Calculator (Persona 5 Royal) — Implementation Plan

> **For agentic workers:** implement one task at a time, in order. Before a task, read "Product Definition", "Game Rules", "Global Constraints", "Shared Types", "How the tasks are sliced" and the task itself (plus "Solver overview" for Tasks 10 and 12–15). Every task follows the same cycle — write the listed failing tests, run them and see them fail, implement, run and see them pass, commit. Tick the checkbox when done. Every task is a vertical slice: it must leave the deployed app working end to end and deliver the task's "Visible result".

**Goal:** A static web app where the user picks a target Persona 5 Royal persona, up to 8 skills (each with a chosen source) and optionally a trait, and gets a step-by-step fusion plan that produces exactly that persona.

**Architecture:** Fully client-side single-page app; no backend, no database. Game data is vendored from the reference calculator's repository at a pinned commit and converted to typed JSON at build time. A pure TypeScript engine (forward fusion + inheritance rules + backward search solver) runs in a Web Worker; a React UI collects the build and renders the plan.

**Tech stack:** TypeScript (strict), Vite, React, Vitest. No other runtime dependencies. Deployed as static files (GitHub Pages).

**Spec:** this document (sections "Product Definition" and "Game Rules").

**Task map (19 vertical slices):**

| Phase | Tasks (each one ends with a working, deployed app) |
|---|---|
| 1 — Walking skeleton | 1 Deployed empty app · 2 Pick a persona, see skills and trait |
| 2 — Forward fusion | 3 Fuse two personas · 4 Golden parity (test-only) · 5 Ways to fuse the persona |
| 3 — Describe the build | 6 Editable moveset · 7 Skill cards · 8 "Already has it", validation, counter · 9 Distance of each source |
| 4 — Plans | 10 First plans (one skill) · 11 Step-by-step instructions · 12 Several skills · 13 Traits · 14 Advanced fusion · 15 Ranked alternatives · 16 Background solving |
| 5 — Settings, explanations, sharing | 17 Settings · 18 Why there is no plan · 19 Shareable link |

---

## Source of Truth (investigated)

The reference site `https://chinhodado.github.io/persona5_calculator/indexRoyal.html` is the open-source project `github.com/chinhodado/persona5_calculator` (Apache-2.0, last pushed April 2024). **No scraping is needed**: all data and logic live in plain files in that repo.

Pinned commit: `802422dad1f5b9eee441e594e738aceaeb9e5a85` (verify it is still `master` HEAD when starting Task 1; if not, pin to the new HEAD and record it).

| File (repo path) | Contains | Verified shape |
|---|---|---|
| `data/PersonaDataRoyal.ts` | `personaMapRoyal`: 232 personas | keys: `arcana`, `level`, `skills` (`{name: learnLevel}`, `0` = known at base), `trait`, `inherits` (223 of 232; the 9 rare personas lack it), `elems`, `stats`, `item`, `itemr`, optional `skillCard`, `special` (24), `rare` (9), `dlc` (25), `max`, `area`, `floor`, `note` |
| `data/SkillDataRoyal.ts` | `skillMapRoyal`: skills **and traits** (traits have `element: "trait"`, 90 entries) | keys: `element`, `effect`, `personas` (`{name: learnLevel}`), optional `cost`, `unique` (99), `card` (59, shorthand notes on other acquisition routes — not card sources), `fuse` (113, personas that itemize into this card), `talk` (120, negotiation source), `note` |
| `data/Data5Royal.ts` | `rarePersonaeRoyal` (9), `rareCombosRoyal`, `arcana2CombosRoyal`, `specialCombosRoyal` (24), `dlcPersonaRoyal`, `inheritanceChartRoyal` | see "Game Rules" |
| `src/FusionCalculator.ts` | forward fusion algorithm (`fuse`, `fuseNormal`, `fuseRare`, `getRecipes`) | ported in Task 3 |
| `data/ItemDataRoyal.ts` | item descriptions | not needed |

**What the reference does NOT contain:** how many skills a fusion can inherit, the trait inheritance rules, whether skill cards bypass inheritance type. These were researched separately (see "Game Rules"); they are isolated in one file (`src/engine/rules.ts`) so a correction is a small change.

**Second source:** `aqiu384/megaten-fusion-tool` (P5R data as JSON), credited by the reference as one of its own sources. It was used as a cross-check only: all 232 personas match the reference on level and trait, and 227 match on inheritance type (the 5 exceptions are listed in "Game Rules"). Do not mix the two datasets; spellings differ (`Arsène` vs `Arsene`).

---

## Product Definition

**Inputs**
1. Target persona (any of the 232; DLC ones only if enabled in settings).
2. Moveset: 1–8 distinct skills, prefilled with the skills the target learns natively (with their learn levels) so the user only edits what must come from elsewhere. For each skill the user picks exactly one source, and only valid sources are offered:
   - `innate` — the target learns it itself (at base, or by leveling to the learn level).
   - `card` — taught with a skill card after the final fusion.
   - `persona:<name>` — inherited through fusion, originating from a specific persona that learns the skill natively.
   - `held:<name>` — inherited through fusion, originating from a specific persona the user already owns that holds the skill **without** learning it natively. This is how Network Fusion skills enter a plan (the outcome of Network Fusion is unpredictable, so the user gets the skill first, then tells the planner which persona ended up with it). The planner treats that persona as a fixed leaf and tries to route the skill from it to the target. Any persona and any non-unique skill may be combined this way; the planner does not check how the skill was obtained.
3. Trait (optional): the target's own trait (default) or `persona:<name>` — inherited through fusion from a persona whose own trait it is.
4. Settings: owned DLC personas (default none, same as reference), allow treasure-demon (rare) fusions (default off), maximum fusion depth (default 4), player level (optional, default unset). When a player level is set, no fusion in the plan may produce a persona whose base level is above it; unset means the restriction is ignored (the game has ways around it).

**What a plan's starting personas are.** The leaves of a plan are (a) the personas the user named as skill or trait sources, shown as "Persona X at Lv Y" where Y is the level it needs to know the skill (or "your Persona X that already has Skill" for a `held` source), and (b) plain fusion partners that carry nothing and are only needed to make the fusion land on the right result, shown as "Persona X" at any level. The plan never explains how to acquire a leaf.

**Advanced fusion.** The 24 personas made only by advanced (multi-ingredient) fusion are fully supported as targets, as intermediate steps and as leaves.

**Output**
- Up to 5 plans, best first (fewest fusions, then lowest approximate cost).
- Each plan is an ordered step list plus a tree, for example:
  1. *Obtain Agathion; level to 7 to learn Zio.*
  2. *Fuse Agathion + X → Y. Inherit: Zio.*
  3. *Fuse Y + Z → Target. Inherit: Zio. Trait: take Y's trait.*
  4. *Use skill card: Invigorate 3.*
  5. *Level Target to 45 to learn …*
- If no plan exists, a specific reason (see Task 18).
- The whole build is encoded in the URL hash so a plan can be shared.

**Out of scope for v1** (do not build): fusion alarm effects, gallows/strengthening as a skill source, stats and elemental affinities, explaining how to acquire starting personas, accounts or saved builds, base Persona 5 (non-Royal) data, mobile-specific layout work beyond not breaking.

---

## Game Rules

Rules marked **[REF]** are taken verbatim from the reference repo and must match it exactly.

**Forward fusion [REF]** — port of `FusionCalculator.fuse(a, b)`:
1. If `{a, b}` is a 2-ingredient entry of `specialCombos`, return its result.
2. If exactly one of the two is rare: rare fusion. `modifier = rareCombos[main.arcana][rarePersonae.indexOf(rare.name)]`; result is the persona `modifier` positions away from `main` in `main`'s arcana list sorted by level, skipping special/rare personas in the same direction; null if out of range.
3. Otherwise normal fusion: `level = 1 + floor((a.level + b.level) / 2)` using **base** levels; `arcana = arcanaMap[a.arcana][b.arcana]` (null if undefined).
   - Different arcana: lowest-level persona of the result arcana with `level >= computed level`, skipping special and rare.
   - Same arcana: highest-level persona with `level <= computed level`, skipping special, rare, `a` and `b`.
4. Special personas are produced only by their `specialCombos` recipe (2 to 6 ingredients). Rare personas can never be a result.
5. Personas flagged `dlc` that the user does not own are removed from every list before any calculation.

The rules the reference does not encode were researched on 2026-11-24; results are below, marked **[CONFIRMED]** (two or more independent sources agree), **[CONSERVATIVE]** (sources disagree or only one exists; the stricter reading is used so a plan is never unexecutable), or **[OPEN]** (needs an in-game check by the product owner). Evidence is in "Rules Research" at the end of this section.

**Skill inheritance**
- **[REF]** A skill can be inherited by a persona only if `inheritanceChart[persona.inherits]` allows the skill's element. Column order: `phys, gun, fire, ice, electric, wind, psy, nuclear, bless, curse, healing, ailment`. Skill elements `almighty`, `support` and `passive` have no column: always inheritable. **[CONFIRMED]** — the second tool's chart is identical cell for cell.
- **[CONFIRMED]** Skills with a `unique` field are never inheritable. Treated as never available as cards either.
- **[CONFIRMED]** The number of skills a fusion can inherit depends on the **total number of skills currently held by all ingredients** (duplicates and non-inheritable skills count; skills added by leveling or skill cards count):

  | total skills on ingredients | max inherited | status |
  |---|---|---|
  | 0–2 | 0 | conservative (no source lists a row) |
  | 3–5 | 1 | confirmed |
  | 6–8 | 2 | confirmed |
  | 9–12 | 3 | 9–11 confirmed; **12 is disputed** (some sources say 4) → treated as 3 |
  | 13–23 | 4 | confirmed |
  | 24–31 | 5 | confirmed |
  | 32–41 | 6 | one source family only |
  | 42+ | 8 | one source family only → **treated as 6** |

  Consequences: a 2-persona fusion can never inherit more than 4 (max 16 skills); 5 needs an advanced fusion with at least 3 ingredients (24 skills); 6 needs at least 4 ingredients (32 skills). Because an ingredient's skill count can be raised with skill cards or leveling, the solver uses the best case for the ingredient count, and the plan **tells the user the total skill count the ingredients must reach** when their natural count is too low (Task 11).
- **[CONFIRMED]** A persona holds at most 8 skills. **[CONSERVATIVE]** A freshly fused persona arrives with its base skills (learn level `0`), so inherited count ≤ `8 − baseSkillCount`.
- **[CONFIRMED]** An ingredient passes on any skill it currently holds (native, inherited or from a card), so skills travel down a chain of fusions.
- **[CONFIRMED by second tool]** The 9 rare personas (treasure demons) have inheritance type `Almighty`. Irrelevant to results (they cannot be fused), but removes the `undefined`.
- **[OPEN]** The two data sources disagree on the inheritance type of 5 personas; every other persona's type, trait and level match. The reference wins (it is the declared source of truth), and any plan that inherits a skill **into** one of these shows a warning (Task 11):

  | persona | reference (used) | second tool |
  |---|---|---|
  | Clotho | Healing | Bless |
  | Hecatoncheires | Physical | Psy |
  | Macabre | Curse | Ailment |
  | Mandrake | Electric | Ailment |
  | Maria | Healing | Bless |

**Traits**
- **[CONFIRMED]** The fused persona keeps its own trait or takes the current trait of any one ingredient; this also applies to advanced fusions. Trait choice happens only at fusion and is permanent for that persona.
- **[CONFIRMED]** Traits chain: an ingredient passes on the trait it currently has, including one it inherited.
- **[CONFIRMED]** A DLC persona's trait cannot be passed on. **[CONSERVATIVE]** A DLC persona is treated as never passing any trait, even one it inherited.
- **[CONFIRMED]** Treasure demons do not pass on their own trait (`Ultimate Vessel`); instead each offers three fixed extra traits. Those extra traits, and the "bonus trait" offered when ingredients share a trait, are **out of scope for v1** (the reference has no data for them). Treasure demons therefore never pass a trait in v1.
- There is no other restriction: any persona can receive any trait.

**Skill cards**
- **[CONFIRMED]** A skill card can be used on any persona regardless of its inheritance type (three sources, one with a concrete example: Kodama cannot inherit Kouha but can learn it from a card). One low-quality site claims the opposite; it gives no example and is disregarded.
- **[REF]** Where a skill card comes from, as recorded by the reference (verified against its `view/skill.html` and `view/persona.html`):
  - **Electric chair, normal** — every persona with `skillCard: true` whose `item` equals the skill name.
  - **Electric chair during a fusion alarm** — every persona with `skillCard: true` whose `itemr` equals the skill name.
  - **Negotiation** — the skill's `talk` field, a string like `Awakened God (Arahabaki)` (shadow name, persona name).
  - The skill's `fuse` field is the reference's own summary of the two chair lists; derive the lists from the persona data instead, because only that separates normal from alarm.
  - The skill's `card` field is **not** a card source. The reference site never displays it; it holds shorthand notes on other ways the skill is obtained (`Network Fusion`, `Fusion Mutation`, `Jazz 9/4`, `Ring of Vanity`, `Trial 20`, …). Keep it verbatim as `acquisitionNote`.
  - The reference has no data on battle drops; the app does not claim any.
- A skill is offered as a `card` source only if at least one of the three lists is non-empty (after removing DLC personas the user does not own).

**Descriptions**
- **[REF]** Every skill and trait has an `effect` text (all 459 entries have one); the app shows it verbatim. Skill cost comes from `cost`: below 100 it is `% HP`, otherwise `cost / 100` SP; passives and traits have none.

**Treasure-demon fusion**
- **[CONFIRMED]** The result depends on the other persona's **current** level, not its base level (the reference assumes base level). This is why rare fusions are off by default.

**Leveling**
- **[REF]** `skills[name] > 0` means the persona must reach that level to learn it. The plan states the required level; it never blocks a plan.

**Rules Research (evidence)**

| rule | sources |
|---|---|
| inherit-count table | Steam guide "How Fusion Works" (PELICANFORCE, id 2880182811): 3-5/6-8/9-11/12-23/24-31. Neoseeker "Persona 5 Royal Velvet Room Guide": same rows. Megami Tensei Fandom wiki "Skill Inheritance" and its copies (SteamAH guide): 3-5/6-8/9-12/13-23/24-31/32-41/42→8. Disagreement is only at exactly 12 and above 31. |
| count uses all held skills | Steam guide and Neoseeker both state it explicitly, including the skill-card padding tip. |
| skill cards ignore inherit type | Steam guide; Neoseeker (Kodama/Kouha example); GameFAQs P5R board. Dissent: persona5royalfusioncalculator.blog. megatenwiki.com could not be read (bot check). |
| trait choice, chaining, advanced fusion | Neoseeker (any component persona, "chain inherit"); Samurai Gamers fusion guide (two components or the result's original); Steam guide. |
| DLC traits not inheritable | Steam guide; Neoseeker; megatenwiki search summary. |
| treasure demon traits | Steam guide; Neoseeker; megatenwiki search summary (`Ultimate Vessel` uninheritable). |
| treasure demon uses current level | Steam guide (Arsène example). |
| inheritance chart, rare type, 5 disputed personas | `aqiu384/megaten-fusion-tool`, `src/app/p5/data/comp-config.json` and `roy-demon-data.json`, compared programmatically against the reference. |

Not verifiable from sources and left as stated: whether base skills limit inheritance slots (conservative reading used), and the exact tier at 12 total skills.

---

## Global Constraints

- TypeScript `strict: true`; no `any` in `src/engine`.
- `src/engine` is pure: no DOM, no React, no `localStorage`, no network. Everything is a function of `(GameData, Settings, Build)`.
- Persona, skill and trait names are used as ids, spelled exactly as in the reference data (including `Arsène`, `Queen's Necklace`).
- Runtime dependencies: `react`, `react-dom` only.
- Vendored reference files are never edited by hand; they are re-fetched by script.
- Keep `NOTICE` with Apache-2.0 attribution to chinhodado/persona5_calculator.
- Commit after every task with message `task N: <title>`.
- Keep code names game-neutral: no `p5r`/`royal` in file, type, function or URL-state names under `src/` (see "Future: a second game"). The game's name appears only in user-facing text and in `vendor/reference/`.

## File Structure

```
inverse-fusion-calculator/
  PLAN.md
  NOTICE
  tools/
    fetch-reference.mjs        # downloads pinned reference files into vendor/
    build-data.mjs             # vendor/reference/*.js -> src/data/game-data.json
    build-golden.mjs           # runs reference FusionCalculator -> tests/golden/fusions.json
    find-fixtures.mjs          # finds named example builds -> tests/helpers/fixtures.ts
  vendor/reference/            # pinned copies of the reference files + LICENSE
  src/
    settings.ts                # Settings type and DEFAULT_SETTINGS
    data/game-data.json        # generated
    data/types.ts              # GameData types
    data/load.ts               # typed loader + DLC filtering
    engine/rules.ts            # every researched game rule as a named constant/function
    engine/fusion.ts           # forward fusion (port)
    engine/recipes.ts          # reverse lookup: recipes producing a persona
    engine/inheritance.ts      # canInherit, slot limits
    engine/build.ts            # Build type, source options, validation
    engine/reach.ts            # single-skill lower bounds
    engine/solver.ts           # backward search
    engine/diagnostics.ts      # why a build has no plan
    engine/plan.ts             # tree -> ordered steps
    worker/solver.worker.ts    # from Task 16
    ui/…                       # grows with every task
  tests/                       # mirrors src/, plus golden/, helpers/ and ui/
```

## Shared Types (defined in the task named; listed here so every task agrees)

```ts
// src/data/types.ts (Task 2)
type Persona = { name: string; arcana: string; level: number;
  skills: Record<string, number>; trait: string; inherits: string | null;
  special: boolean; rare: boolean; dlc: boolean };
type CardSources = { chair: string[];        // personas that itemize into this card normally
  chairAlarm: string[];                         // personas that itemize into it during a fusion alarm
  negotiation: string[] };                      // reference `talk` strings, e.g. "Awakened God (Arahabaki)"
type Skill = { name: string; element: string; effect: string; cost: number | null; unique: boolean;
  personas: Record<string, number>; cardSources: CardSources;
  acquisitionNote: string | null };             // reference `card` field verbatim; NOT a card source
type GameData = { personas: Persona[]; skills: Skill[]; traits: Skill[];
  arcanaCombos: {source: [string, string]; result: string}[];
  specialCombos: {result: string; sources: string[]}[];
  rarePersonae: string[]; rareCombos: Record<string, number[]>;
  inheritanceChart: Record<string, boolean[]>; dlcGroups: string[][] };

// src/settings.ts (Task 2)
type Settings = { ownedDlc: string[]; allowRare: boolean; maxDepth: number;
  playerLevel: number | null };                                // null = ignore the level restriction
const DEFAULT_SETTINGS: Settings = { ownedDlc: [], allowRare: false, maxDepth: 4, playerLevel: null };

// src/engine/build.ts (Task 6; `held` used from Task 8, `trait` from Task 13)
type SkillSource = {kind: 'innate'} | {kind: 'card'} | {kind: 'persona'; persona: string}
  | {kind: 'held'; persona: string};       // persona already holds the skill non-natively (e.g. Network Fusion)
type Build = { target: string; skills: {name: string; source: SkillSource}[];
  trait: null | {name: string; from: string} };                // null = keep target's own

// src/engine/recipes.ts (Task 5)
type Recipe = { result: string; ingredients: string[]; cost: number };

// src/engine/solver.ts (Task 10)
type Node = { persona: string;
  carries: string[];            // inherited skills this persona must hold when used
  learns: {skill: string; level: number | null}[];   // skills this persona supplies as a source: learn level,
                                                     // or null for a `held` source (it already has the skill)
  carriesTrait: string | null;  // non-own trait it must hold
  recipe: null | { ingredients: Node[]; inherit: {skill: string; from: number}[]; traitFrom: number | null } };
type Plan = { root: Node; fusions: number; cost: number };
```

---

## How the tasks are sliced

Every task is a **vertical slice**: when it is finished, the deployed web app works end to end and (with one exception, Task 4) shows something new to the user. The site is live from Task 1. Engine code is written only when a slice needs it, together with the UI that exposes it.

Rules for every task:
- Finish with `npm test` and `npm run build` green, and state in the task report what a visitor to the site can now do ("Visible result").
- UI component tests use Vitest + `@testing-library/react` + `jsdom` (dev dependencies, added in Task 1).
- Never leave the page broken for inputs a later task will handle: show the "not supported yet" message the task specifies.
- **Solver tasks (10, 12–15, 17):** use the named fixtures from `tests/helpers/fixtures.ts` (Task 9) wherever a test says to pick personas. Never weaken, delete or skip a listed test to make it pass, and never special-case a fixture in the solver; if a listed test cannot pass with the algorithm as written, stop and report which one and why.

---

## Phase 1 — Walking skeleton

### - [x] Task 1: Deployed empty app and reference fetch

**Visible result:** the site is live on GitHub Pages showing the app title, a one-line description and a footer crediting the reference calculator with the pinned commit.

**Files:** create `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `NOTICE`, `README.md`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `tools/fetch-reference.mjs`, `vendor/reference/*` (fetched, committed), `.github/workflows/deploy.yml`, `tests/vendor.test.ts`.

**Approach:** `git init`. The reference repo ships compiled `.js` next to every `.ts`, and the live site runs the `.js`; fetch **both** — the `.js` is what tools execute (no type stripping needed), the `.ts` is for reading. `fetch-reference.mjs` downloads `data/PersonaDataRoyal.{ts,js}`, `data/SkillDataRoyal.{ts,js}`, `data/Data5Royal.{ts,js}`, `src/FusionCalculator.{ts,js}`, `src/DataUtil.{ts,js}`, `indexRoyal.html`, `view/skill.html`, `view/persona.html`, `LICENSE` from `raw.githubusercontent.com/chinhodado/persona5_calculator/<PINNED_SHA>/…` into `vendor/reference/`, and writes the SHA to `vendor/reference/PINNED_SHA`. npm scripts: `fetch`, `test`, `dev`, `build`. Dev dependencies include `vitest`, `@testing-library/react` and `jsdom`. The workflow runs tests, builds and publishes to GitHub Pages on push to `main`. `base` in `vite.config.ts` is `/<repo-name>/`.

**Hosting decision (settled):** GitHub Pages, default `github.io` address, no custom domain, no analytics.

**Manual steps for the product owner (the agent must not do these; list them in the README and in the task's final report):** create a public GitHub repository and push the code; in the repository's Settings → Pages set Source to "GitHub Actions". The site is then served at `https://<github-username>.github.io/<repo-name>/`.

**Tests:** every expected vendored file exists and is non-empty; `PINNED_SHA` is a 40-character hex string; `PersonaDataRoyal.js` contains `personaMapRoyal`; `App` renders the title and a link to the reference calculator.

### - [ ] Task 2: Pick a persona, see its skills and trait

**Visible result:** the visitor types a persona name and sees its arcana, base level, every skill it learns (labelled `base` or `Lv N`, with element, cost and description) and its trait with description.

**Files:** create `tools/build-data.mjs`, `src/settings.ts`, `src/data/types.ts`, `src/data/load.ts`, `src/data/game-data.json` (generated, committed), `src/ui/TargetPicker.tsx`, `src/ui/PersonaSummary.tsx`, `tests/data.test.ts`, `tests/ui/PersonaSummary.test.tsx`; modify `src/ui/App.tsx`.

**Produces:** `Settings` and `DEFAULT_SETTINGS` (see Shared Types; the app uses `DEFAULT_SETTINGS` everywhere until Task 17 makes them editable); `Persona`, `Skill`, `CardSources`, `GameData` types; `loadGameData(settings: Pick<Settings,'ownedDlc'>): GameData` (DLC personas not in `ownedDlc` removed, also from every `cardSources` list); `personasByArcana(data): Record<string, Persona[]>` sorted by level ascending; `hasCard(skill): boolean`; `formatCost(skill): string` (`"8 SP"`, `"9% HP"`, or `"-"`). npm script `data` = `fetch` then `build-data`.

**Approach:** `build-data.mjs` evaluates the three vendored data `.js` files in a `node:vm` context (top-level `const` is not visible on the context object, so append a line that assigns the needed constants to `globalThis` before running) and writes `game-data.json` in the `GameData` shape. Entries of `skillMapRoyal` with `element === "trait"` go to `traits`, the rest to `skills`. Chart `"✓"/"✘"` become booleans. `inherits` missing becomes `null`. `cardSources` is built as described under "Skill cards" in Game Rules (`talk` may be a string or absent; normalise to an array). The script prints, without failing, any skill whose reference `fuse` list differs from `chair ∪ chairAlarm`. UI: native `<input list>` + `<datalist>` of persona names (no DLC owned at this stage); descriptions are the reference `effect` text verbatim.

**Tests (data):**
- 232 personas with every DLC owned; 9 rare; 24 special; 25 dlc; `loadGameData({ownedDlc: []})` returns 207.
- 90 traits; every `persona.trait` exists in `traits`; every key of every `persona.skills` exists in `skills`.
- `Agathion`: arcana `Chariot`, level 3, `skills.Zio === 7`, trait `Rare Antibody`, inherits `Electric`. `Abaddon.trait === "Mouth of Savoring"`.
- every non-rare persona has an `inherits` that is a key of `inheritanceChart`; every chart row has length 12.
- `Zio.cardSources.chair` contains `Agathion`; `Mazio.cardSources.chairAlarm` contains `Agathion`; `Abysmal Surge.cardSources.negotiation` equals `["Awakened God (Arahabaki)"]`.
- every skill and every trait has a non-empty `effect`.
- a skill whose reference `card` is `"Network Fusion"` has `acquisitionNote === "Network Fusion"` and that note alone does not make `hasCard` true.
- `formatCost` returns `"8 SP"` for `Abysmal Surge` (cost 800) and `"-"` for a passive.
- with no DLC owned, no `cardSources` list names a DLC persona.

**Tests (UI):** choosing `Agathion` shows 6 skills (Dia, Baisudi, Lunge, Rakukaja, Zio, Dodge Elec) in learn-level order, `Zio` labelled `Lv 7`, `Dia` labelled `base`, each with its `effect` text exactly as in `game-data.json`; the trait shows `Rare Antibody` and its effect text; an unknown name shows "No such persona".

---

## Phase 2 — Forward fusion (must match the reference exactly)

### - [ ] Task 3: Fuse two personas

**Visible result:** a collapsible "Fusion check" panel: pick two personas, see the resulting persona (or "These cannot be fused").

**Files:** create `src/engine/fusion.ts`, `src/ui/FusionCheck.tsx`, `tests/fusion.test.ts`, `tests/ui/FusionCheck.test.tsx`; modify `src/ui/App.tsx`.

**Produces:** `createFusion(data: GameData, settings: Pick<Settings,'allowRare'>): { fuse(a: string, b: string): string | null }`. With `allowRare: false`, any pair containing exactly one rare persona returns null. The panel always uses `allowRare: true` (it is a plain forward check) and, when one ingredient is a treasure demon, adds the note "Assumes the other persona is at its base level."

**Approach:** port `fuse`, `getSpecialFuseResult`, `fuseNormal`, `fuseRare` from `vendor/reference/FusionCalculator.ts` following "Forward fusion [REF]". Keep the control flow recognisably the same as the reference so the two can be diffed.

**Tests:**
- `fuse('Barong','Rangda') === 'Shiva'` (2-ingredient special), in both argument orders.
- every non-null result of a Fool + Magician pair is a `Death` arcana persona.
- same-arcana fusion never returns either ingredient.
- no pair ever returns a rare persona, or a special persona other than via a 2-ingredient combo — loop over all pairs.
- `fuse(a,b) === fuse(b,a)` for all pairs.
- with `allowRare: false`, `fuse('Regent', <any non-rare>) === null`.
- UI: choosing Barong and Rangda shows Shiva; a null result shows the "cannot be fused" text.

### - [ ] Task 4: Golden parity with the reference (test-only)

**Visible result:** none — this is the one task with no visible change. It proves Task 3's panel gives the same answer as the reference site for every pair.

**Files:** create `tools/build-golden.mjs`, `tests/golden/fusions.json` (generated, committed), `tests/golden.test.ts`.

**Approach:** `build-golden.mjs` loads the vendored reference `.js` files (`Data5Royal`, `PersonaDataRoyal`, `SkillDataRoyal`, `DataUtil`, `FusionCalculator`, concatenated in that order into one script so top-level `const`s share a scope) into one `node:vm` context with a stub `localStorage` (first empty, then with every DLC enabled), aliases the `…Royal` globals to the unsuffixed names the code expects (see `vendor/reference/indexRoyal.html` for how the site does it), and writes `{noDlc: {"A|B": result|null}, allDlc: {...}}` for every unordered pair.

**Tests:** for both DLC configurations, with `allowRare: true`, our `fuse` equals the golden value for every pair. This test is the definition of "accurate to the source of truth"; it must stay green forever. If it fails, fix `fusion.ts`, never the golden file.

### - [ ] Task 5: See every way to fuse the chosen persona

**Visible result:** under the persona summary, "Ways to fuse <persona>: N recipes", listing the 20 cheapest (ingredients and approximate cost) with a "show all" toggle; advanced-fusion personas show their single multi-ingredient recipe; treasure demons show "Cannot be fused".

**Files:** create `src/engine/recipes.ts`, `src/ui/RecipeList.tsx`, `tests/recipes.test.ts`, `tests/ui/RecipeList.test.tsx`; modify `src/ui/App.tsx`.

**Produces:**
```ts
buildRecipeIndex(data, fusion, playerLevel: number | null): Map<string, Recipe[]>
   // every persona -> all recipes producing it; when playerLevel is set, personas whose
   // base level exceeds it get an empty list (they can still be used as leaves)
```

**Approach:** run `fuse` over all unordered pairs and group by result, then add each `specialCombos` entry with more than 2 sources as a multi-ingredient recipe (skip a combo if any ingredient is absent from the DLC-filtered data). A recipe whose ingredients include its own result is dropped. `cost = Σ (27·L² + 126·L + 2147)` over ingredient base levels (reference's `getApproxCost`). The index is built once per settings change (`useMemo`) from `DEFAULT_SETTINGS`, so treasure-demon recipes are not listed until they are enabled in Task 17; the list says so in a one-line note.

**Tests:**
- `Neko Shogun` has exactly one recipe: `Kodama, Sudama, Anzu`.
- rare personas have zero recipes.
- every 2-ingredient recipe in the index satisfies `fuse(a,b) === result`.
- recipe count for three sample personas equals the count derived from the golden file.
- with `playerLevel: 10`, every persona with base level > 10 has zero recipes and every persona with base level ≤ 10 has the same recipes as with `null`.
- UI: Neko Shogun shows one recipe with three ingredients; a rare persona shows "Cannot be fused"; the list is sorted by cost ascending.

---

## Phase 3 — Describe the build

### - [ ] Task 6: Edit the moveset — innate and inherited sources

**Visible result:** the skill list becomes an editable moveset (up to 8 rows, prefilled with the persona's own skills). Each row has a source select offering only valid choices: "Innate" or a persona that learns the skill and can pass it to the target.

**Files:** create `src/engine/rules.ts`, `src/engine/inheritance.ts`, `src/engine/build.ts`, `src/ui/SkillRow.tsx`, `src/ui/BuildForm.tsx`, `tests/rules.test.ts`, `tests/inheritance.test.ts`, `tests/ui/BuildForm.test.tsx`; modify `src/ui/App.tsx` (`PersonaSummary` keeps the header and trait; `BuildForm` replaces its skill list).

**Produces:**
```ts
// rules.ts — encode "Game Rules" exactly; do not re-research; if a rule looks wrong, stop and report
MAX_SKILLS = 8
inheritTier(totalIngredientSkills: number): number   // the table in "Game Rules" (12 -> 3, 42+ -> 6)
maxInherited(ingredientCount: number): number        // inheritTier(MAX_SKILLS * ingredientCount)
minTotalSkillsFor(inheritCount: number): number      // 0->0, 1->3, 2->6, 3->9, 4->13, 5->24, 6->32
CARD_IGNORES_INHERIT_TYPE = true
isSkillInheritable(skill: Skill): boolean            // !skill.unique
canPassTrait(persona: Persona): boolean              // !persona.dlc && !persona.rare
RARE_INHERIT_TYPE = 'Almighty'
DISPUTED_INHERIT_TYPE: string[]                      // ['Clotho','Hecatoncheires','Macabre','Mandrake','Maria']
// inheritance.ts
canInherit(data, persona: string, skill: string): boolean   // chart + isSkillInheritable; no column -> true;
                                                            // inherits null -> RARE_INHERIT_TYPE
inheritCapacity(data, persona: string, ingredientCount: number): number
   // min(maxInherited(n), MAX_SKILLS - count of skills with learn level 0)
// build.ts
SkillSource, Build types (see Shared Types)
sourceOptions(data, target: string, skill: string): SkillSource[]
   // 'innate' first if the target learns it; then one {kind:'persona'} per persona (not the target)
   // that natively learns it, only if canInherit(target, skill). Task 7 adds 'card'. Never lists 'held'.
```

**Behaviour:**
- **Prefilled moveset.** Choosing a target fills the rows with every skill that persona learns natively, ordered by learn level, each with source `innate` and a label `base` or `Lv N`. If it learns more than 8, the first 8 by learn level are filled and the rest are listed below as "also learns" chips that can be clicked into a free row. Changing the target replaces all rows with the new persona's skills.
- The user then edits from that starting point: add a row, remove a row, or change its skill (datalist of every non-unique skill plus the target's own skills). A row whose skill the target learns natively defaults to `innate`; any other skill defaults to the first valid source.
- **Only valid sources are selectable.** The source `<select>` contains exactly `sourceOptions(target, skill)`, persona entries labelled with learn level (`Agathion (Lv 7)`). A skill with no valid source shows why ("unique to Yoshitsune", "Mandrake cannot inherit Fire skills") instead of an empty select.
- **Descriptions.** Every row shows, under the skill name, its element, cost (`formatCost`) and the reference `effect` text verbatim.
- `BuildForm` owns a `Build` and reports it through `onChange(build)`.

**Tests (engine):**
- `inheritTier` at every boundary: 2→0, 3→1, 5→1, 6→2, 8→2, 9→3, 12→3, 13→4, 23→4, 24→5, 31→5, 32→6, 41→6, 42→6, 48→6.
- `maxInherited`: 2→4, 3→5, 4→6, 5→6, 6→6.
- `minTotalSkillsFor(inheritTier(n)) <= n` for every `n` from 0 to 48, and `inheritTier(minTotalSkillsFor(k)) === k` for `k` 0–6.
- `canPassTrait` false for a DLC persona and for a rare persona, true for `Agathion`. Every name in `DISPUTED_INHERIT_TYPE` exists in the data.
- `canInherit`: false for any `unique` skill on any persona; false for a `fire` skill on an `Ice` inheritor; true for a `passive` skill on a `Physical` inheritor.
- every skill element present in the data is either one of the 12 chart columns or one of `almighty`, `support`, `passive`.
- `inheritCapacity` for a persona with 3 base skills and 2 ingredients is 4; with 6 base skills it is 2; `inheritCapacity('Neko Shogun', 3)` is `min(5, 8 − its base skill count)`.
- `sourceOptions` for a skill the target learns natively lists `innate` first; never lists the target itself as a persona source; lists no persona when `canInherit(target, skill)` is false.

**Tests (UI):** choosing `Agathion` prefills 6 rows all `innate`; a persona that learns more than 8 skills prefills 8 and shows the rest as chips; changing the target replaces the rows; replacing a row's skill with one the target does not learn removes `innate` from its options; a unique skill of another persona shows the reason text; adding a 9th row is impossible; `onChange` receives the expected `Build`.

### - [ ] Task 7: Skill cards as a source

**Visible result:** rows can be set to "Skill card" when a card exists, and the row then lists where to get the card: normal electric chair, electric chair during a fusion alarm, negotiation.

**Files:** modify `src/engine/build.ts`, `src/ui/SkillRow.tsx`; create `src/ui/CardSourceList.tsx`, `tests/ui/CardSourceList.test.tsx`; extend `tests/ui/BuildForm.test.tsx`.

**Behaviour:**
- `sourceOptions` adds `{kind:'card'}` (after `innate`, before personas) when `hasCard(skill)` and the skill is not unique. Cards ignore the target's inheritance type.
- **Card sources.** A row whose source is `card` lists where the card comes from, in three labelled groups, omitting empty ones: "Electric chair: <personas>", "Electric chair during fusion alarm: <personas>", "Negotiation: <shadow (persona)>". Nothing about drops is shown (no data).
- A skill whose `acquisitionNote` is `Network Fusion` or `Fusion Mutation` shows that note as a hint next to the source select ("Reference notes: Network Fusion").

**Tests:** `sourceOptions` includes `card` for `Zio` and not for a unique skill or a skill with no card source; a skill the target cannot inherit but that has a card offers `card`; a row set to `card` for `Zio` shows "Electric chair: Agathion" and for `Mazio` shows "Electric chair during fusion alarm: Agathion"; a skill with only a negotiation source shows only that group; the Network Fusion hint appears for a skill with that note.

### - [ ] Task 8: "Already has it" source, validation and the inheritance counter

**Visible result:** rows gain the option "A persona I own already has it (e.g. Network Fusion)…"; invalid builds show inline errors; a counter shows how many skills are set to be inherited against the target's limit.

**Files:** modify `src/engine/build.ts`, `src/ui/SkillRow.tsx`, `src/ui/BuildForm.tsx`; create `tests/build.test.ts`; extend `tests/ui/BuildForm.test.tsx`.

**Produces:** `validateBuild(data, recipes, build): BuildError[]` where `BuildError = {code: string; message: string; row?: number}`.

| code | condition |
|---|---|
| `UNKNOWN_TARGET` / `UNKNOWN_SKILL` / `UNKNOWN_SOURCE_PERSONA` | name not in (DLC-filtered) data |
| `TOO_MANY_SKILLS` | more than 8 |
| `DUPLICATE_SKILL` | same skill twice |
| `NOT_INNATE` | source `innate` but target does not learn the skill |
| `NO_CARD` | source `card` but `hasCard(skill)` is false or skill is unique |
| `SOURCE_DOES_NOT_LEARN` | source kind `persona` and that persona does not natively learn the skill (message suggests "already has it") |
| `HELD_IS_NATIVE` | source kind `held` but that persona learns the skill natively (should be `persona`) |
| `HELD_UNIQUE` | source kind `held` and the skill is unique |
| `NOT_INHERITABLE` | source `persona` or `held` and `canInherit(target, skill)` is false |
| `SOURCE_IS_TARGET` | source persona equals target (should be `innate`; for `held` the message says the target already has the skill, so it cannot also be fused) |
| `TOO_MANY_INHERITED` | inherited count > `inheritCapacity(target, n)` for every recipe size the target has |
| `TRAIT_NOT_INHERITABLE` / `TRAIT_SOURCE_MISMATCH` | `canPassTrait(from)` is false (DLC or treasure demon), or `from` persona's own trait is not `name` |
| `TARGET_NOT_FUSABLE` | target is rare and anything must be inherited |

**Behaviour:**
- The source select always ends with "A persona I own already has it (e.g. Network Fusion)…", which reveals a persona input (datalist of all personas) and produces a `held` source. With this option available, a skill no persona learns natively is still selectable.
- `validateBuild` errors render inline next to the offending row.
- A counter under the rows shows `Inherited: K of C`, where `K` counts `persona` and `held` rows and `C` is the most the target can inherit in one fusion (`inheritCapacity` for its largest recipe size); it turns into the `TOO_MANY_INHERITED` error when exceeded.

**Tests:** one engine test per error code with a minimal failing build; one valid build returning `[]`; a `held` source on a persona that does not learn the skill is valid; UI: choosing the "already has it" option and a persona yields a `held` source in `onChange`; an invalid row shows its error text; the counter shows `Inherited: 1 of C` after one row is switched to a persona source.

### - [ ] Task 9: Show how far each source is from the target

**Visible result:** every persona entry in a source select is annotated with the minimum number of fusions needed to carry that skill to the target (`Agathion (Lv 7) · 1 fusion`), unreachable ones are marked `· no route` and sorted last; a `held` persona shows the same annotation once chosen.

**Files:** create `src/engine/reach.ts`, `tools/find-fixtures.mjs`, `tests/helpers/fixtures.ts` (generated, committed), `tests/reach.test.ts`, `tests/fixtures.test.ts`; modify `src/ui/SkillRow.tsx`, `src/ui/BuildForm.tsx`.

**Produces:** `skillReach(data, recipes, skill: string, source: string): Map<string, number>` — minimum number of fusions for each persona to end up holding `skill` originating from `source`, ignoring slot limits and other skills. `source` itself is `0`. `traitReach(data, recipes, source: string): Map<string, number>` — same for the source's own trait (no chart check; an ingredient for which `canPassTrait` is false never passes it on, and a source for which it is false yields only itself).

**Approach:** breadth-first relaxation over the recipe index: persona `X` gets distance `d+1` if some recipe for `X` has an ingredient at distance `d` and `canInherit(X, skill)`. Absent key = unreachable. In the UI compute lazily per (skill, source) and memoize.

**Tests (reach):**
- distance of the source persona is 0.
- a persona directly fusable from the source (taken from the golden file) with a compatible inherit type has distance 1.
- a persona whose inherit type forbids the element is absent.
- for every entry with distance `d > 0`, some recipe has an ingredient with distance `d − 1`.
- `traitReach` from a DLC persona contains only that persona.
- UI: a source at distance 1 is labelled `· 1 fusion`; an unreachable one `· no route` and listed after reachable ones.

**Also produces — fixture catalogue for the solver tasks:** `tools/find-fixtures.mjs` searches the data (no DLC, rare off) and writes `tests/helpers/fixtures.ts` exporting one concrete, named example for each of the following, so solver tests never have to invent their own. If none exists in the data, export `null` and the dependent test is skipped with a comment.
| export | definition |
|---|---|
| `DIRECT` | `{target, skill, source}` with `skillReach` distance 1 |
| `TWO_STEP` | same, distance exactly 2 |
| `HELD_DIRECT` | `{target, skill, source}` where `source` is an ingredient of a recipe for `target`, does **not** learn `skill` natively, the skill is not unique and `canInherit(target, skill)` |
| `TWO_SOURCES_ONE_RECIPE` | `{target, a: {skill, source}, b: {skill, source}}` where both sources are the two ingredients of one recipe and both skills pass `canInherit(target)` |
| `SAME_SOURCE_TWO_SKILLS` | `{target, source, skills: [s1, s2]}` at distance 1 |
| `SOURCE_MUST_CARRY` | `{target, a, b}` where `a.source` is a direct ingredient of `target` and `b.source` is at distance 1 from `a.source` for `b.skill` |
| `OVER_CAPACITY` | `{target, skills[]}` with more inheritable skills (each reachable alone) than `inheritCapacity(target, 2)` |
| `TRAIT_DIRECT` | `{target, trait, source}` with `traitReach` distance 1 |
| `ADVANCED_ONE` / `ADVANCED_TWO` | `Neko Shogun` with one skill from `Kodama`; with one from `Kodama` and one from `Sudama` |
| `ADVANCED_INTERMEDIATE` | a build whose every route passes a skill through a special persona |
| `MANY_RECIPES` | `{target, skill, source}` at distance 1 where at least 5 different partner personas work |
| `SIX_SKILLS` | a solvable build with 6 inherited skills |
| `UNREACHABLE` | `{target, skill, source}` where the skill is inheritable by the target but `skillReach` has no entry |

`tests/fixtures.test.ts` asserts each non-null fixture satisfies its definition, so a data refresh that invalidates one fails loudly.

---

## Phase 4 — Plans

### Solver overview (Tasks 10, 12, 13, 14, 15 build this in increments)

`solve(data, settings, build, opts?): Plan[]` is a backward search from the target. Final algorithm:

1. Split the build: `I` = skills with `persona` or `held` source (each tagged with its source persona; the two kinds are searched identically — the source persona supplies the skill as a leaf — and differ only in the leaf's `learns.level`, which is `null` for `held`); `T` = wanted non-own trait or null. `innate` and `card` skills play no part in the search.
2. If `I` is empty and `T` is null, return a single plan whose root has `recipe: null` (no fusion needed).
3. `make(X, need, trait, depth)` → cheapest `Node` for persona `X` that must end up holding the inherited skills `need ⊆ I` and trait `trait`:
   - Let `native` = skills in `need` whose source persona is `X`. Let `rest = need − native`. `trait` is satisfied for free if its source is `X`.
   - If `rest` is empty and trait is satisfied: return a leaf (`recipe: null`, `learns` = `native` with their learn levels).
   - If `depth === 0`: fail.
   - Prune: fail if any `s ∈ rest` has `skillReach(s).get(X)` missing or `> depth`; same for the trait with `traitReach`.
   - For each recipe of `X` with `|rest| ≤ inheritCapacity(X, recipe.ingredients.length)`: enumerate assignments of each skill in `rest` (and the trait, if unsatisfied) to one ingredient, skipping assignments where the ingredient's reach distance for that item exceeds `depth − 1`; recurse `make(ingredient_i, assigned_i, trait_i, depth − 1)`; combine the cheapest result of each ingredient.
   - Memoize on `(X, sorted need, trait, depth)`.
4. Iterative deepening `depth = 1 … settings.maxDepth`; stop at the first depth that yields plans.

An ingredient that is the designated source of a skill provides it natively even when it must itself be fused to carry other skills — that is what the `native`/`rest` split handles.

Until the task that adds a capability, `solve` throws `UnsupportedBuildError` (exported from `solver.ts`) for builds needing it, and the UI shows "This build needs <capability>, which is not supported yet" instead of a plan.

### - [ ] Task 10: First plans — one inherited skill

**Visible result:** a Solve button. For a build with at most one inherited skill it shows a fusion tree (nested list: which personas to fuse, which skill is inherited at each step, which leaf must be at what level). Builds with more show the "not supported yet" message.

**Files:** create `src/engine/solver.ts`, `src/ui/PlanTree.tsx`, `tests/helpers/replay.ts`, `tests/solver-1.test.ts`, `tests/ui/PlanTree.test.tsx`; modify `src/ui/App.tsx`.

**Produces:** `solve(data, settings, build): Plan[]` returning at most one plan (the best); `Node`, `Plan`, `UnsupportedBuildError`; test helper `replay(data, settings, build, plan): string[]` returning a list of violations (empty = plan is valid). The solver runs on the main thread for now (Task 16 moves it to a worker) with `DEFAULT_SETTINGS`.

**Scope:** steps 1–4 of the overview for a build with zero or one `persona`/`held` skill and no inherited trait, using 2-ingredient recipes only (multi-ingredient recipes are ignored). More than one inherited skill, an inherited trait, or a target that is an advanced-fusion (`special`) persona with something to inherit, throws `UnsupportedBuildError` naming the missing capability ("several inherited skills", "trait inheritance", "advanced fusion"). The Solve button is disabled while `validateBuild` returns errors.

**`replay` checks:** walking the tree bottom-up with the forward `fuse` (or the `specialCombos` entry for multi-ingredient nodes) reproduces each node's persona; every inherited skill passes `canInherit`; every fusion's inherit count ≤ `inheritCapacity`; every carried skill traces back to its designated source; every carried trait traces back to its source through ingredients for which `canPassTrait` is true; with `playerLevel` set, no fused node exceeds it.

**Tests** (every returned plan must also pass `replay`):
- build with only `innate` and `card` skills → one plan, 0 fusions, root `recipe: null`.
- `DIRECT` → 1 fusion; root ingredients include the source; `inherit` lists the skill.
- `TWO_STEP` → `fusions === 2`.
- `TWO_STEP` with `maxDepth: 1` returns `[]`.
- the source leaf's `learns` carries the skill's learn level.
- `HELD_DIRECT` with a `held` source → 1 fusion, same source leaf, `learns` is `[{skill, level: null}]`.
- a `held` source whose skill the target cannot inherit is rejected by `validateBuild`, and `solve` returns `[]` if called anyway.
- a build with two inherited skills throws `UnsupportedBuildError`; so does `ADVANCED_ONE`.
- UI: the tree for a 1-fusion plan shows both ingredients, the inherited skill and "Lv N" on the source leaf; the unsupported case shows the message; no plan found shows "No plan found within 4 fusions".

### - [ ] Task 11: Step-by-step instructions

**Visible result:** above the tree, a numbered list of instructions in the order to perform them: obtain each starting persona (with level), each fusion (what to inherit, how many skills the ingredients must hold), skill cards to use (with where to get them), and final leveling.

**Files:** create `src/engine/plan.ts`, `src/ui/PlanSteps.tsx`, `tests/plan.test.ts`, `tests/ui/PlanSteps.test.tsx`; modify `src/ui/App.tsx`.

**Produces:**
```ts
type Step =
  | {kind: 'obtain'; persona: string; levelTo: number | null; learns: string[];
     holds: string[] }       // skills from `held` sources: the user's own copy of this persona must already have them
  | {kind: 'fuse'; ingredients: string[]; result: string; inherit: string[];
     trait: {name: string; from: string} | null;   // non-own trait to take, and which ingredient has it
     skillsNeeded: number;   // minTotalSkillsFor(inherit.length)
     skillsHeld: number;     // sum over ingredients of their natural skill count (see below)
     disputedInheritType: boolean }  // result is in DISPUTED_INHERIT_TYPE and inherit is non-empty
  | {kind: 'card'; skill: string; cardSources: CardSources}
  | {kind: 'level'; persona: string; levelTo: number; learns: string[]};
toSteps(data, build, plan): Step[]
```
Order: post-order walk of the tree (ingredients before their fusion), then `card` steps, then a single final `level` step if any `innate` skill has learn level > base level. `levelTo` on `obtain` is the highest learn level among that leaf's `learns`, or null if it has none or all are 0 or null (a plain fusion partner or a `held`-only source). A leaf with a `held` skill puts that skill in `holds`, not `learns`.

An ingredient's natural skill count is `min(8, skills it learns at or below the level the plan requires of it (base level for plain partners) + skills it carries + skills it holds from `held` sources)`.

**Behaviour:** steps read "Persona X at Lv Y — knows Skill" for sources, "Your Persona X that already has Skill" for `held` sources, "Persona X" for plain partners. A `card` step lists its sources in the same three groups as the form (`CardSourceList`). A `fuse` step with `skillsHeld < skillsNeeded` shows "The ingredients must hold N skills in total to inherit K; add M more with skill cards or leveling first." A `fuse` step with `disputedInheritType` shows "Sources disagree on what <result> can inherit; check the fusion screen before committing." Skill and trait names carry their `effect` text as a tooltip (`title`). Each persona name links to `https://chinhodado.github.io/persona5_calculator/indexRoyal.html#/persona/<name>`.

**Tests:** a fusion inheriting 4 skills has `skillsNeeded === 13`; two ingredients with 3 natural skills each inheriting 2 give `skillsHeld: 6, skillsNeeded: 6`; inheriting 3 from the same pair gives `skillsNeeded: 9` (shortfall 3); `disputedInheritType` is true when inheriting into `Mandrake` and false when nothing is inherited; step order for a 2-fusion plan; `card` steps come after the last `fuse`; final `level` step uses the maximum learn level; a plain fusion partner has `levelTo: null`, `learns: []`, `holds: []`; a `held` leaf has the skill in `holds`; a 3-ingredient fusion produces one `fuse` step with 3 ingredients; UI: a fixture plan renders the expected step text, link targets, shortfall message and card source groups.

### - [ ] Task 12: Plans with several inherited skills

**Visible result:** builds with any number of inherited skills now get a plan.

**Files:** modify `src/engine/solver.ts`; create `tests/solver-2.test.ts`.

**Scope:** any number of `persona`/`held` skills (still 2-ingredient recipes, still no trait). Adds the assignment enumeration, the `inheritCapacity` check on every fusion, the `native`/`rest` split for a source that must itself be fused, and memoization. Removes the "more than one inherited skill" throw.

**Tests** (all plans pass `replay`):
- `TWO_SOURCES_ONE_RECIPE` → 1 fusion, each skill attributed to its own ingredient.
- `SAME_SOURCE_TWO_SKILLS` → both listed in one `inherit` from the same ingredient.
- `SOURCE_MUST_CARRY` → the first source appears as a fused (non-leaf) node whose `learns` has its own skill and `carries` has the other.
- `OVER_CAPACITY` returns `[]`.
- `SIX_SKILLS` at `maxDepth: 4` returns a plan within the Vitest default timeout — guards the pruning and memoization.
- Task 10's tests still pass (the two-skill half of the `UnsupportedBuildError` test is replaced by the first test above; the `ADVANCED_ONE` half stays until Task 14).

### - [ ] Task 13: Inherit a trait

**Visible result:** a trait picker, defaulting to the persona's own trait; choosing another trait and its source persona makes the plan route that trait to the target, and fusion steps say whose trait to take.

**Files:** create `src/ui/TraitPicker.tsx`, `tests/ui/TraitPicker.test.tsx`, `tests/solver-3.test.ts`; modify `src/engine/solver.ts`, `src/ui/BuildForm.tsx`, `src/ui/PersonaSummary.tsx` (trait display moves into the picker).

**Scope (engine):** inherited trait, assigned to exactly one ingredient per fusion, pruned with `traitReach`; an ingredient for which `canPassTrait` is false is never assigned the trait. Removes the trait throw.

**Behaviour (UI):**
- `<select>` whose default and first entry is the target's own innate trait, "Keep own (<name>)", followed by every trait some persona can pass on; choosing one reveals a second select of the personas that own it and can pass it (`canPassTrait`), annotated with `traitReach` distance like skill sources. Changing the target resets the trait to the new target's own.
- The selected trait's reference `effect` text is shown verbatim under the select (for "Keep own" too).
- Trait validation errors from Task 8 render next to the picker.

**Tests** (all plans pass `replay`):
- `TRAIT_DIRECT` → root `traitFrom` is non-null and the chain's leaf is the trait's source.
- trait and one skill from the same source persona → both travel through the same ingredient.
- trait and skill from different sources → 1 fusion when both are ingredients of one recipe.
- no returned plan ever routes a trait through a DLC persona or a treasure demon (run with all DLC owned and `allowRare: true`).
- UI: default is "Keep own"; for `Agathion` the default shows `Rare Antibody` and its effect text; changing the target resets the trait; a DLC-only trait is not listed; choosing a trait lists exactly the personas whose own trait it is and that can pass it; the fuse step shows "Trait: take <persona>'s <trait>".

### - [ ] Task 14: Advanced (multi-ingredient) fusion in plans

**Visible result:** advanced-fusion personas can be targets or intermediate steps of a plan that inherits skills or a trait; their fusion step lists all ingredients.

**Files:** modify `src/engine/solver.ts`; create `tests/solver-4.test.ts`.

**Scope:** multi-ingredient recipes take part in the search: assignment across all ingredients, capacity from `inheritCapacity(X, n)`. Removes the advanced-fusion throw, the last `UnsupportedBuildError`; delete the class and the UI message if nothing else uses them.

**Tests** (all plans pass `replay`):
- `ADVANCED_ONE` → exactly 1 fusion; root ingredients are `Kodama, Sudama, Anzu`; `inherit` lists the skill as coming from Kodama.
- `ADVANCED_TWO` → still 1 fusion, each skill attributed to its own ingredient.
- `ADVANCED_INTERMEDIATE` → a plan containing a node with more than 2 ingredients.
- a trait inherited into `Neko Shogun` from `Kodama` (if `canPassTrait`) → 1 fusion with `traitFrom` pointing at Kodama.
- `toSteps` on the `ADVANCED_ONE` plan gives one `fuse` step with 3 ingredients and `skillsNeeded` from `minTotalSkillsFor`.

### - [ ] Task 15: Alternative plans, ranked

**Visible result:** up to 5 plans as tabs, each labelled `N fusions · ~¥cost`, best first.

**Files:** modify `src/engine/solver.ts`, `src/ui/App.tsx`; create `src/ui/PlanList.tsx`, `tests/solver-5.test.ts`, `tests/ui/PlanList.test.tsx`.

**Produces:** `solve(data, settings, build, opts?: {maxPlans?: number; signal?: AbortSignal}): Plan[]` (`signal` is accepted here and honoured in Task 16).

**Scope:** return up to `maxPlans` (default 5) plans, sorted by `fusions`, then `cost`. Alternatives differ only at the root: at the first depth that succeeds, every (root recipe, skill/trait assignment) that works yields one candidate, each using the single cheapest subtree for every ingredient; keep the cheapest candidate per distinct root ingredient set, then take the best `maxPlans`. `make` itself keeps returning only the cheapest node.

**Tests** (all plans pass `replay`): `MANY_RECIPES` returns 5 plans, all with `fusions === 1`, in non-decreasing `cost`, no two with the same ingredient set at the root; a build with exactly one working recipe returns 1 plan; UI: tabs render with the expected labels and switching a tab swaps the steps and tree.

### - [ ] Task 16: Background solving with cancel and timeout

**Visible result:** the page stays responsive while solving; a "Solving…" state with a Cancel button; a 20-second timeout with a clear message.

**Files:** create `src/worker/solver.worker.ts`, `src/ui/useSolver.ts`, `tests/solver-abort.test.ts`; modify `src/engine/solver.ts`, `src/ui/App.tsx`, `src/ui/PlanList.tsx`.

**Produces:** `useSolver(build, settings): {status: 'idle'|'running'|'done'|'error'; plans: Plan[]; failure?: {code: string; message: string}; solve(): void; cancel(): void}` — posts to the worker, terminates and restarts the worker when the build changes mid-run or `cancel` is called, and enforces a 20 s timeout that surfaces as `failure.code = 'TIMEOUT'`. `solve` checks `signal.aborted` once per recipe iteration and throws an `AbortError`.

**Tests:** aborting via `signal` before the call rejects with `AbortError`; aborting during a `SIX_SKILLS` solve rejects; (hook, with a mocked worker) `cancel` returns status to `idle`, a build change mid-run terminates the worker, the timeout produces `TIMEOUT`.

---

## Phase 5 — Settings, explanations, sharing

### - [ ] Task 17: Settings — DLC, treasure demons, depth, player level

**Visible result:** a settings panel; owned DLC personas appear in every list; treasure-demon fusions can be allowed; maximum depth can be changed; setting a player level restricts plans to fusions the player can perform.

**Files:** create `src/ui/Settings.tsx`, `src/ui/useSettings.ts`, `tests/ui/Settings.test.tsx`, `tests/solver-settings.test.ts`; modify `src/ui/App.tsx`.

**Behaviour:** DLC checkboxes grouped per `dlcGroups`, "Allow treasure demon fusions" checkbox, max depth 1–6, "Player level" number input 1–99 (empty = ignore the restriction). `useSettings` persists to `localStorage` and falls back to `DEFAULT_SETTINGS` when storage is unavailable or the stored value is malformed. Changing a setting rebuilds data, fusion and recipe index, and re-validates the build.

**Tests:**
- defaults equal `DEFAULT_SETTINGS`; clearing the player level yields `null`; malformed stored JSON falls back to defaults; toggling a DLC group adds all its personas.
- with `playerLevel` set, no fused node in any returned plan has a base level above it; a target above it with something to inherit returns `[]`; the same build with `playerLevel: null` returns plans (all pass `replay`).
- with `allowRare: false` no plan contains a rare persona as an ingredient of a fusion with a non-rare one.
- enabling a DLC group makes its personas selectable as target.

### - [ ] Task 18: Explain why there is no plan

**Visible result:** when no plan exists the page says why and what would fix it ("Needs player level 54", "Only possible with treasure demon fusions enabled", "Agathion cannot pass Zio to this persona by any chain").

**Files:** create `src/engine/diagnostics.ts`, `tests/diagnostics.test.ts`; modify `src/worker/solver.worker.ts`, `src/ui/PlanList.tsx`.

**Produces:** `explainFailure(data, settings, build): {code: string; message: string; skill?: string}`, called by the worker when `solve` returns `[]`. Checks run in this order:
- `SKILL_UNREACHABLE` — some skill's `skillReach` (or the trait's `traitReach`) has no entry for the target even with rare fusions, all DLC and no player level (names the skill or trait).
- `NEEDS_HIGHER_LEVEL` — solvable only with `playerLevel: null`; the message states the lowest player level that works (the highest base level among fused personas in the best unrestricted plan).
- `NEEDS_RARE` — solvable only with `allowRare: true`.
- `NEEDS_DLC` — solvable only with all DLC owned.
- `DEPTH_TOO_LOW` — reachable, but the largest reach distance exceeds `maxDepth` (message states the depth needed).
- `COMBINATION_INFEASIBLE` — each item reachable alone but not together within `maxDepth`.

**Tests:** one per code (`UNREACHABLE` fixture for the first); UI renders the message for a fixture failure.

### - [ ] Task 19: Shareable link

**Visible result:** the address bar always reflects the current build and settings; opening a copied link restores them and the plan.

**Files:** create `src/ui/urlState.ts`, `tests/urlState.test.ts`; modify `src/ui/App.tsx`, `README.md`.

**Produces:** `encodeState(build, settings): string` / `decodeState(hash: string): {build, settings} | null` (JSON → `encodeURIComponent`; invalid or stale hashes return null, never throw). The encoded object carries a game key, `g: "p5r"`; `decodeState` returns null for any other value. This is the only second-game provision in the code: it keeps today's shared links valid if another game is added later. The app writes the hash on every change and reads it on load; the URL hash wins over `localStorage` when present. README gets a final pass: what the app does, `npm run data` for refreshing vendored data, the pinned SHA, the attribution, the manual deploy steps.

**Tests:** round-trip of a full build including `Arsène`, `Queen's Necklace` and `Orpheus F`, a `held` source and an inherited trait; `decodeState('garbage') === null`; a hash with `g: "p3r"` decodes to null; a hash naming a persona absent from the data decodes, then fails validation instead of crashing.

---

## Review Focus

Conditions most likely to bite a real user; each is pinned by a test in the task named.

1. **Ingredients hold too few skills to inherit what the plan asks** (the inherit count depends on their total skill count) → the fuse step states the total needed and the shortfall (Task 11); boundaries pinned in Task 6.
2. **Target's base skills fill its slots** so the requested inherited skills do not fit → `TOO_MANY_INHERITED` (Task 8) rather than a plan that cannot be executed.
3. **Treasure-demon recipes depend on the main ingredient's current level**, which changes when the plan also asks to level it → rare fusions are excluded from plans by default (`DEFAULT_SETTINGS`; toggle in Task 17), the Fusion check panel states its base-level assumption (Task 3), and `NEEDS_RARE` explains when enabling would help (Task 18).
4. **Search blow-up** for 6–8 inherited skills at depth 4+ → reach-based pruning and memoization (Tasks 10 and 12, guarded by the `SIX_SKILLS` test), worker cancellation and 20 s timeout (Task 16).
5. **Names with special characters** (`Arsène`, `Queen's Necklace`, `Orpheus F`) in URL state and links → round-trip test in Task 19.

## Product Decisions (settled)

- Fusion alarm and gallows (strengthening) stay out of v1.
- Player level is an optional setting; unset ignores the restriction.
- Ranking is fewest fusions, then lowest approximate cost.
- Starting personas are listed with the level they need; the plan does not explain how to acquire them.
- Advanced (multi-ingredient) fusion personas are supported as targets, intermediates and leaves.
- Treasure-demon extra traits and the "bonus trait" for duplicate traits are out of v1.
- Skill and trait descriptions are the reference's `effect` text, verbatim. Skill card sources shown are normal electric chair, alarm electric chair and negotiation; battle drops are not shown (no data).
- Hosting is GitHub Pages on the default address; the site is deployed from Task 1 and every task is a vertical slice.
- Network Fusion skills are supported through the `held` source: the user names the persona that already has the skill and the planner routes it from there.
- Project code is licensed Apache-2.0 (Copyright 2026 Jamkasz), matching the vendored reference; NOTICE carries the upstream attribution.

## Future: a second game (not part of this plan)

The product owner is considering adding Persona 3 Reload later. **Nothing in Tasks 1–19 builds toward it**: no game switch, no game selector, no abstraction layer, no second data folder. Those arrive only with their own plan and their own slices. This note exists so that nothing done now makes that harder.

What this plan does about it, and nothing more:
- Game-neutral names in `src/` (Global Constraints).
- A game key in shared links (Task 19).
- When creating the GitHub repository (Task 1 manual step), prefer a game-neutral name, because it becomes part of the site's address.

What is already naturally isolated, should that plan ever be written: the data (`vendor/reference/`, `tools/build-data.mjs`, `game-data.json`), the researched rules (`engine/rules.ts`) and the forward fusion rules (`engine/fusion.ts`). The solver, reachability, plan steps, form and sharing do not depend on which game the data describes.

Known starting points for that future plan (unverified beyond the first point):
- The reference site used here has no P3R version. `aqiu384/megaten-fusion-tool` has a P3R dataset under `src/app/p3r/data/` (personas, skills, fusion chart, special recipes, config, Episode Aigis). Its contents and licence have not been examined.
- Expected differences: no traits, no treasure demons, different skill-card sources, its own inheritance chart and inherit-count rules, possibly different level rules. Each needs the same research and golden-parity treatment P5R received.

## Open Items for the Product Owner (in-game checks; none blocks implementation)

1. Inheritance type of Clotho, Hecatoncheires, Macabre, Mandrake and Maria (the two data sources disagree; the reference is used and the app warns).
2. Whether ingredients holding exactly 12 skills in total allow 3 or 4 inherited skills (3 is assumed).
3. Whether a freshly fused persona's base skills reduce the slots available for inheritance (assumed yes).
