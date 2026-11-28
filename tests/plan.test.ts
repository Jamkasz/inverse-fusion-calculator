import { describe, expect, it } from 'vitest'
import { loadGameData } from '../src/data/load'
import { DEFAULT_SETTINGS } from '../src/settings'
import type { Build, SkillSource } from '../src/engine/build'
import { createFusion } from '../src/engine/fusion'
import { buildRecipeIndex } from '../src/engine/recipes'
import type { Node, Plan } from '../src/engine/solver'
import { solve } from '../src/engine/solver'
import type { Step } from '../src/engine/plan'
import { toSteps } from '../src/engine/plan'
import { replay } from './helpers/replay'
import { HELD_DIRECT, TWO_STEP } from './helpers/fixtures'

const data = loadGameData({ ownedDlc: [] })

function build(
  target: string,
  skills: { name: string; source: SkillSource }[],
  trait: Build['trait'] = null,
): Build {
  return { target, skills, trait }
}

function persona(name: string, source: string): { name: string; source: SkillSource } {
  return { name, source: { kind: 'persona', persona: source } }
}

function held(name: string, source: string): { name: string; source: SkillSource } {
  return { name, source: { kind: 'held', persona: source } }
}

function innate(name: string): { name: string; source: SkillSource } {
  return { name, source: { kind: 'innate' } }
}

function card(name: string): { name: string; source: SkillSource } {
  return { name, source: { kind: 'card' } }
}

function leafNode(personaName: string, learns: Node['learns'] = []): Node {
  return {
    persona: personaName,
    carries: [],
    learns,
    carriesTrait: null,
    recipe: null,
  }
}

function fuseNode(
  personaName: string,
  ingredients: Node[],
  inherit: { skill: string; from: number }[],
  extras: {
    carries?: string[]
    carriesTrait?: string | null
    traitFrom?: number | null
  } = {},
): Node {
  return {
    persona: personaName,
    carries: extras.carries ?? inherit.map((entry) => entry.skill),
    learns: [],
    carriesTrait: extras.carriesTrait ?? null,
    recipe: {
      ingredients,
      inherit,
      traitFrom: extras.traitFrom ?? null,
    },
  }
}

function leafNodes(node: Node): Node[] {
  if (node.recipe === null) return [node]
  return node.recipe.ingredients.flatMap(leafNodes)
}

function fuseSteps(steps: Step[]): Extract<Step, { kind: 'fuse' }>[] {
  return steps.filter(
    (step): step is Extract<Step, { kind: 'fuse' }> => step.kind === 'fuse',
  )
}

function obtainSteps(steps: Step[]): Extract<Step, { kind: 'obtain' }>[] {
  return steps.filter(
    (step): step is Extract<Step, { kind: 'obtain' }> => step.kind === 'obtain',
  )
}

function stepLabel(step: Step): string {
  if (step.kind === 'obtain') return `obtain ${step.persona}`
  if (step.kind === 'fuse') return `fuse ${step.result}`
  if (step.kind === 'card') return `card ${step.skill}`
  return `level ${step.persona}`
}

