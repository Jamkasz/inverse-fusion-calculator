import { useCallback, useMemo, useState } from 'react'
import { DEFAULT_SETTINGS } from '../settings'
import { loadGameData } from '../data/load'
import type { Persona } from '../data/types'
import type { Build } from '../engine/build'
import { validateBuild } from '../engine/build'
import { createFusion } from '../engine/fusion'
import { buildRecipeIndex } from '../engine/recipes'
import type { Plan } from '../engine/solver'
import { UnsupportedBuildError, solve } from '../engine/solver'
import { toSteps } from '../engine/plan'
import TargetPicker from './TargetPicker'
import PersonaSummary from './PersonaSummary'
import BuildForm from './BuildForm'
import PlanSteps from './PlanSteps'
import PlanTree from './PlanTree'
import RecipeList from './RecipeList'
import FusionCheck from './FusionCheck'

export const PINNED_COMMIT = '802422dad1f5b9eee441e594e738aceaeb9e5a85'
export const SHORT_COMMIT = PINNED_COMMIT.slice(0, 7)
export const REFERENCE_SITE_URL =
  'https://chinhodado.github.io/persona5_calculator/indexRoyal.html'
export const REFERENCE_COMMIT_URL = `https://github.com/chinhodado/persona5_calculator/commit/${PINNED_COMMIT}`

const gameData = loadGameData(DEFAULT_SETTINGS)

type SolveResult =
  | { kind: 'plans'; plans: Plan[] }
  | { kind: 'unsupported'; message: string }

export default function App() {
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null)
  const [build, setBuild] = useState<Build | null>(null)
  const [solveResult, setSolveResult] = useState<SolveResult | null>(null)

  // Memoized on the module-level game data; Task 17 will add the editable
  // settings to the dependencies.
  const recipeIndex = useMemo(() => {
    const fusion = createFusion(gameData, {
      allowRare: DEFAULT_SETTINGS.allowRare,
    })
    return buildRecipeIndex(
      gameData,
      fusion,
      DEFAULT_SETTINGS.playerLevel,
    )
  }, [gameData])

  // Stable so BuildForm's onChange effect cannot loop on a fresh callback.
  const handleBuildChange = useCallback((next: Build) => {
    setBuild(next)
    setSolveResult(null)
  }, [])

  // Clear the old build and plan immediately on a target change, before the
  // new BuildForm has a chance to report its build.
  const handlePersonaSelect = useCallback((persona: Persona | null) => {
    setSelectedPersona(persona)
    setBuild(null)
    setSolveResult(null)
  }, [])

  const validationErrors =
    build === null ? [] : validateBuild(gameData, recipeIndex, build)

  function handleSolve() {
    if (build === null || build.target !== selectedPersona?.name) return
    try {
      const plans = solve(gameData, DEFAULT_SETTINGS, build)
      setSolveResult({ kind: 'plans', plans })
    } catch (error) {
      if (error instanceof UnsupportedBuildError) {
        setSolveResult({ kind: 'unsupported', message: error.message })
      } else {
        throw error
      }
    }
  }

  return (
    <main className="app">
      <h1>Inverse Fusion Calculator</h1>
      <p className="description">
        Plan a Persona 5 Royal fusion backwards: choose a target persona and
        the skills and trait it should have.
      </p>

      <TargetPicker personas={gameData.personas} onSelect={handlePersonaSelect} />
      {selectedPersona ? (
        <>
          <PersonaSummary persona={selectedPersona} />
          <BuildForm
            key={selectedPersona.name}
            persona={selectedPersona}
            data={gameData}
            recipes={recipeIndex}
            onChange={handleBuildChange}
          />
          <section className="solve-panel">
            <button
              type="button"
              className="solve-button"
              onClick={handleSolve}
              disabled={build === null || validationErrors.length > 0}
            >
              Solve
            </button>
            {solveResult?.kind === 'unsupported' ? (
              <p className="solve-error" role="alert">
                {solveResult.message}
              </p>
            ) : null}
            {solveResult?.kind === 'plans' &&
            solveResult.plans.length > 0 &&
            build !== null ? (
              <>
                <PlanSteps
                  steps={toSteps(gameData, build, solveResult.plans[0])}
                  data={gameData}
                />
                <PlanTree plan={solveResult.plans[0]} />
              </>
            ) : null}
            {solveResult?.kind === 'plans' &&
            solveResult.plans.length === 0 ? (
              <p className="solve-empty">
                No plan found within {DEFAULT_SETTINGS.maxDepth} fusions
              </p>
            ) : null}
          </section>
          <RecipeList
            key={`recipes-${selectedPersona.name}`}
            persona={selectedPersona}
            recipes={recipeIndex.get(selectedPersona.name) ?? []}
          />
        </>
      ) : null}

      <FusionCheck data={gameData} />

      <footer>
        <p>
          Built on the{' '}
          <a href={REFERENCE_SITE_URL} target="_blank" rel="noreferrer">
            Persona 5 fusion calculator
          </a>{' '}
          by chinhodado, pinned at commit{' '}
          <a href={REFERENCE_COMMIT_URL} target="_blank" rel="noreferrer">
            <code>{SHORT_COMMIT}</code>
          </a>{' '}
          (<code>{PINNED_COMMIT}</code>). Game data is vendored from that
          repository and used under the{' '}
          <a href="./LICENSE" target="_blank" rel="noreferrer">
            Apache License 2.0
          </a>
          ; see{' '}
          <a href="./NOTICE" target="_blank" rel="noreferrer">
            NOTICE
          </a>
          .
        </p>
      </footer>
    </main>
  )
}
