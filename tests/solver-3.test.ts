import { describe, expect, it } from 'vitest'
import type { GameData } from '../src/data/types'
import { loadGameData } from '../src/data/load'
import type { Settings } from '../src/settings'
import { DEFAULT_SETTINGS } from '../src/settings'
import type { Build, SkillSource } from '../src/engine/build'
import { validateBuild } from '../src/engine/build'
import { createFusion } from '../src/engine/fusion'
import { buildRecipeIndex } from '../src/engine/recipes'
import { canPassTrait } from '../src/engine/rules'
import type { Node, Plan } from '../src/engine/solver'
import { solve } from '../src/engine/solver'
import { replay } from './helpers/replay'
import { DIRECT, TRAIT_DIRECT } from './helpers/fixtures'

const data = loadGameData({ ownedDlc: [] })
const settings: Settings = { ...DEFAULT_SETTINGS }
const recipes = buildRecipeIndex(
  data,
  createFusion(data, { allowRare: false }),
  null,
)

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
  gameData: GameData = data,
  useSettings: Settings = settings,
): void {
  expect(replay(gameData, useSettings, source, plan)).toEqual([])
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

/** Follows the chosen trait edges until the node that owns the trait. */
function traitPath(node: Node): Node[] {
  const path = [node]
  let current = node
  while (current.carriesTrait !== null) {
    const recipe = current.recipe
    if (!recipe || recipe.traitFrom === null) break
    current = recipe.ingredients[recipe.traitFrom]
    path.push(current)
  }
  return path
}

function ownTrait(gameData: GameData, name: string): string | undefined {
  return gameData.personas.find((entry) => entry.name === name)?.trait
}

describe('solve with an inherited trait', () => {
  it('routes a trait from its source in one fusion', () => {
    const fixture = TRAIT_DIRECT!
    const source = build(fixture.target, [], {
      name: fixture.trait,
      from: fixture.source,
    })
    const plans = solve(data, settings, source)

    expect(plans).toHaveLength(1)
    const plan = plans[0]
    expect(plan.fusions).toBe(1)
    expectValid(plan, source)

    const recipe = plan.root.recipe!
    expect(recipe.traitFrom).not.toBeNull()
    expect(plan.root.carriesTrait).toBe(fixture.trait)

    const carrier = recipe.ingredients[recipe.traitFrom!]
    const path = traitPath(carrier)
    const owner = path[path.length - 1]
    expect(owner.persona).toBe(fixture.source)
    expect(ownTrait(data, owner.persona)).toBe(fixture.trait)
  })

  it('takes a trait and a skill from the same source through one ingredient', () => {
    const source = build('Agathion', [persona('Zio', 'Pixie')], {
      name: 'Static Electricity',
      from: 'Pixie',
    })
    const plans = solve(data, settings, source)

    expect(plans).toHaveLength(1)
    const plan = plans[0]
    expect(plan.fusions).toBe(1)
    expectValid(plan, source)

    const recipe = plan.root.recipe!
    const zio = recipe.inherit.find((entry) => entry.skill === 'Zio')
    expect(zio).toBeDefined()
    expect(recipe.traitFrom).toBe(zio!.from)

    const supplier = recipe.ingredients[zio!.from]
    expect(supplier.persona).toBe('Pixie')
    expect(supplier.learns.some((entry) => entry.skill === 'Zio')).toBe(true)
  })

  it('routes a trait and a skill from different sources in one fusion', () => {
    const source = build('Agathion', [persona('Eiha', 'Arsène')], {
      name: 'Static Electricity',
      from: 'Pixie',
    })
    const plans = solve(data, settings, source)

    expect(plans).toHaveLength(1)
    const plan = plans[0]
    expect(plan.fusions).toBe(1)
    expectValid(plan, source)

    const recipe = plan.root.recipe!
    const eiha = recipe.inherit.find((entry) => entry.skill === 'Eiha')
    expect(eiha).toBeDefined()
    expect(recipe.traitFrom).not.toBeNull()
    expect(recipe.traitFrom).not.toBe(eiha!.from)
    expect(recipe.ingredients[eiha!.from].persona).toBe('Arsène')
    expect(recipe.ingredients[recipe.traitFrom!].persona).toBe('Pixie')
  })

  it('never passes a trait through a DLC or rare persona', () => {
    const allDlc = loadGameData({ ownedDlc: data.dlcGroups.flat() })
    const rareSettings: Settings = { ...DEFAULT_SETTINGS, allowRare: true }
    const fixture = TRAIT_DIRECT!
    // With DLC the eager route would be Pixie -> Raoul -> Cybele, but Raoul is
    // DLC and may not pass a trait.
    const source = build('Cybele', [], {
      name: fixture.trait,
      from: fixture.source,
    })
    const plans = solve(allDlc, rareSettings, source)

    expect(plans.length).toBeGreaterThan(0)
    const dlcNames = new Set(
      allDlc.personas.filter((entry) => entry.dlc).map((entry) => entry.name),
    )
    const rareNames = new Set(
      allDlc.personas.filter((entry) => entry.rare).map((entry) => entry.name),
    )

    for (const plan of plans) {
      expectValid(plan, source, allDlc, rareSettings)
      expect(plan.root.carriesTrait).toBe(fixture.trait)

      for (const node of allNodes(plan)) {
        if (node.carriesTrait !== fixture.trait) continue
        const recipe = node.recipe
        expect(recipe).not.toBeNull()
        expect(recipe!.traitFrom).not.toBeNull()
        const carrier = recipe!.ingredients[recipe!.traitFrom!]
        const carrierPersona = allDlc.personas.find(
          (entry) => entry.name === carrier.persona,
        )!
        expect(canPassTrait(carrierPersona)).toBe(true)
        expect(dlcNames.has(carrier.persona)).toBe(false)
        expect(rareNames.has(carrier.persona)).toBe(false)
      }

      const path = traitPath(plan.root)
      const owner = path[path.length - 1]
      expect(owner.persona).toBe(fixture.source)
      expect(ownTrait(allDlc, owner.persona)).toBe(fixture.trait)
      for (const node of path.slice(0, -1)) {
        const recipe = node.recipe!
        const carrier = recipe.ingredients[recipe.traitFrom!]
        const carrierPersona = allDlc.personas.find(
          (entry) => entry.name === carrier.persona,
        )!
        expect(canPassTrait(carrierPersona)).toBe(true)
      }
    }
  })

  it('keeps trait-null builds free of trait routing', () => {
    const fixture = DIRECT!
    const source = build(fixture.target, [
      persona(fixture.skill, fixture.source),
    ])
    const plans = solve(data, settings, source)

    expect(plans).toHaveLength(1)
    const plan = plans[0]
    expectValid(plan, source)
    for (const node of allNodes(plan)) {
      expect(node.carriesTrait).toBeNull()
      if (node.recipe !== null) expect(node.recipe.traitFrom).toBeNull()
    }
  })

  it('treats an explicit keep-own trait as no trait routing', () => {
    const source = build('Agathion', [], {
      name: 'Rare Antibody',
      from: 'Agathion',
    })
    expect(validateBuild(data, recipes, source)).toEqual([])

    const plans = solve(data, settings, source)
    expect(plans).toHaveLength(1)
    expect(plans[0].fusions).toBe(0)
    expect(plans[0].root.carriesTrait).toBeNull()
    expect(plans[0].root.recipe).toBeNull()
    expectValid(plans[0], source)
  })

  it('accepts an explicit keep-own trait on a special target', () => {
    const source = build('Neko Shogun', [], {
      name: 'Pinch Anchor',
      from: 'Neko Shogun',
    })
    expect(validateBuild(data, recipes, source)).toEqual([])

    expect(() => solve(data, settings, source)).not.toThrow()
    const plans = solve(data, settings, source)
    expect(plans).toHaveLength(1)
    expect(plans[0].fusions).toBe(0)
    expect(plans[0].root.carriesTrait).toBeNull()
    expectValid(plans[0], source)
  })

  it('rejects a tampered trait chain during replay', () => {
    const fixture = TRAIT_DIRECT!
    const source = build(fixture.target, [], {
      name: fixture.trait,
      from: fixture.source,
    })
    const plan = solve(data, settings, source)[0]
    expect(replay(data, settings, source, plan)).toEqual([])

    const wrongTrait = JSON.parse(JSON.stringify(plan)) as Plan
    wrongTrait.root.carriesTrait = 'Rare Antibody'
    expect(replay(data, settings, source, wrongTrait).length).toBeGreaterThan(0)

    const noSource = JSON.parse(JSON.stringify(plan)) as Plan
    expect(noSource.root.recipe).not.toBeNull()
    noSource.root.recipe!.traitFrom = null
    expect(replay(data, settings, source, noSource).length).toBeGreaterThan(0)
  })

  it('rejects a descendant that carries a trait other than the requested one', () => {
    // Satanael from Anubis routes Deathly Illness through Lucifer, so the
    // intermediate Lucifer node carries the requested trait.
    const source = build('Satanael', [], {
      name: 'Deathly Illness',
      from: 'Anubis',
    })
    const plan = solve(data, settings, source)[0]
    expect(replay(data, settings, source, plan)).toEqual([])

    const tampered = JSON.parse(JSON.stringify(plan)) as Plan
    const carrier = allNodes(tampered).find(
      (node) =>
        node !== tampered.root &&
        node.recipe !== null &&
        node.carriesTrait === 'Deathly Illness',
    )
    expect(carrier).toBeDefined()
    carrier!.carriesTrait = 'Rare Antibody'

    expect(replay(data, settings, source, tampered)).toEqual(
      expect.arrayContaining([
        `Node ${carrier!.persona} carries trait Rare Antibody, but the build asked for Deathly Illness`,
      ]),
    )
  })

  it('requires the trait source to own the trait instead of carrying it', () => {
    const fixture = TRAIT_DIRECT!
    const source = build(fixture.target, [], {
      name: fixture.trait,
      from: fixture.source,
    })
    const plan = solve(data, settings, source)[0]
    expect(replay(data, settings, source, plan)).toEqual([])

    const tampered = JSON.parse(JSON.stringify(plan)) as Plan
    const sourceLeaf = allNodes(tampered).find(
      (node) => node.persona === fixture.source && node.recipe === null,
    )
    expect(sourceLeaf).toBeDefined()
    sourceLeaf!.carriesTrait = fixture.trait

    expect(replay(data, settings, source, tampered)).toEqual(
      expect.arrayContaining([
        `Trait ${fixture.trait} does not trace back to ${fixture.source}`,
      ]),
    )
  })
})
