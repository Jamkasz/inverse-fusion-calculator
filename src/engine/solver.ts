import type { GameData, Persona } from '../data/types'
import type { Settings } from '../settings'
import type { Build } from './build'
import { validateBuild } from './build'
import { createFusion } from './fusion'
import { inheritCapacity } from './inheritance'
import { buildRecipeIndex } from './recipes'
import { canPassTrait } from './rules'
import { skillReach, traitReach } from './reach'

export type Node = {
  persona: string
  carries: string[]
  learns: { skill: string; level: number | null }[]
  carriesTrait: string | null
  recipe: null | {
    ingredients: Node[]
    inherit: { skill: string; from: number }[]
    traitFrom: number | null
  }
}

export type Plan = { root: Node; fusions: number; cost: number }

/** One inherited skill, tagged with the persona that supplies it as a leaf. */
type Need = {
  skill: string
  source: string
  kind: 'persona' | 'held'
}

/** One inherited trait, tagged with the persona whose own trait it is. */
type TraitNeed = {
  name: string
  source: string
}

type Result = { node: Node; fusions: number; cost: number }

/** Fewest fusions wins, then the lowest approximate cost. */
function isCheaper(a: Result, b: Result): boolean {
  if (a.fusions !== b.fusions) return a.fusions < b.fusions
  return a.cost < b.cost
}

function makeNode(
  persona: string,
  overrides: Partial<Pick<Node, 'carries' | 'learns' | 'carriesTrait' | 'recipe'>>,
): Node {
  return {
    persona,
    carries: overrides.carries ?? [],
    learns: overrides.learns ?? [],
    carriesTrait: overrides.carriesTrait ?? null,
    recipe: overrides.recipe ?? null,
  }
}

/** A stable order for needs, so memo keys and output do not depend on input. */
function compareNeeds(a: Need, b: Need): number {
  if (a.skill !== b.skill) return a.skill < b.skill ? -1 : 1
  if (a.source !== b.source) return a.source < b.source ? -1 : 1
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1
  return 0
}

/**
 * Backward search for a build with any number of inherited skills and an
 * optional inherited trait, across two-ingredient and advanced
 * (multi-ingredient) recipes. Every inherited skill is assigned to one
 * ingredient at each fusion; a non-own trait is assigned to exactly one
 * ingredient that can pass it. The search enumerates those assignments, prunes
 * with reach distances and inheritance capacity, and memoizes. Returns at most
 * one plan: the fewest fusions, then the lowest approximate cost. Builds that
 * fail validation return an empty list.
 */
