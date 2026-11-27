import { useMemo, useState } from 'react'
import { DEFAULT_SETTINGS } from '../settings'
import { loadGameData } from '../data/load'
import type { Persona } from '../data/types'
import { createFusion } from '../engine/fusion'
import { buildRecipeIndex } from '../engine/recipes'
import TargetPicker from './TargetPicker'
import PersonaSummary from './PersonaSummary'
import RecipeList from './RecipeList'
import FusionCheck from './FusionCheck'

export const PINNED_COMMIT = '802422dad1f5b9eee441e594e738aceaeb9e5a85'
export const SHORT_COMMIT = PINNED_COMMIT.slice(0, 7)
export const REFERENCE_SITE_URL =
  'https://chinhodado.github.io/persona5_calculator/indexRoyal.html'
export const REFERENCE_COMMIT_URL = `https://github.com/chinhodado/persona5_calculator/commit/${PINNED_COMMIT}`

const gameData = loadGameData(DEFAULT_SETTINGS)

export default function App() {
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null)

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

  return (
    <main className="app">
      <h1>Inverse Fusion Calculator</h1>
      <p className="description">
        Plan a Persona 5 Royal fusion backwards: choose a target persona and
        the skills and trait it should have.
      </p>

      <TargetPicker personas={gameData.personas} onSelect={setSelectedPersona} />
      {selectedPersona ? (
        <>
          <PersonaSummary persona={selectedPersona} data={gameData} />
          <RecipeList
            key={selectedPersona.name}
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
