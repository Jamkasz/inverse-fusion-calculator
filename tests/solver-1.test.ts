import { describe, expect, it } from 'vitest'
import { loadGameData } from '../src/data/load'
import type { Settings } from '../src/settings'
import { DEFAULT_SETTINGS } from '../src/settings'
import type { Build, SkillSource } from '../src/engine/build'
import { validateBuild } from '../src/engine/build'
import { createFusion } from '../src/engine/fusion'
import { canInherit } from '../src/engine/inheritance'
import { buildRecipeIndex } from '../src/engine/recipes'
import { skillReach } from '../src/engine/reach'
import type { Node, Plan } from '../src/engine/solver'
import { solve } from '../src/engine/solver'
import { replay } from './helpers/replay'
import {
  DIRECT,
  HELD_DIRECT,
  TWO_STEP,
  UNREACHABLE,
} from './helpers/fixtures'

const data = loadGameData({ ownedDlc: [] })
const settings: Settings = { ...DEFAULT_SETTINGS }

type SkillRow = { name: string; source: SkillSource }

function build(
  target: string,
  skills: SkillRow[],
  trait: Build['trait'] = null,
): Build {
  return { target, skills, trait }
}

function persona(name: string, source: string): SkillRow {
  return { name, source: { kind: 'persona', persona: source } }
}

function held(name: string, source: string): SkillRow {
  return { name, source: { kind: 'held', persona: source } }
}

function innate(name: string): SkillRow {
  return { name, source: { kind: 'innate' } }
}

function card(name: string): SkillRow {
  return { name, source: { kind: 'card' } }
}

function fixtureBuild(fixture: {
  target: string
  skill: string
  source: string
}): Build {
  return build(fixture.target, [persona(fixture.skill, fixture.source)])
}

function expectValid(plan: Plan, source: Build): void {
  expect(replay(data, settings, source, plan)).toEqual([])
}

function leaves(node: Node): Node[] {
  if (node.recipe === null) return [node]
  return node.recipe.ingredients.flatMap(leaves)
}

/** Every node below the given node (not including it). */
function descendants(node: Node): Node[] {
  if (node.recipe === null) return []
  return node.recipe.ingredients.flatMap((child) => [
    child,
    ...descendants(child),
  ])
}

