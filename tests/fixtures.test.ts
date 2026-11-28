import { describe, expect, it } from 'vitest'
import { loadGameData } from '../src/data/load'
import type { GameData, Persona, Skill } from '../src/data/types'
import { createFusion } from '../src/engine/fusion'
import { canInherit, inheritCapacity } from '../src/engine/inheritance'
import { buildRecipeIndex } from '../src/engine/recipes'
import { skillReach, traitReach } from '../src/engine/reach'
import {
  ADVANCED_INTERMEDIATE,
  ADVANCED_ONE,
  ADVANCED_TWO,
  DIRECT,
  HELD_DIRECT,
  MANY_RECIPES,
  OVER_CAPACITY,
  SAME_SOURCE_TWO_SKILLS,
  SIX_SKILLS,
  SOURCE_MUST_CARRY,
  TRAIT_DIRECT,
  TWO_SOURCES_ONE_RECIPE,
  TWO_STEP,
  UNREACHABLE,
} from './helpers/fixtures'

const data: GameData = loadGameData({ ownedDlc: [] })
const recipes = buildRecipeIndex(
  data,
  createFusion(data, { allowRare: false }),
  null,
)

function personaOf(name: string): Persona {
  const found = data.personas.find((persona) => persona.name === name)
  if (!found) throw new Error(`Missing persona ${name}`)
  return found
}

function skillOf(name: string): Skill {
  const found = data.skills.find((skill) => skill.name === name)
  if (!found) throw new Error(`Missing skill ${name}`)
  return found
}

function learns(persona: string, skill: string): boolean {
  return Object.hasOwn(personaOf(persona).skills, skill)
}

function recipesFor(target: string) {
  return recipes.get(target) ?? []
}

function expectReach(skill: string, source: string, target: string): number {
  const distance = skillReach(data, recipes, skill, source).get(target)
  if (distance === undefined) {
    throw new Error(`${target} is unreachable from ${source} for ${skill}`)
  }
  return distance
}