describe('toSteps', () => {
  it('uses the minimum ingredient skill total for four inherited skills', () => {
    const root = fuseNode(
      'Abaddon',
      [leafNode('Neko Shogun'), leafNode('Abaddon')],
      [
        { skill: 'Absorb Bless', from: 0 },
        { skill: 'Absorb Curse', from: 0 },
        { skill: 'Absorb Fire', from: 1 },
        { skill: 'Absorb Ice', from: 1 },
      ],
    )
    const plan: Plan = { root, fusions: 1, cost: 0 }
    const fuse = fuseSteps(toSteps(data, build('Abaddon', []), plan))

    expect(fuse).toHaveLength(1)
    expect(fuse[0].skillsNeeded).toBe(13)
  })

  it('counts the natural skills of both ingredients', () => {
    const ingredients = [leafNode('Neko Shogun'), leafNode('Abaddon')]
    const twoInherited = fuseNode('Abaddon', ingredients, [
      { skill: 'Agidyne', from: 0 },
      { skill: 'Psiodyne', from: 1 },
    ])
    const two = fuseSteps(
      toSteps(data, build('Abaddon', []), {
        root: twoInherited,
        fusions: 1,
        cost: 0,
      }),
    )[0]
    expect(two.skillsHeld).toBe(6)
    expect(two.skillsNeeded).toBe(6)

    const threeInherited = fuseNode('Abaddon', ingredients, [
      { skill: 'Agidyne', from: 0 },
      { skill: 'Psiodyne', from: 1 },
      { skill: 'Mabufudyne', from: 0 },
    ])
    const three = fuseSteps(
      toSteps(data, build('Abaddon', []), {
        root: threeInherited,
        fusions: 1,
        cost: 0,
      }),
    )[0]
    expect(three.skillsHeld).toBe(6)
    expect(three.skillsNeeded).toBe(9)
    expect(three.skillsNeeded - three.skillsHeld).toBe(3)
  })

  it('flags a disputed inheritance type only when something is inherited', () => {
    const inheriting = fuseNode(
      'Mandrake',
      [leafNode('Pixie'), leafNode('Agathion')],
      [{ skill: 'Zio', from: 0 }],
    )
    const withInherit = fuseSteps(
      toSteps(data, build('Mandrake', []), {
        root: inheriting,
        fusions: 1,
        cost: 0,
      }),
    )[0]
    expect(withInherit.disputedInheritType).toBe(true)

    const nothing = fuseNode(
      'Mandrake',
      [leafNode('Pixie'), leafNode('Agathion')],
      [],
    )
    const without = fuseSteps(
      toSteps(data, build('Mandrake', []), {
        root: nothing,
        fusions: 1,
        cost: 0,
      }),
    )[0]
    expect(without.disputedInheritType).toBe(false)
  })

  it('emits the TWO_STEP plan in execution order', () => {
    // The Task 10 solver prefers the cheaper Asura + Barong route, so build the
    // other valid two-fusion TWO_STEP route directly: Ananta + Barong makes
    // Parvati, and Parvati + Throne makes Abaddon.
    const fixture = TWO_STEP!
    const source = build(fixture.target, [persona(fixture.skill, fixture.source)])
    const ananta: Node = leafNode(fixture.source, [
      { skill: fixture.skill, level: 0 },
    ])
    const barong = leafNode('Barong')
    const parvati = fuseNode('Parvati', [ananta, barong], [
      { skill: fixture.skill, from: 0 },
    ])
    const throne = leafNode('Throne')
    const abaddon = fuseNode(fixture.target, [parvati, throne], [
      { skill: fixture.skill, from: 0 },
    ])

    const fusion = createFusion(data, { allowRare: DEFAULT_SETTINGS.allowRare })
    const recipes = buildRecipeIndex(
      data,
      fusion,
      DEFAULT_SETTINGS.playerLevel,
    )
    function cost(result: string, ingredients: string[]): number {
      const sorted = [...ingredients].sort()
      return (
        recipes
          .get(result)
          ?.find(
            (recipe) =>
              recipe.ingredients.length === sorted.length &&
              [...recipe.ingredients].sort().every(
                (name, index) => name === sorted[index],
              ),
          )?.cost ?? 0
      )
    }
    const plan: Plan = {
      root: abaddon,
      fusions: 2,
      cost:
        cost('Parvati', ['Ananta', 'Barong']) +
        cost(fixture.target, ['Parvati', 'Throne']),
    }
    expect(replay(data, DEFAULT_SETTINGS, source, plan)).toEqual([])

    const steps = toSteps(data, source, plan)
    expect(steps.map(stepLabel)).toEqual([
      'obtain Ananta',
      'obtain Barong',
      'fuse Parvati',
      'obtain Throne',
      'fuse Abaddon',
    ])
  })

  it('places card steps after every fusion', () => {
    const source = build('Agathion', [
      persona('Patra', 'Pixie'),
      card('Zio'),
    ])
    const plan = solve(data, DEFAULT_SETTINGS, source)[0]
    const steps = toSteps(data, source, plan)

    const fuseIndices = steps
      .map((step, index) => ({ step, index }))
      .filter((entry) => entry.step.kind === 'fuse')
      .map((entry) => entry.index)
    const cardIndices = steps
      .map((step, index) => ({ step, index }))
      .filter((entry) => entry.step.kind === 'card')
      .map((entry) => entry.index)

    expect(fuseIndices.length).toBeGreaterThan(0)
    expect(cardIndices).toHaveLength(1)
    for (const cardIndex of cardIndices) {
      for (const fuseIndex of fuseIndices) {
        expect(cardIndex).toBeGreaterThan(fuseIndex)
      }
    }

    const cardStep = steps[cardIndices[0]]
    expect(cardStep.kind).toBe('card')
    if (cardStep.kind === 'card') {
      expect(cardStep.skill).toBe('Zio')
      expect(cardStep.cardSources.chair).toContain('Agathion')
    }
  })

  it('ends with one level step at the highest innate learn level', () => {
    const source = build('Agathion', [innate('Zio'), innate('Dodge Elec')])
    const plan = solve(data, DEFAULT_SETTINGS, source)[0]
    const steps = toSteps(data, source, plan)
    const last = steps[steps.length - 1]

    expect(last.kind).toBe('level')
    if (last.kind === 'level') {
      expect(last.persona).toBe('Agathion')
      expect(last.levelTo).toBe(8)
      expect(last.learns).toEqual(
        expect.arrayContaining(['Zio', 'Dodge Elec']),
      )
    }
  })

  it('marks a plain fusion partner with no level or skills', () => {
    const fixture = TWO_STEP!
    const source = build(fixture.target, [persona(fixture.skill, fixture.source)])
    const plan = solve(data, DEFAULT_SETTINGS, source)[0]
    const plain = leafNodes(plan.root).find(
      (node) => node.learns.length === 0 && node.persona !== fixture.source,
    )
    expect(plain).toBeDefined()

    const steps = toSteps(data, source, plan)
    const step = obtainSteps(steps).find(
      (entry) => entry.persona === plain!.persona,
    )
    expect(step).toEqual({
      kind: 'obtain',
      persona: plain!.persona,
      levelTo: null,
      learns: [],
      holds: [],
    })
  })

  it('puts a held source skill in holds, not learns', () => {
    const fixture = HELD_DIRECT!
    const source = build(fixture.target, [
      held(fixture.skill, fixture.source),
    ])
    const plan = solve(data, DEFAULT_SETTINGS, source)[0]
    const steps = toSteps(data, source, plan)

    const pixie = obtainSteps(steps).find(
      (step) => step.persona === fixture.source,
    )
    expect(pixie).toEqual({
      kind: 'obtain',
      persona: fixture.source,
      levelTo: null,
      learns: [],
      holds: [fixture.skill],
    })
  })

  it('produces one fuse step with three ingredients', () => {
    const root = fuseNode(
      'Neko Shogun',
      [leafNode('Kodama'), leafNode('Sudama'), leafNode('Anzu')],
      [{ skill: 'Garu', from: 0 }],
    )
    const fuse = fuseSteps(
      toSteps(data, build('Neko Shogun', []), {
        root,
        fusions: 1,
        cost: 0,
      }),
    )

    expect(fuse).toHaveLength(1)
    expect(fuse[0].ingredients).toEqual(['Kodama', 'Sudama', 'Anzu'])
    expect(fuse[0].result).toBe('Neko Shogun')
  })

  it('keeps a base-level skill in learns with no level requirement', () => {
    const root = leafNode('Pixie', [{ skill: 'Dia', level: 0 }])
    const steps = toSteps(data, build('Pixie', []), {
      root,
      fusions: 0,
      cost: 0,
    })

    expect(obtainSteps(steps)[0]).toEqual({
      kind: 'obtain',
      persona: 'Pixie',
      levelTo: null,
      learns: ['Dia'],
      holds: [],
    })
  })

  it('caps each ingredient natural skill count at eight', () => {
    // Crystal Skull lists eleven skills, all at level 0, but only eight count.
    const root = fuseNode(
      'Abaddon',
      [leafNode('Crystal Skull'), leafNode('Abaddon')],
      [{ skill: 'Agidyne', from: 1 }],
    )
    const fuse = fuseSteps(
      toSteps(data, build('Abaddon', []), {
        root,
        fusions: 1,
        cost: 0,
      }),
    )[0]

    expect(fuse.skillsHeld).toBe(11)
  })

  it('appends card steps to a zero-fusion plan', () => {
    const source = build('Agathion', [card('Zio')])
    const plans = solve(data, DEFAULT_SETTINGS, source)

    expect(plans).toHaveLength(1)
    expect(plans[0].fusions).toBe(0)

    const steps = toSteps(data, source, plans[0])
    expect(steps.map(stepLabel)).toEqual(['obtain Agathion', 'card Zio'])
  })
})
