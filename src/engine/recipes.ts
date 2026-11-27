import type { GameData, Persona } from '../data/types'

export type Recipe = { result: string; ingredients: string[]; cost: number }

type Fusion = { fuse(a: string, b: string): string | null }

/** The reference's approximate fusion cost for one ingredient at `level`. */
function approximateCost(level: number): number {
  return 27 * level * level + 126 * level + 2147
}

function compareRecipes(a: Recipe, b: Recipe): number {
  if (a.cost !== b.cost) return a.cost - b.cost
  const aKey = a.ingredients.join('\u0000')
  const bKey = b.ingredients.join('\u0000')
  if (aKey < bKey) return -1
  if (aKey > bKey) return 1
  return 0
}

/**
 * Reverse fusion index: every persona in `data` maps to all recipes that can
 * produce it. Pairwise results come from `fusion`; special combos with more than
 * two sources are added directly. Recipes are sorted by approximate cost.
 *
 * When `playerLevel` is set, personas above that base level get an empty list
 * (they cannot be the result of a fusion at that level), but they remain
 * available as ingredients.
 */
export function buildRecipeIndex(
  data: GameData,
  fusion: Fusion,
  playerLevel: number | null,
): Map<string, Recipe[]> {
  const index = new Map<string, Recipe[]>()
  const personaByName = new Map<string, Persona>()

  for (const persona of data.personas) {
    index.set(persona.name, [])
    personaByName.set(persona.name, persona)
  }

  function canBeResult(name: string): boolean {
    const persona = personaByName.get(name)
    if (!persona) return false
    return playerLevel === null || persona.level <= playerLevel
  }

  function addRecipe(result: string, ingredients: string[]): void {
    if (!canBeResult(result)) return
    // A persona can never be one of its own ingredients.
    if (ingredients.includes(result)) return

    const recipes = index.get(result)
    if (!recipes) return

    let cost = 0
    for (const ingredient of ingredients) {
      const persona = personaByName.get(ingredient)
      if (!persona) return
      cost += approximateCost(persona.level)
    }

    recipes.push({ result, ingredients, cost })
  }

  const personas = data.personas
  for (let i = 0; i < personas.length; i += 1) {
    for (let j = i + 1; j < personas.length; j += 1) {
      const result = fusion.fuse(personas[i].name, personas[j].name)
      if (result === null) continue
      addRecipe(result, [personas[i].name, personas[j].name])
    }
  }

  for (const combo of data.specialCombos) {
    if (combo.sources.length <= 2) continue
    if (!personaByName.has(combo.result)) continue
    if (combo.sources.some((name) => !personaByName.has(name))) continue
    // Preserve the authored source order for multi-ingredient recipes.
    addRecipe(combo.result, combo.sources.slice())
  }

  for (const recipes of index.values()) {
    recipes.sort(compareRecipes)
  }

  return index
}