export function solve(
  data: GameData,
  settings: Settings,
  build: Build,
): Plan[] {
  const needs: Need[] = []
  for (const row of build.skills) {
    if (row.source.kind === 'persona' || row.source.kind === 'held') {
      needs.push({
        skill: row.name,
        source: row.source.persona,
        kind: row.source.kind,
      })
    }
  }
  needs.sort(compareNeeds)

  const target = data.personas.find(
    (persona) => persona.name === build.target,
  )

  // An explicit "keep own" request (the target's own trait, sourced from the
  // target) is the same as no trait request at all.
  const keepsOwnTrait =
    build.trait !== null &&
    build.trait.from === build.target &&
    target?.trait === build.trait.name

  const traitNeed: TraitNeed | null =
    build.trait === null || keepsOwnTrait
      ? null
      : { name: build.trait.name, source: build.trait.from }

  const fusion = createFusion(data, { allowRare: settings.allowRare })
  const recipes = buildRecipeIndex(data, fusion, settings.playerLevel)

  // Minimum fusion distance for each (skill, source) pair, kept once.
  const reachCache = new Map<string, Map<string, number>>()
  function reachFor(need: Need): Map<string, number> {
    const key = `${need.skill}\u0000${need.source}`
    let reach = reachCache.get(key)
    if (!reach) {
      reach = skillReach(data, recipes, need.skill, need.source)
      reachCache.set(key, reach)
    }
    return reach
  }

  // Minimum fusion distance for a source's own trait, kept once per source.
  const traitReachCache = new Map<string, Map<string, number>>()
  function traitReachFor(source: string): Map<string, number> {
    let reach = traitReachCache.get(source)
    if (!reach) {
      reach = traitReach(data, recipes, source)
      traitReachCache.set(source, reach)
    }
    return reach
  }

  if (validateBuild(data, recipes, build).length > 0) return []

  if (needs.length === 0 && traitNeed === null) {
    return [
      {
        root: makeNode(build.target, {}),
        fusions: 0,
        cost: 0,
      },
    ]
  }

  const personaByName = new Map<string, Persona>(
    data.personas.map((persona) => [persona.name, persona]),
  )

  // Nodes may be shared between answers; nothing below mutates a Node.
  const memo = new Map<string, Result | null>()

  function needsKey(needs: Need[]): string {
    return [...needs]
      .sort(compareNeeds)
      .map((need) => `${need.skill}\u0000${need.source}\u0000${need.kind}`)
      .join('\u0001')
  }

  function memoKey(
    persona: string,
    needs: Need[],
    traitNeed: TraitNeed | null,
    depth: number,
    forbidden: ReadonlySet<string>,
  ): string {
    const ancestors = [...forbidden].sort().join('\u0001')
    const trait =
      traitNeed === null
        ? '-'
        : `${traitNeed.name}\u0000${traitNeed.source}`
    return `${persona}\u0000${needsKey(needs)}\u0000${trait}\u0000${depth}\u0000${ancestors}`
  }

  /**
   * Cheapest node for `personaName`. `forbidden` is the set of personas already
   * on the path (the root target is seeded into it), so no descendant may
   * repeat an ancestor, including as a plain partner.
   *
   * Needs whose source is `personaName` are supplied natively, even when the
   * persona must also be fused to carry the remaining needs. Any other needs
   * are split between the ingredients of a recipe, one base-`n` assignment at a
   * time (n = the recipe's ingredient count). A non-own trait is assigned to
   * exactly one ingredient that can pass it; the trait travels down only the
   * selected branch.
   */
  function make(
    personaName: string,
    needs: Need[],
    traitNeed: TraitNeed | null,
    depth: number,
    forbidden: ReadonlySet<string>,
  ): Result | null {
    const key = memoKey(personaName, needs, traitNeed, depth, forbidden)
    if (memo.has(key)) return memo.get(key) ?? null

    const persona = personaByName.get(personaName)
    if (!persona) {
      memo.set(key, null)
      return null
    }

    const native: Need[] = []
    const rest: Need[] = []
    for (const need of needs) {
      if (need.source === personaName) native.push(need)
      else rest.push(need)
    }

    // A trait is satisfied for free when this persona is its source: a persona
    // always keeps its own trait, whether it is a leaf or fused.
    const traitSatisfied =
      traitNeed === null || traitNeed.source === personaName

    const learns = native.map((need) => ({
      skill: need.skill,
      level: need.kind === 'held' ? null : persona.skills[need.skill],
    }))

    // Everything this persona needs is supplied natively and the trait is its
    // own, so it can be a leaf.
    if (rest.length === 0 && traitSatisfied) {
      const result: Result = {
        node: makeNode(personaName, { learns }),
        fusions: 0,
        cost: 0,
      }
      memo.set(key, result)
      return result
    }

    // A held source is a fixed, owned leaf: the persona already has the skill
    // without learning it. A newly fused persona cannot already hold such a
    // skill, so if it must also carry or inherit anything this branch is
    // impossible.
    if (native.some((need) => need.kind === 'held')) {
      memo.set(key, null)
      return null
    }

    if (depth === 0) {
      memo.set(key, null)
      return null
    }

    // Prune on every skill and on the trait that still has to travel here.
    for (const need of rest) {
      const distance = reachFor(need).get(personaName)
      if (distance === undefined || distance > depth) {
        memo.set(key, null)
        return null
      }
    }
    if (traitNeed !== null && traitNeed.source !== personaName) {
      const distance = traitReachFor(traitNeed.source).get(personaName)
      if (distance === undefined || distance > depth) {
        memo.set(key, null)
        return null
      }
    }

    let best: Result | null = null
    // Extend the path before descending: the current persona may never appear
    // below this node, whether as an ingredient or the plain partner.
    const childForbidden = new Set(forbidden)
    childForbidden.add(personaName)

    for (const recipe of recipes.get(personaName) ?? []) {
      const ingredients = recipe.ingredients
      const ingredientCount = ingredients.length
      if (ingredientCount === 0) continue

      // No descendant may repeat an ancestor or the root target.
      if (ingredients.some((ingredient) => childForbidden.has(ingredient))) {
        continue
      }

      // Capacity depends on how many ingredients this recipe combines.
      const capacity = inheritCapacity(data, personaName, ingredientCount)
      if (rest.length > capacity) continue

      // Which ingredient, if any, supplies the trait at this fusion.
      const traitFroms: (number | null)[] = []
      if (traitNeed === null || traitNeed.source === personaName) {
        traitFroms.push(null)
      } else {
        const sourceReach = traitReachFor(traitNeed.source)
        for (let index = 0; index < ingredientCount; index += 1) {
          const ingredient = ingredients[index]
          const ingredientPersona = personaByName.get(ingredient)
          if (!ingredientPersona || !canPassTrait(ingredientPersona)) continue
          const distance = sourceReach.get(ingredient)
          if (distance === undefined || distance > depth - 1) continue
          traitFroms.push(index)
        }
      }
      if (traitFroms.length === 0) continue

      // Assign each remaining skill to one of the ingredients: the digits of a
      // base-`ingredientCount` number, one digit per need. An assignment is
      // viable only when every assigned skill can reach its ingredient within
      // the remaining depth.
      const assignmentCount = ingredientCount ** rest.length
      for (let code = 0; code < assignmentCount; code += 1) {
        const assigned: Need[][] = Array.from(
          { length: ingredientCount },
          () => [],
        )
        const from: number[] = []
        let remaining = code
        let viable = true
        for (let index = 0; index < rest.length; index += 1) {
          const ingredientIndex = remaining % ingredientCount
          remaining = Math.floor(remaining / ingredientCount)
          const need = rest[index]
          const distance = reachFor(need).get(ingredients[ingredientIndex])
          if (distance === undefined || distance > depth - 1) {
            viable = false
            break
          }
          assigned[ingredientIndex].push(need)
          from.push(ingredientIndex)
        }
        if (!viable) continue

        const inherit = rest.map((need, index) => ({
          skill: need.skill,
          from: from[index],
        }))
        const carriesTrait =
          traitNeed !== null && traitNeed.source !== personaName
            ? traitNeed.name
            : null

        // The trait need follows only the ingredient chosen to carry it.
        for (const traitFrom of traitFroms) {
          const childResults: Result[] = []
          let works = true
          for (
            let ingredientIndex = 0;
            ingredientIndex < ingredientCount;
            ingredientIndex += 1
          ) {
            const child = make(
              ingredients[ingredientIndex],
              assigned[ingredientIndex],
              traitFrom === ingredientIndex ? traitNeed : null,
              depth - 1,
              childForbidden,
            )
            if (!child) {
              works = false
              break
            }
            childResults.push(child)
          }
          if (!works) continue

          let fusions = 1
          let cost = recipe.cost
          for (const child of childResults) {
            fusions += child.fusions
            cost += child.cost
          }

          const result: Result = {
            node: makeNode(personaName, {
              carries: rest.map((need) => need.skill),
              learns,
              carriesTrait,
              recipe: {
                ingredients: childResults.map((child) => child.node),
                inherit,
                traitFrom,
              },
            }),
            fusions,
            cost,
          }
          if (best === null || isCheaper(result, best)) best = result
        }
      }
    }

    memo.set(key, best)
    return best
  }

  for (let depth = 1; depth <= settings.maxDepth; depth += 1) {
    // Seed the path with the root target so it can never appear below itself.
    const result = make(
      build.target,
      needs,
      traitNeed,
      depth,
      new Set([build.target]),
    )
    if (result) {
      return [
        { root: result.node, fusions: result.fusions, cost: result.cost },
      ]
    }
  }
  return []
}
