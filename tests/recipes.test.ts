import { describe, expect, it } from 'vitest'
import { loadGameData } from '../src/data/load'
import type { GameData } from '../src/data/types'
import { createFusion } from '../src/engine/fusion'
import { buildRecipeIndex } from '../src/engine/recipes'
import goldenSource from './golden/fusions.json?raw'

// Exercise the DLC-filtered data by default; the all-DLC golden section is used
// only for the count-parity test, which needs the data the golden was built
// from.
const noDlcData = loadGameData({ ownedDlc: [] })

// Parsed from a raw string so TypeScript does not infer a literal type from
// ~21k keys.
const golden = JSON.parse(goldenSource) as {
  noDlc: Record<string, string | null>
}

function defaultIndex(data: GameData = noDlcData) {
  return buildRecipeIndex(data, createFusion(data, { allowRare: false }), null)
}

function costForLevel(level: number): number {
  return 27 * level * level + 126 * level + 2147
}

describe('buildRecipeIndex', () => {
  it("builds Neko Shogun's single three-ingredient recipe", () => {
    const index = defaultIndex()
    const recipes = index.get('Neko Shogun') ?? []

    expect(recipes).toHaveLength(1)
    const [recipe] = recipes
    expect(recipe.result).toBe('Neko Shogun')
    expect(recipe.ingredients).toEqual(['Kodama', 'Sudama', 'Anzu'])
    expect(recipe.cost).toBe(41064)
    expect(recipe.cost).toBe(
      costForLevel(11) + costForLevel(17) + costForLevel(25),
    )
  })

  it('gives every rare persona an empty recipe list', () => {
    const index = defaultIndex()
    const rarePersonas = noDlcData.personas.filter((persona) => persona.rare)

    expect(rarePersonas.length).toBeGreaterThan(0)
    for (const persona of rarePersonas) {
      expect(index.get(persona.name)).toEqual([])
    }
  })

  it('keeps every two-ingredient recipe consistent with fuse', () => {
    const index = defaultIndex()
    const fusion = createFusion(noDlcData, { allowRare: false })
    let checked = 0

    for (const recipes of index.values()) {
      for (const recipe of recipes) {
        if (recipe.ingredients.length !== 2) continue
        checked += 1
        expect(
          fusion.fuse(recipe.ingredients[0], recipe.ingredients[1]),
        ).toBe(recipe.result)
      }
    }

    expect(checked).toBeGreaterThan(0)
  })

  it('matches golden recipe counts for ordinary personas', () => {
    // The golden file was generated with rare fusions enabled, so the index
    // used for comparison must be too.
    const index = buildRecipeIndex(
      noDlcData,
      createFusion(noDlcData, { allowRare: true }),
      null,
    )
    const goldenResults = golden.noDlc

    for (const persona of ['Mokoi', 'Agathion', 'Slime']) {
      let expected = 0
      for (const [key, result] of Object.entries(goldenResults)) {
        if (result !== persona) continue
        const [first, second] = key.split('|')
        // Mimic the engine's drop of a recipe whose ingredients include its
        // own result.
        if (first === persona || second === persona) continue
        expected += 1
      }

      expect(expected).toBeGreaterThan(0)
      expect(index.get(persona)).toHaveLength(expected)
    }
  })

  it('applies the player level restriction to results only', () => {
    const unlimited = buildRecipeIndex(
      noDlcData,
      createFusion(noDlcData, { allowRare: false }),
      null,
    )
    const limited = buildRecipeIndex(
      noDlcData,
      createFusion(noDlcData, { allowRare: false }),
      10,
    )

    let below = 0
    let above = 0
    for (const persona of noDlcData.personas) {
      if (persona.level > 10) {
        above += 1
        expect(limited.get(persona.name)).toEqual([])
      } else {
        below += 1
        expect(limited.get(persona.name)).toEqual(
          unlimited.get(persona.name),
        )
      }
    }

    expect(below).toBeGreaterThan(0)
    expect(above).toBeGreaterThan(0)
  })

  it('only references personas present in the DLC-filtered data', () => {
    const index = defaultIndex()
    const names = new Set(noDlcData.personas.map((persona) => persona.name))

    expect([...index.keys()].sort()).toEqual([...names].sort())
    // The DLC-only multi-source combo must be skipped entirely when its result
    // is absent from the filtered data.
    expect(index.has('Izanagi-no-Okami')).toBe(false)

    for (const [result, recipes] of index) {
      for (const recipe of recipes) {
        expect(recipe.result).toBe(result)
        expect(names.has(recipe.result)).toBe(true)
        for (const ingredient of recipe.ingredients) {
          expect(names.has(ingredient)).toBe(true)
        }
      }
    }
  })

  it('sorts each list by cost ascending', () => {
    const index = defaultIndex()
    const recipes = index.get('Ananta') ?? []

    expect(recipes.length).toBeGreaterThan(1)
    for (let i = 1; i < recipes.length; i += 1) {
      expect(recipes[i - 1].cost).toBeLessThanOrEqual(recipes[i].cost)
    }
  })
})
