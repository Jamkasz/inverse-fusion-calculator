import type { GameData } from '../data/types'
import { canInherit } from './inheritance'
import { canPassTrait } from './rules'
import type { Recipe } from './recipes'

/** Ingredient persona -> every persona a recipe can turn it into. */
function buildIngredientIndex(
  recipes: Map<string, Recipe[]>,
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()

  for (const [result, resultRecipes] of recipes) {
    for (const recipe of resultRecipes) {
      for (const ingredient of recipe.ingredients) {
        const results = index.get(ingredient)
        if (results) results.add(result)
        else index.set(ingredient, new Set([result]))
      }
    }
  }

  return index
}

/**
 * Minimum number of fusions needed for each persona to end up holding `skill`
 * when the chain starts at `source`. `source` must exist in `data`; it is always
 * distance 0 and every other key is a reachable result.
 *
 * Expansion ignores slot limits, other skills and whether the remaining
 * ingredients are reachable: a result only needs one ingredient at distance
 * `d` and must itself be able to inherit `skill`. Absent keys are unreachable.
 */
export function skillReach(
  data: GameData,
  recipes: Map<string, Recipe[]>,
  skill: string,
  source: string,
): Map<string, number> {
  const distances = new Map<string, number>()
  if (!data.personas.some((persona) => persona.name === source)) {
    return distances
  }

  const ingredientIndex = buildIngredientIndex(recipes)
  distances.set(source, 0)
  const queue: string[] = [source]

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]
    const distance = distances.get(current)
    if (distance === undefined) continue

    for (const result of ingredientIndex.get(current) ?? []) {
      if (distances.has(result)) continue
      if (!canInherit(data, result, skill)) continue
      distances.set(result, distance + 1)
      queue.push(result)
    }
  }

  return distances
}

/**
 * Minimum number of fusions needed to pass `source`'s own trait on to each
 * persona reachable through the recipe index. There is no inheritance-chart
 * check, but a persona that cannot pass a trait never expands the search and a
 * source that cannot pass its trait yields only itself. Unknown sources yield
 * an empty map.
 */
export function traitReach(
  data: GameData,
  recipes: Map<string, Recipe[]>,
  source: string,
): Map<string, number> {
  const distances = new Map<string, number>()
  const sourcePersona = data.personas.find(
    (persona) => persona.name === source,
  )
  if (!sourcePersona) return distances

  distances.set(source, 0)
  if (!canPassTrait(sourcePersona)) return distances

  const ingredientIndex = buildIngredientIndex(recipes)
  const personaByName = new Map(
    data.personas.map((persona) => [persona.name, persona]),
  )
  const queue: string[] = [source]

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]
    const distance = distances.get(current)
    if (distance === undefined) continue

    const currentPersona = personaByName.get(current)
    if (!currentPersona || !canPassTrait(currentPersona)) continue

    for (const result of ingredientIndex.get(current) ?? []) {
      if (distances.has(result)) continue
      distances.set(result, distance + 1)
      queue.push(result)
    }
  }

  return distances
}
