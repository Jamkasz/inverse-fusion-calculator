import { describe, expect, it } from 'vitest'
import { loadGameData } from '../src/data/load'
import type { Settings } from '../src/settings'
import { DEFAULT_SETTINGS } from '../src/settings'
import type { Build, SkillSource } from '../src/engine/build'
import type { Node, Plan } from '../src/engine/solver'
import { solve } from '../src/engine/solver'
import { replay } from './helpers/replay'
import {
  OVER_CAPACITY,
  SAME_SOURCE_TWO_SKILLS,
  SOURCE_MUST_CARRY,
  TWO_SOURCES_ONE_RECIPE,
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

function expectValid(plan: Plan, source: Build): void {
  expect(replay(data, settings, source, plan)).toEqual([])
}

/** Every node below the given node (not including it). */
function descendants(node: Node): Node[] {
  if (node.recipe === null) return []
  return node.recipe.ingredients.flatMap((child) => [
    child,
    ...descendants(child),
  ])
}

describe('solve with several inherited skills', () => {
  it('attributes two skills from different sources to their own ingredients', () => {
    const fixture = TWO_SOURCES_ONE_RECIPE!
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
    expect(recipe.inherit).toHaveLength(2)

    const sourceBySkill = new Map([
      [fixture.a.skill, fixture.a.source],
      [fixture.b.skill, fixture.b.source],
    ])
    for (const entry of recipe.inherit) {
      expect(recipe.ingredients[entry.from].persona).toBe(
        sourceBySkill.get(entry.skill),
      )
    }
  })

  it('takes both skills from the same leaf when one source supplies them', () => {
    const fixture = SAME_SOURCE_TWO_SKILLS!
    const source = build(
      fixture.target,
      fixture.skills.map((skill) => persona(skill, fixture.source)),
    )
    const plans = solve(data, settings, source)

    expect(plans).toHaveLength(1)
    const plan = plans[0]
    expect(plan.fusions).toBe(1)
    expectValid(plan, source)

    const recipe = plan.root.recipe!
    expect(recipe.inherit).toHaveLength(2)
    const from = recipe.inherit[0].from
    expect(recipe.inherit.every((entry) => entry.from === from)).toBe(true)

    const supplier = recipe.ingredients[from]
    expect(supplier.persona).toBe(fixture.source)
    expect(supplier.recipe).toBeNull()
    for (const skill of fixture.skills) {
      expect(supplier.learns.some((entry) => entry.skill === skill)).toBe(true)
    }
  })

  it('fuses a source so it can carry another source’s skill', () => {
    const fixture = SOURCE_MUST_CARRY!
    const source = build(fixture.target, [
      persona(fixture.a.skill, fixture.a.source),
      persona(fixture.b.skill, fixture.b.source),
    ])
    const plans = solve(data, settings, source)

    expect(plans).toHaveLength(1)
    const plan = plans[0]
    expect(plan.fusions).toBe(2)
    expectValid(plan, source)

    const carrier = descendants(plan.root).find(
      (node) =>
        node.persona === fixture.a.source &&
        node.recipe !== null &&
        node.learns.some((entry) => entry.skill === fixture.a.skill) &&
        node.carries.includes(fixture.b.skill),
    )
    expect(carrier).toBeDefined()
  })

  it('returns no plan when the target cannot inherit that many skills', () => {
    const fixture = OVER_CAPACITY!
    const source = build(
      fixture.target,
      fixture.skills.map((entry) => persona(entry.skill, entry.source)),
    )
    expect(solve(data, settings, source)).toEqual([])
  })

  it('never makes a fused persona hold a held source skill', () => {
    // Agathion's only route that includes Pixie is Arsène + Pixie. Mazio from
    // Ame-no-Uzume can reach Pixie, so a naive search would fuse Pixie and
    // attach the held Agi to it; a held source must instead stay a leaf.
    const source = build('Agathion', [
      held('Agi', 'Pixie'),
      persona('Mazio', 'Ame-no-Uzume'),
    ])
    const plans = solve(data, settings, source)

    // No executable plan is acceptable; any plan that is returned must obey the
    // invariant.
    for (const plan of plans) {
      expectValid(plan, source)
      const fused = [plan.root, ...descendants(plan.root)].filter(
        (node) => node.recipe !== null,
      )
      for (const node of fused) {
        expect(
          node.learns.filter((entry) => entry.level === null),
        ).toEqual([])
      }
    }
  })

  it('rejects a fused node that already holds a held skill', () => {
    const source = build('Agathion', [held('Agi', 'Pixie')])
    const plan = solve(data, settings, source)[0]
    const tampered = JSON.parse(JSON.stringify(plan)) as Plan
    tampered.root.learns = [{ skill: 'Agi', level: null }]

    expect(replay(data, settings, source, tampered)).toEqual(
      expect.arrayContaining([
        'Fused persona Agathion cannot already hold Agi',
      ]),
    )
  })

  it('solves four inherited skills from two sources in one fusion', () => {
    const source = build('Abaddon', [
      persona('Psiodyne', 'Parvati'),
      persona('Psy Break', 'Parvati'),
      persona('Agidyne', 'Throne'),
      persona('Burn Boost', 'Throne'),
    ])
    const plans = solve(data, settings, source)

    expect(plans).toHaveLength(1)
    const plan = plans[0]
    expect(plan.fusions).toBe(1)
    expectValid(plan, source)

    const recipe = plan.root.recipe!
    expect(recipe.inherit).toHaveLength(4)
    expect(recipe.inherit.map((entry) => entry.skill).sort()).toEqual(
      ['Agidyne', 'Burn Boost', 'Psiodyne', 'Psy Break'].sort(),
    )
  })
})
