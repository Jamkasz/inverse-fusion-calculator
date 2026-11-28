import { describe, expect, it } from 'vitest'
import { loadGameData } from '../src/data/load'
import type { Settings } from '../src/settings'
import { DEFAULT_SETTINGS } from '../src/settings'
import type { Build, SkillSource } from '../src/engine/build'
import { toSteps } from '../src/engine/plan'
import { canPassTrait, minTotalSkillsFor } from '../src/engine/rules'
import type { Node, Plan } from '../src/engine/solver'
import { solve } from '../src/engine/solver'
import { replay } from './helpers/replay'
import {
  ADVANCED_INTERMEDIATE,
  ADVANCED_ONE,
  ADVANCED_TWO,
  SIX_SKILLS,
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

function expectValid(
  plan: Plan,
  source: Build,
  useSettings: Settings = settings,
): void {
  expect(replay(data, useSettings, source, plan)).toEqual([])
}

/** Every node below the given node (not including it). */
function descendants(node: Node): Node[] {
  if (node.recipe === null) return []
  return node.recipe.ingredients.flatMap((child) => [
    child,
    ...descendants(child),
  ])
}

function allNodes(plan: Plan): Node[] {
  return [plan.root, ...descendants(plan.root)]
}

const kodama = data.personas.find((entry) => entry.name === 'Kodama')

describe('solve with advanced multi-ingredient fusion', () => {
  it('fuses the three ingredients of ADVANCED_ONE in recipe order', () => {
    const fixture = ADVANCED_ONE!
    const source = build(fixture.target, [
      persona(fixture.skill, fixture.source),
    ])
    const plans = solve(data, settings, source)

    expect(plans).toHaveLength(1)
    const plan = plans[0]
    expect(plan.fusions).toBe(1)
    expectValid(plan, source)

    const recipe = plan.root.recipe!
    expect(recipe.ingredients.map((node) => node.persona)).toEqual([
      'Kodama',
      'Sudama',
      'Anzu',
    ])
    const entry = recipe.inherit.find(
      (candidate) => candidate.skill === fixture.skill,
    )
    expect(entry).toBeDefined()
    expect(recipe.ingredients[entry!.from].persona).toBe(fixture.source)
  })

  it('attributes two skills of ADVANCED_TWO to their own ingredients', () => {
    const fixture = ADVANCED_TWO!
    const source = build(fixture.target, [
      persona(fixture.a.skill, fixture.a.source),
      persona(fixture.b.skill, fixture.b.source),
    ])
    const plans = solve(data, settings, source)

    expect(plans).toHaveLength(1)
    const plan = plans[0]
    expect(plan.fusions).toBe(1)
    expectValid(plan, source)

    const recipe = plan.root.recipe!
    const sourceBySkill = new Map([
      [fixture.a.skill, fixture.a.source],
      [fixture.b.skill, fixture.b.source],
    ])
    expect(recipe.inherit).toHaveLength(2)
    for (const entry of recipe.inherit) {
      expect(recipe.ingredients[entry.from].persona).toBe(
        sourceBySkill.get(entry.skill),
      )
    }
  })

  // The fixture catalogue exports null here: no no-DLC route was found under
  // the "special persona unavoidable on every route" definition (Task 9 rule).
  it.skipIf(ADVANCED_INTERMEDIATE === null)(
    'uses a multi-ingredient node as an intermediate step',
    () => {
      const fixture = ADVANCED_INTERMEDIATE!
      const source = build(
        fixture.target,
        fixture.skills.map((entry) => persona(entry.skill, entry.source)),
      )
      const plans = solve(data, settings, source)

      expect(plans.length).toBeGreaterThan(0)
      for (const plan of plans) {
        expectValid(plan, source)
        expect(
          allNodes(plan).some(
            (node) =>
              node.recipe !== null && node.recipe.ingredients.length > 2,
          ),
        ).toBe(true)
      }
    },
  )

  // ADVANCED_INTERMEDIATE stays null: no no-DLC build satisfied the stronger
  // Task 9 definition ("every route passes a skill through a special persona").
  // The concrete regression below still proves the solver builds a non-root
  // advanced node. Build: target Satanael, inherit Hamaon from Anubis.
  // Satanael's only recipe is the 6-ingredient special combo Arsène + Anzu +
  // Ishtar + Satan + Lucifer + Michael. Among those ingredients only Lucifer
  // is within one fusion of Anubis, and Lucifer itself is the 6-ingredient
  // special combo Anubis + Ananta + Trumpeter + Michael + Metatron + Satan.
  // So the 2-fusion plan must fuse Lucifer (non-root, 6 ingredients) to carry
  // Hamaon into Satanael.
  it('uses an advanced persona as a non-root intermediate step', () => {
    const source = build('Satanael', [persona('Hamaon', 'Anubis')])
    const plans = solve(data, settings, source)

    expect(plans).toHaveLength(1)
    const plan = plans[0]
    expect(plan.fusions).toBe(2)
    expectValid(plan, source)

    const multiIngredient = allNodes(plan).filter(
      (node) => node.recipe !== null && node.recipe.ingredients.length > 2,
    )
    const nonRoot = multiIngredient.filter((node) => node !== plan.root)
    expect(nonRoot.length).toBeGreaterThan(0)

    const lucifer = nonRoot.find((node) => node.persona === 'Lucifer')
    expect(lucifer).toBeDefined()
    expect(lucifer!.recipe!.ingredients.map((node) => node.persona)).toEqual([
      'Anubis',
      'Ananta',
      'Trumpeter',
      'Michael',
      'Metatron',
      'Satan',
    ])
    expect(
      lucifer!.recipe!.inherit.some((entry) => entry.skill === 'Hamaon'),
    ).toBe(true)
  })

  // If the pinned data ever changed so Kodama cannot pass a trait, this build
  // could not be constructed and the dependent test is skipped.
  it.skipIf(kodama === undefined || !canPassTrait(kodama))(
    'routes a trait into an advanced target from one of its ingredients',
    () => {
      const trait = kodama!.trait
      const source = build('Neko Shogun', [], { name: trait, from: 'Kodama' })
      const plans = solve(data, settings, source)

      expect(plans).toHaveLength(1)
      const plan = plans[0]
      expect(plan.fusions).toBe(1)
      expectValid(plan, source)

      const recipe = plan.root.recipe!
      expect(recipe.traitFrom).not.toBeNull()
      expect(recipe.ingredients[recipe.traitFrom!].persona).toBe('Kodama')
      expect(plan.root.carriesTrait).toBe(trait)
    },
  )

  it('turns the ADVANCED_ONE plan into one three-ingredient fuse step', () => {
    const fixture = ADVANCED_ONE!
    const source = build(fixture.target, [
      persona(fixture.skill, fixture.source),
    ])
    const plan = solve(data, settings, source)[0]
    const steps = toSteps(data, source, plan)

    const fuseSteps = steps.filter((step) => step.kind === 'fuse')
    expect(fuseSteps).toHaveLength(1)
    const fuse = fuseSteps[0]
    if (fuse.kind !== 'fuse') throw new Error('expected a fuse step')
    expect(fuse.ingredients).toEqual(['Kodama', 'Sudama', 'Anzu'])
    expect(fuse.skillsNeeded).toBe(
      minTotalSkillsFor(plan.root.recipe!.inherit.length),
    )
  })

  it('solves SIX_SKILLS at maxDepth 4 within the default timeout', () => {
    const fixture = SIX_SKILLS!
    const deepSettings: Settings = { ...settings, maxDepth: 4 }
    const source = build(
      fixture.target,
      fixture.skills.map((entry) => persona(entry.skill, entry.source)),
    )
    const plans = solve(data, deepSettings, source)

    expect(plans.length).toBeGreaterThan(0)
    const plan = plans[0]
    expectValid(plan, source, deepSettings)

    const recipe = plan.root.recipe!
    expect(recipe.ingredients).toHaveLength(6)
    expect(recipe.inherit).toHaveLength(6)
    expect(plan.root.carries).toHaveLength(6)
  })
})