describe('solve with inherited skills', () => {
  it('returns one zero-fusion plan when only innate and card skills are needed', () => {
    const source = build('Agathion', [innate('Zio'), card('Abysmal Surge')])
    const plans = solve(data, settings, source)

    expect(plans).toHaveLength(1)
    expect(plans[0].fusions).toBe(0)
    expect(plans[0].cost).toBe(0)
    expect(plans[0].root).toEqual({
      persona: 'Agathion',
      carries: [],
      learns: [],
      carriesTrait: null,
      recipe: null,
    })
    expectValid(plans[0], source)
  })

  it('solves a direct persona source in one fusion', () => {
    const fixture = DIRECT!
    const source = fixtureBuild(fixture)
    const plans = solve(data, settings, source)

    expect(plans).toHaveLength(1)
    const plan = plans[0]
    expect(plan.fusions).toBe(1)
    expect(plan.root.recipe).not.toBeNull()
    const recipe = plan.root.recipe!
    expect(recipe.ingredients.map((node) => node.persona)).toContain(
      fixture.source,
    )
    expect(recipe.inherit.map((entry) => entry.skill)).toEqual([fixture.skill])
    expect(recipe.ingredients[recipe.inherit[0].from].persona).toBe(
      fixture.source,
    )
    expectValid(plan, source)
  })

  it('solves a two-step persona source in two fusions', () => {
    const fixture = TWO_STEP!
    const source = fixtureBuild(fixture)
    const plans = solve(data, settings, source)

    expect(plans).toHaveLength(1)
    expect(plans[0].fusions).toBe(2)
    expectValid(plans[0], source)
  })

  it('returns no plan when maxDepth is too small', () => {
    const fixture = TWO_STEP!
    const source = fixtureBuild(fixture)
    expect(solve(data, { ...settings, maxDepth: 1 }, source)).toEqual([])
  })

  it('records the learn level on the source leaf', () => {
    const fixture = TWO_STEP!
    const source = fixtureBuild(fixture)
    const plan = solve(data, settings, source)[0]
    expectValid(plan, source)

    const sourceLeaf = leaves(plan.root).find(
      (node) =>
        node.persona === fixture.source &&
        node.learns.some((entry) => entry.skill === fixture.skill),
    )
    expect(sourceLeaf).toBeDefined()

    const expectedLevel = data.personas.find(
      (entry) => entry.name === fixture.source,
    )!.skills[fixture.skill]
    expect(sourceLeaf!.learns).toEqual([
      { skill: fixture.skill, level: expectedLevel },
    ])
  })

  it('solves a held source in one fusion with a null learn level', () => {
    const fixture = HELD_DIRECT!
    const source = build(fixture.target, [
      held(fixture.skill, fixture.source),
    ])
    const plan = solve(data, settings, source)[0]

    expect(plan.fusions).toBe(1)
    expectValid(plan, source)

    const sourceLeaf = leaves(plan.root).find(
      (node) => node.persona === fixture.source && node.learns.length > 0,
    )
    expect(sourceLeaf).toBeDefined()
    expect(sourceLeaf!.learns).toEqual([
      { skill: fixture.skill, level: null },
    ])
  })

  it('returns no plan for a held skill the target cannot inherit', () => {
    const source = build('Agathion', [held('Vacuum Wave', 'Pixie')])
    const recipes = buildRecipeIndex(
      data,
      createFusion(data, { allowRare: false }),
      null,
    )

    expect(
      validateBuild(data, recipes, source).map((error) => error.code),
    ).toContain('NOT_INHERITABLE')
    expect(solve(data, settings, source)).toEqual([])
  })

  it('returns no plan for an unreachable skill on a special target', () => {
    // Flauros is special, and King Frost has no route to it for Mabufudyne.
    const fixture = UNREACHABLE!
    const source = fixtureBuild(fixture)
    const recipes = buildRecipeIndex(
      data,
      createFusion(data, { allowRare: false }),
      null,
    )
    expect(
      skillReach(data, recipes, fixture.skill, fixture.source).has(
        fixture.target,
      ),
    ).toBe(false)
    expect(solve(data, settings, source)).toEqual([])
  })

  it('returns no plan for a non-special target with a genuinely unreachable skill', () => {
    // Arsène is not special; its only recipe is High Pixie + Obariyon, neither
    // of which can carry a Curse skill, so Eiga from Choronzon has no route.
    const source = build('Arsène', [persona('Eiga', 'Choronzon')])
    const recipes = buildRecipeIndex(
      data,
      createFusion(data, { allowRare: false }),
      null,
    )
    const chorus = data.personas.find((entry) => entry.name === 'Choronzon')

    expect(data.personas.find((entry) => entry.name === 'Arsène')!.special).toBe(
      false,
    )
    expect(canInherit(data, 'Arsène', 'Eiga')).toBe(true)
    expect(chorus).toBeDefined()
    expect(Object.hasOwn(chorus!.skills, 'Eiga')).toBe(true)
    expect(validateBuild(data, recipes, source)).toEqual([])
    expect(
      skillReach(data, recipes, 'Eiga', 'Choronzon').has('Arsène'),
    ).toBe(false)
    expect(solve(data, settings, source)).toEqual([])
  })

  it('never repeats the target as a descendant', () => {
    // Cerberus can be reached in a circle that uses Cerberus again below the
    // root; no returned plan may contain that cycle.
    const source = build('Cerberus', [
      persona('Tarukaja', 'Shiki-Ouji'),
    ])
    const plans = solve(data, settings, source)

    for (const plan of plans) {
      expect(replay(data, settings, source, plan)).toEqual([])
      expect(
        descendants(plan.root).some((node) => node.persona === 'Cerberus'),
      ).toBe(false)
    }
  })
})

