import type { GameData, Persona } from '../data/types'
import type { Settings } from '../settings'
import type { Build } from './build'
import { validateBuild } from './build'
import { createFusion } from './fusion'
import { inheritCapacity } from './inheritance'
import { buildRecipeIndex } from './recipes'
import { skillReach } from './reach'

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

export class UnsupportedBuildError extends Error {
  readonly capability: string

  constructor(capability: string) {
    super(`This build needs ${capability}, which is not supported yet`)
    this.name = 'UnsupportedBuildError'
    this.capability = capability
  }
}

/** One inherited skill, tagged with the persona that supplies it as a leaf. */
type Need = {
  skill: string
  source: string
  kind: 'persona' | 'held'
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

function unsupportedCapability(build: Build): string | null {
  const inherited = build.skills.filter(
    (row) => row.source.kind === 'persona' || row.source.kind === 'held',
  )
  if (inherited.length > 1) return 'several inherited skills'
  if (build.trait !== null) return 'trait inheritance'
  return null
}

/**
 * Backward search for a build with at most one inherited skill and no inherited
 * trait, using two-ingredient recipes only (Task 10). Returns at most one plan:
 * the fewest fusions, then the lowest approximate cost. Builds that need a
 * later capability throw {@link UnsupportedBuildError}; builds that fail
 * validation return an empty list.
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

  // Cheap capability guards run before the expensive recipe index is built.
  const unsupported = unsupportedCapability(build)
  if (unsupported !== null) throw new UnsupportedBuildError(unsupported)

  const target = data.personas.find(
    (persona) => persona.name === build.target,
  )
  // Task 10 does not support advanced (multi-ingredient) fusion, so a special
  // target with anything to inherit is unsupported regardless of any route.
  if (target?.special && needs.length > 0) {
    throw new UnsupportedBuildError('advanced fusion')
  }

  const fusion = createFusion(data, { allowRare: settings.allowRare })
  const recipes = buildRecipeIndex(data, fusion, settings.playerLevel)

  // Minimum fusion distance for the single (skill, source) pair, kept once.
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

  if (validateBuild(data, recipes, build).length > 0) return []

  if (needs.length === 0) {
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

  function memoKey(
    persona: string,
    need: Need | null,
    depth: number,
    forbidden: ReadonlySet<string>,
  ): string {
    const needKey =
      need === null
        ? ''
        : `${need.skill}\u0000${need.source}\u0000${need.kind}`
    const ancestors = [...forbidden].sort().join('\u0001')
    return `${persona}\u0000${needKey}\u0000${depth}\u0000${ancestors}`
  }

  /**
   * Cheapest node for `personaName`. `forbidden` is the set of personas already
   * on the path (the root target is seeded into it), so no descendant may
   * repeat an ancestor, including as a plain partner.
   */
  function make(
    personaName: string,
    need: Need | null,
    depth: number,
    forbidden: ReadonlySet<string>,
  ): Result | null {
    const key = memoKey(personaName, need, depth, forbidden)
    if (memo.has(key)) return memo.get(key) ?? null

    const persona = personaByName.get(personaName)
    if (!persona) {
      memo.set(key, null)
      return null
    }

    // A designated source supplies its skill natively, even if it cannot
    // inherit the skill itself.
    const isNative = need !== null && need.source === personaName
    const rest = need !== null && !isNative ? need : null

    if (rest === null) {
      const learns =
        isNative && need !== null
          ? [
              {
                skill: need.skill,
                level:
                  need.kind === 'held'
                    ? null
                    : persona.skills[need.skill],
              },
            ]
          : []
      const result: Result = {
        node: makeNode(personaName, { learns }),
        fusions: 0,
        cost: 0,
      }
      memo.set(key, result)
      return result
    }

    if (depth === 0) {
      memo.set(key, null)
      return null
    }

    const reach = reachFor(rest)
    const distance = reach.get(personaName)
    if (distance === undefined || distance > depth) {
      memo.set(key, null)
      return null
    }

    const capacity = inheritCapacity(data, personaName, 2)
    if (capacity < 1) {
      memo.set(key, null)
      return null
    }

    let best: Result | null = null
    // Extend the path before descending: the current persona may never appear
    // below this node, whether as the carrier or the plain partner.
    const childForbidden = new Set(forbidden)
    childForbidden.add(personaName)

    for (const recipe of recipes.get(personaName) ?? []) {
      if (recipe.ingredients.length !== 2) continue

      for (let from = 0; from < recipe.ingredients.length; from += 1) {
        const carrier = recipe.ingredients[from]
        const otherIndex = 1 - from
        const other = recipe.ingredients[otherIndex]
        if (childForbidden.has(carrier) || childForbidden.has(other)) {
          continue
        }

        const carrierDistance = reach.get(carrier)
        if (
          carrierDistance === undefined ||
          carrierDistance > depth - 1
        ) {
          continue
        }

        const carrierResult = make(carrier, rest, depth - 1, childForbidden)
        if (!carrierResult) continue

        const otherResult = make(other, null, depth - 1, childForbidden)
        if (!otherResult) continue

        const ingredients: Node[] = []
        ingredients[from] = carrierResult.node
        ingredients[otherIndex] = otherResult.node

        const result: Result = {
          node: makeNode(personaName, {
            carries: [rest.skill],
            recipe: {
              ingredients,
              inherit: [{ skill: rest.skill, from }],
              traitFrom: null,
            },
          }),
          fusions: 1 + carrierResult.fusions + otherResult.fusions,
          cost: recipe.cost + carrierResult.cost + otherResult.cost,
        }
        if (best === null || isCheaper(result, best)) best = result
      }
    }

    memo.set(key, best)
    return best
  }

  const need = needs[0]
  for (let depth = 1; depth <= settings.maxDepth; depth += 1) {
    // Seed the path with the root target so it can never appear below itself.
    const result = make(
      build.target,
      need,
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
