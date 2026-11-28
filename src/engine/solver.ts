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
  if (build.trait !== null) return 'trait inheritance'
  return null
}

/** A stable order for needs, so memo keys and output do not depend on input. */
function compareNeeds(a: Need, b: Need): number {
  if (a.skill !== b.skill) return a.skill < b.skill ? -1 : 1
  if (a.source !== b.source) return a.source < b.source ? -1 : 1
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1
  return 0
}

/**
 * Backward search for a build with any number of inherited skills and no
 * inherited trait, using two-ingredient recipes only (Task 12). Every inherited
 * skill is assigned to one of the two ingredients at each fusion; the search
 * enumerates those assignments, prunes with reach distances and inheritance
 * capacity, and memoizes. Returns at most one plan: the fewest fusions, then the
 * lowest approximate cost. Builds that need a later capability throw
 * {@link UnsupportedBuildError}; builds that fail validation return an empty
 * list.
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

  // Cheap capability guards run before the expensive recipe index is built.
  const unsupported = unsupportedCapability(build)
  if (unsupported !== null) throw new UnsupportedBuildError(unsupported)

  const target = data.personas.find(
    (persona) => persona.name === build.target,
  )
  // Task 12 still does not support advanced (multi-ingredient) fusion, so a
  // special target with anything to inherit is unsupported regardless of route.
  if (target?.special && needs.length > 0) {
    throw new UnsupportedBuildError('advanced fusion')
  }

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

  function needsKey(needs: Need[]): string {
    return [...needs]
      .sort(compareNeeds)
      .map((need) => `${need.skill}\u0000${need.source}\u0000${need.kind}`)
      .join('\u0001')
  }

  function memoKey(
    persona: string,
    needs: Need[],
    depth: number,
    forbidden: ReadonlySet<string>,
  ): string {
    const ancestors = [...forbidden].sort().join('\u0001')
    return `${persona}\u0000${needsKey(needs)}\u0000${depth}\u0000${ancestors}`
  }

  /** Whether every assigned skill can reach `personaName` within `maxDepth`. */
  function canReachAll(
    assigned: Need[],
    personaName: string,
    maxDepth: number,
  ): boolean {
    return assigned.every((need) => {
      const distance = reachFor(need).get(personaName)
      return distance !== undefined && distance <= maxDepth
    })
  }

  /**
   * Cheapest node for `personaName`. `forbidden` is the set of personas already
   * on the path (the root target is seeded into it), so no descendant may
   * repeat an ancestor, including as a plain partner.
   *
   * Needs whose source is `personaName` are supplied natively, even when the
   * persona must also be fused to carry the remaining needs. Any other needs
   * are split between the two ingredients of a recipe, one assignment mask at a
   * time.
   */
  function make(
    personaName: string,
    needs: Need[],
    depth: number,
    forbidden: ReadonlySet<string>,
  ): Result | null {
    const key = memoKey(personaName, needs, depth, forbidden)
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

    const learns = native.map((need) => ({
      skill: need.skill,
      level: need.kind === 'held' ? null : persona.skills[need.skill],
    }))

    // Everything this persona needs is supplied natively, so it can be a leaf.
    if (rest.length === 0) {
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
    // skill, so if it must also carry anything else this branch is impossible.
    if (native.some((need) => need.kind === 'held')) {
      memo.set(key, null)
      return null
    }

    if (depth === 0) {
      memo.set(key, null)
      return null
    }

    // Prune on every skill that still has to travel to this persona.
    for (const need of rest) {
      const distance = reachFor(need).get(personaName)
      if (distance === undefined || distance > depth) {
        memo.set(key, null)
        return null
      }
    }

    const capacity = inheritCapacity(data, personaName, 2)
    if (rest.length > capacity) {
      memo.set(key, null)
      return null
    }

    let best: Result | null = null
    // Extend the path before descending: the current persona may never appear
    // below this node, whether as an ingredient or the plain partner.
    const childForbidden = new Set(forbidden)
    childForbidden.add(personaName)

    for (const recipe of recipes.get(personaName) ?? []) {
      // Task 12 still only follows two-ingredient recipes.
      if (recipe.ingredients.length !== 2) continue

      const [left, right] = recipe.ingredients
      if (childForbidden.has(left) || childForbidden.has(right)) continue

      // Assign each remaining skill to ingredient 0 or 1. The mask bit for a
      // need chooses the right ingredient; every split is a candidate.
      const assignmentCount = 1 << rest.length
      for (let mask = 0; mask < assignmentCount; mask += 1) {
        const assignedLeft: Need[] = []
        const assignedRight: Need[] = []
        for (let index = 0; index < rest.length; index += 1) {
          const target =
            (mask & (1 << index)) === 0 ? assignedLeft : assignedRight
          target.push(rest[index])
        }

        if (!canReachAll(assignedLeft, left, depth - 1)) continue
        if (!canReachAll(assignedRight, right, depth - 1)) continue

        const leftResult = make(left, assignedLeft, depth - 1, childForbidden)
        if (!leftResult) continue

        const rightResult = make(
          right,
          assignedRight,
          depth - 1,
          childForbidden,
        )
        if (!rightResult) continue

        const inherit = rest.map((need, index) => ({
          skill: need.skill,
          from: (mask & (1 << index)) === 0 ? 0 : 1,
        }))

        const result: Result = {
          node: makeNode(personaName, {
            carries: rest.map((need) => need.skill),
            learns,
            recipe: {
              ingredients: [leftResult.node, rightResult.node],
              inherit,
              traitFrom: null,
            },
          }),
          fusions: 1 + leftResult.fusions + rightResult.fusions,
          cost: recipe.cost + leftResult.cost + rightResult.cost,
        }
        if (best === null || isCheaper(result, best)) best = result
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