describe('replay', () => {
  it('reports violations for a tampered plan', () => {
    const fixture = DIRECT!
    const source = fixtureBuild(fixture)
    const plan = solve(data, settings, source)[0]
    expect(replay(data, settings, source, plan)).toEqual([])

    const tamperedPersona = JSON.parse(JSON.stringify(plan)) as Plan
    tamperedPersona.root.persona = 'Pixie'
    expect(
      replay(data, settings, source, tamperedPersona).length,
    ).toBeGreaterThan(0)

    const tamperedInherit = JSON.parse(JSON.stringify(plan)) as Plan
    expect(tamperedInherit.root.recipe).not.toBeNull()
    tamperedInherit.root.recipe!.inherit = [{ skill: 'Agi', from: 0 }]
    expect(
      replay(data, settings, source, tamperedInherit).length,
    ).toBeGreaterThan(0)
  })

  it('flags a circular plan that reuses the root target as a descendant', () => {
    const source = build('Cerberus', [
      persona('Tarukaja', 'Shiki-Ouji'),
    ])
    const shiki: Node = {
      persona: 'Shiki-Ouji',
      carries: [],
      learns: [{ skill: 'Tarukaja', level: 0 }],
      carriesTrait: null,
      recipe: null,
    }
    const chiYou: Node = {
      persona: 'Chi You',
      carries: [],
      learns: [],
      carriesTrait: null,
      recipe: null,
    }
    const cerberusDescendant: Node = {
      persona: 'Cerberus',
      carries: [],
      learns: [],
      carriesTrait: null,
      recipe: {
        ingredients: [shiki, chiYou],
        inherit: [],
        traitFrom: null,
      },
    }
    const araMitama: Node = {
      persona: 'Ara Mitama',
      carries: ['Tarukaja'],
      learns: [],
      carriesTrait: null,
      recipe: {
        ingredients: [shiki, cerberusDescendant],
        inherit: [{ skill: 'Tarukaja', from: 0 }],
        traitFrom: null,
      },
    }
    const root: Node = {
      persona: 'Cerberus',
      carries: ['Tarukaja'],
      learns: [],
      carriesTrait: null,
      recipe: {
        ingredients: [araMitama, chiYou],
        inherit: [{ skill: 'Tarukaja', from: 0 }],
        traitFrom: null,
      },
    }

    const circular: Plan = { root, fusions: 2, cost: 0 }
    expect(
      replay(data, settings, source, circular).length,
    ).toBeGreaterThan(0)
  })

  it('flags a leaf that repeats an ancestor', () => {
    const source = build('Cerberus', [])
    const shiki: Node = {
      persona: 'Shiki-Ouji',
      carries: [],
      learns: [],
      carriesTrait: null,
      recipe: null,
    }
    const repeatedLeaf: Node = {
      persona: 'Ara Mitama',
      carries: [],
      learns: [],
      carriesTrait: null,
      recipe: null,
    }
    const inner: Node = {
      persona: 'Ara Mitama',
      carries: [],
      learns: [],
      carriesTrait: null,
      recipe: {
        ingredients: [shiki, repeatedLeaf],
        inherit: [],
        traitFrom: null,
      },
    }
    const partner: Node = {
      persona: 'Chi You',
      carries: [],
      learns: [],
      carriesTrait: null,
      recipe: null,
    }
    const root: Node = {
      persona: 'Cerberus',
      carries: [],
      learns: [],
      carriesTrait: null,
      recipe: {
        ingredients: [inner, partner],
        inherit: [],
        traitFrom: null,
      },
    }

    const plan: Plan = { root, fusions: 2, cost: 0 }
    expect(replay(data, settings, source, plan)).toEqual(
      expect.arrayContaining([
        'Circular plan: Ara Mitama is already an ancestor',
      ]),
    )
  })
})
