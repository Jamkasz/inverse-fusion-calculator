import { describe, expect, it } from 'vitest'
import { loadGameData } from '../src/data/load'
import { createFusion } from '../src/engine/fusion'
import { canInherit } from '../src/engine/inheritance'
import { buildRecipeIndex } from '../src/engine/recipes'
import type { Recipe } from '../src/engine/recipes'
import { skillReach, traitReach } from '../src/engine/reach'

// Exercise the no-DLC, rare-off data unless a test explicitly needs DLC.
const data = loadGameData({ ownedDlc: [] })
const recipes = buildRecipeIndex(
  data,
  createFusion(data, { allowRare: false }),
  null,
)

// `dlcGroups` survives DLC filtering, so it lists every DLC persona name.
const allDlcData = loadGameData({ ownedDlc: data.dlcGroups.flat() })
const allDlcRecipes = buildRecipeIndex(
  allDlcData,
  createFusion(allDlcData, { allowRare: false }),
  null,
)

/**
 * Every persona at distance d > 0 must have a recipe with an ingredient at
 * distance d - 1; otherwise the reported distance is not a real shortcut.
 */
function expectTightDistances(
  reach: Map<string, number>,
  index: Map<string, Recipe[]>,
): void {
  for (const [persona, distance] of reach) {
    if (distance === 0) continue
    const personaRecipes = index.get(persona) ?? []
    const hasPredecessor = personaRecipes.some((recipe) =>
      recipe.ingredients.some(
        (ingredient) => reach.get(ingredient) === distance - 1,
      ),
    )
    expect(hasPredecessor, `${persona} at distance ${distance}`).toBe(true)
  }
}

describe('skillReach', () => {
  it('keeps the source persona at distance 0', () => {
    expect(skillReach(data, recipes, 'Zio', 'Pixie').get('Pixie')).toBe(0)
  })

  it('keeps a source at distance 0 even when it cannot inherit its own skill', () => {
    expect(canInherit(data, 'Yoshitsune', 'Hassou Tobi')).toBe(false)
    expect(
      skillReach(data, recipes, 'Hassou Tobi', 'Yoshitsune').get('Yoshitsune'),
    ).toBe(0)
  })

  it('reaches Agathion from Pixie in one fusion', () => {
    expect(skillReach(data, recipes, 'Zio', 'Pixie').get('Agathion')).toBe(1)
  })

  it('reaches Abaddon from Ananta in exactly two fusions through Defense Master', () => {
    const reach = skillReach(data, recipes, 'Defense Master', 'Ananta')

    expect(reach.get('Ananta')).toBe(0)
    expect(reach.get('Abaddon')).toBe(2)
    expectTightDistances(reach, recipes)
  })

  it('reports only tight distances for a direct reach too', () => {
    expectTightDistances(skillReach(data, recipes, 'Zio', 'Pixie'), recipes)
  })

  it('does not carry Fire to an Ice persona or Wind to a persona without Wind', () => {
    expect(canInherit(data, 'Jack Frost', 'Agi')).toBe(false)
    expect(skillReach(data, recipes, 'Agi', 'Cait Sith').has('Jack Frost')).toBe(
      false,
    )
    expect(canInherit(data, 'Agathion', 'Vacuum Wave')).toBe(false)
    expect(
      skillReach(data, recipes, 'Vacuum Wave', 'Hastur').has('Agathion'),
    ).toBe(false)
  })

  it('returns an empty map for an unknown source persona', () => {
    expect(skillReach(data, recipes, 'Zio', 'Not A Persona').size).toBe(0)
  })

  it('returns only the source for an unknown skill', () => {
    const reach = skillReach(data, recipes, 'Not A Skill', 'Pixie')
    expect([...reach.entries()]).toEqual([['Pixie', 0]])
  })
})

describe('traitReach', () => {
  it("carries Pixie's Static Electricity to Agathion in one fusion", () => {
    const reach = traitReach(data, recipes, 'Pixie')
    expect(reach.get('Pixie')).toBe(0)
    expect(reach.get('Agathion')).toBe(1)
  })

  it('records a DLC intermediate but does not let it pass the trait on', () => {
    // Agathion -> Orpheus -> Pixie. Orpheus is DLC, so it may receive the trait
    // but cannot pass it to Pixie.
    const fakeRecipes = new Map<string, Recipe[]>([
      ['Orpheus', [{ result: 'Orpheus', ingredients: ['Agathion'], cost: 0 }]],
      ['Pixie', [{ result: 'Pixie', ingredients: ['Orpheus'], cost: 0 }]],
    ])

    const reach = traitReach(allDlcData, fakeRecipes, 'Agathion')
    expect(reach.get('Agathion')).toBe(0)
    expect(reach.get('Orpheus')).toBe(1)
    expect(reach.has('Pixie')).toBe(false)
  })

  it('records a rare intermediate but does not let it pass the trait on', () => {
    // Agathion -> Regent -> Pixie. Regent is a rare treasure demon.
    const fakeRecipes = new Map<string, Recipe[]>([
      ['Regent', [{ result: 'Regent', ingredients: ['Agathion'], cost: 0 }]],
      ['Pixie', [{ result: 'Pixie', ingredients: ['Regent'], cost: 0 }]],
    ])

    const reach = traitReach(data, fakeRecipes, 'Agathion')
    expect(reach.get('Agathion')).toBe(0)
    expect(reach.get('Regent')).toBe(1)
    expect(reach.has('Pixie')).toBe(false)
  })

  it('keeps DLC Orpheus to itself when every DLC is owned', () => {
    const reach = traitReach(allDlcData, allDlcRecipes, 'Orpheus')
    expect([...reach.keys()]).toEqual(['Orpheus'])
  })

  it('keeps the rare Regent to itself', () => {
    const reach = traitReach(data, recipes, 'Regent')
    expect([...reach.keys()]).toEqual(['Regent'])
  })

  it('returns an empty map for an unknown source persona', () => {
    expect(traitReach(data, recipes, 'Not A Persona').size).toBe(0)
  })
})