describe('fixtures', () => {
  it('DIRECT is a one-fusion source', () => {
    const fixture = DIRECT!
    expect(skillOf(fixture.skill).unique).toBe(false)
    expect(learns(fixture.source, fixture.skill)).toBe(true)
    expect(expectReach(fixture.skill, fixture.source, fixture.target)).toBe(1)
  })

  it('TWO_STEP is exactly two fusions', () => {
    const fixture = TWO_STEP!
    expect(skillOf(fixture.skill).unique).toBe(false)
    expect(learns(fixture.source, fixture.skill)).toBe(true)
    expect(expectReach(fixture.skill, fixture.source, fixture.target)).toBe(2)
  })

  it('HELD_DIRECT is an ingredient that does not learn the skill', () => {
    const fixture = HELD_DIRECT!
    expect(skillOf(fixture.skill).unique).toBe(false)
    expect(learns(fixture.source, fixture.skill)).toBe(false)
    expect(canInherit(data, fixture.target, fixture.skill)).toBe(true)
    expect(
      recipesFor(fixture.target).some((recipe) =>
        recipe.ingredients.includes(fixture.source),
      ),
    ).toBe(true)
  })

  it('TWO_SOURCES_ONE_RECIPE joins both sources in one recipe', () => {
    const fixture = TWO_SOURCES_ONE_RECIPE!
    const recipe = recipesFor(fixture.target).find(
      (candidate) =>
        candidate.ingredients.includes(fixture.a.source) &&
        candidate.ingredients.includes(fixture.b.source),
    )
    expect(recipe).toBeDefined()
    expect(fixture.a.skill).not.toBe(fixture.b.skill)

    for (const pair of [fixture.a, fixture.b]) {
      expect(learns(pair.source, pair.skill)).toBe(true)
      expect(skillOf(pair.skill).unique).toBe(false)
      expect(canInherit(data, fixture.target, pair.skill)).toBe(true)
    }
  })

  it('SAME_SOURCE_TWO_SKILLS reaches the target twice at distance 1', () => {
    const fixture = SAME_SOURCE_TWO_SKILLS!
    expect(fixture.skills).toHaveLength(2)
    for (const skill of fixture.skills) {
      expect(learns(fixture.source, skill)).toBe(true)
      expect(expectReach(skill, fixture.source, fixture.target)).toBe(1)
    }
  })

  it('SOURCE_MUST_CARRY needs a direct source plus a distance-1 feeder', () => {
    const fixture = SOURCE_MUST_CARRY!
    expect(
      recipesFor(fixture.target).some((recipe) =>
        recipe.ingredients.includes(fixture.a.source),
      ),
    ).toBe(true)
    expect(
      expectReach(fixture.b.skill, fixture.b.source, fixture.a.source),
    ).toBe(1)
    expect(learns(fixture.b.source, fixture.b.skill)).toBe(true)
    expect(learns(fixture.a.source, fixture.a.skill)).toBe(true)
    expect(canInherit(data, fixture.target, fixture.a.skill)).toBe(true)
    expect(canInherit(data, fixture.target, fixture.b.skill)).toBe(true)
  })

  it('OVER_CAPACITY exceeds what a two-ingredient fusion can inherit', () => {
    const fixture = OVER_CAPACITY!
    expect(fixture.skills.length).toBeGreaterThan(
      inheritCapacity(data, fixture.target, 2),
    )
    expect(new Set(fixture.skills.map((pair) => pair.skill)).size).toBe(
      fixture.skills.length,
    )
    for (const pair of fixture.skills) {
      expect(learns(pair.source, pair.skill)).toBe(true)
      expect(canInherit(data, fixture.target, pair.skill)).toBe(true)
      expect(
        skillReach(data, recipes, pair.skill, pair.source).has(fixture.target),
      ).toBe(true)
    }
  })

  it('TRAIT_DIRECT carries the source trait in one fusion', () => {
    const fixture = TRAIT_DIRECT!
    expect(personaOf(fixture.source).trait).toBe(fixture.trait)
    expect(traitReach(data, recipes, fixture.source).get(fixture.target)).toBe(1)
  })

  it('ADVANCED_ONE fuses a Kodama skill into Neko Shogun in one step', () => {
    const fixture = ADVANCED_ONE!
    expect(fixture.target).toBe('Neko Shogun')
    expect(fixture.source).toBe('Kodama')
    expect(learns(fixture.source, fixture.skill)).toBe(true)
    expect(expectReach(fixture.skill, fixture.source, fixture.target)).toBe(1)
  })

  it('ADVANCED_TWO fuses one Kodama and one Sudama skill in one step', () => {
    const fixture = ADVANCED_TWO!
    expect(fixture.target).toBe('Neko Shogun')
    expect(fixture.a.source).toBe('Kodama')
    expect(fixture.b.source).toBe('Sudama')
    expect(learns(fixture.a.source, fixture.a.skill)).toBe(true)
    expect(learns(fixture.b.source, fixture.b.skill)).toBe(true)
    expect(expectReach(fixture.a.skill, fixture.a.source, fixture.target)).toBe(1)
    expect(expectReach(fixture.b.skill, fixture.b.source, fixture.target)).toBe(1)
  })

  // No no-DLC build exists under the natural "special persona unavoidable on
  // every route" interpretation, so the generator writes null for this fixture.
  it.skipIf(ADVANCED_INTERMEDIATE === null)(
    'ADVANCED_INTERMEDIATE passes every route through a special persona',
    () => {
      const fixture = ADVANCED_INTERMEDIATE!
      for (const pair of fixture.skills) {
        expect(
          skillReach(data, recipes, pair.skill, pair.source).has(fixture.target),
        ).toBe(true)
      }
    },
  )

  it('MANY_RECIPES has at least five partner personas', () => {
    const fixture = MANY_RECIPES!
    expect(learns(fixture.source, fixture.skill)).toBe(true)
    expect(expectReach(fixture.skill, fixture.source, fixture.target)).toBe(1)

    const partners = new Set<string>()
    for (const recipe of recipesFor(fixture.target)) {
      if (!recipe.ingredients.includes(fixture.source)) continue
      for (const ingredient of recipe.ingredients) {
        if (ingredient !== fixture.source) partners.add(ingredient)
      }
    }
    expect(partners.size).toBeGreaterThanOrEqual(5)
  })

  it('SIX_SKILLS is one six-ingredient fusion worth six inherited skills', () => {
    const fixture = SIX_SKILLS!
    expect(fixture.skills).toHaveLength(6)

    const skills = fixture.skills.map((pair) => pair.skill)
    expect(new Set(skills).size).toBe(6)
    const sources = fixture.skills.map((pair) => pair.source)
    expect(new Set(sources).size).toBe(6)

    for (const pair of fixture.skills) {
      expect(learns(pair.source, pair.skill)).toBe(true)
      expect(canInherit(data, fixture.target, pair.skill)).toBe(true)
      expect(
        skillReach(data, recipes, pair.skill, pair.source).has(fixture.target),
      ).toBe(true)
    }

    const recipe = recipesFor(fixture.target).find((candidate) =>
      sources.every((source) => candidate.ingredients.includes(source)),
    )
    expect(recipe).toBeDefined()
    expect(
      inheritCapacity(data, fixture.target, recipe!.ingredients.length),
    ).toBeGreaterThanOrEqual(6)
  })

  it('UNREACHABLE is inheritable by the target but has no route', () => {
    const fixture = UNREACHABLE!
    expect(personaOf(fixture.source).name).toBe(fixture.source)
    expect(learns(fixture.source, fixture.skill)).toBe(true)
    expect(canInherit(data, fixture.target, fixture.skill)).toBe(true)
    expect(
      skillReach(data, recipes, fixture.skill, fixture.source).has(fixture.target),
    ).toBe(false)
  })
})
