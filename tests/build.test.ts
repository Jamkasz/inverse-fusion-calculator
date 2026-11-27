import { describe, expect, it } from 'vitest'
import { loadGameData } from '../src/data/load'
import { createFusion } from '../src/engine/fusion'
import { buildRecipeIndex } from '../src/engine/recipes'
import { inheritedCapacity, validateBuild } from '../src/engine/build'
import type { Build, SkillSource } from '../src/engine/build'

const data = loadGameData({ ownedDlc: [] })
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

function innate(name: string): SkillRow {
  return { name, source: { kind: 'innate' } }
}

function card(name: string): SkillRow {
  return { name, source: { kind: 'card' } }
}

function persona(name: string, source: string): SkillRow {
  return { name, source: { kind: 'persona', persona: source } }
}

function held(name: string, source: string): SkillRow {
  return { name, source: { kind: 'held', persona: source } }
}

describe('validateBuild', () => {
  it('returns UNKNOWN_TARGET immediately', () => {
    const errors = validateBuild(data, recipes, build('Nope', []))
    expect(errors.map((error) => error.code)).toEqual(['UNKNOWN_TARGET'])
    expect(errors[0].row).toBeUndefined()
  })

  it('reports an unknown skill in a row', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [innate('Definitely Not A Skill')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['UNKNOWN_SKILL'])
    expect(errors[0].row).toBe(0)
  })

  it('reports an unknown persona source', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [persona('Zio', 'Nope')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['UNKNOWN_SOURCE_PERSONA'])
    expect(errors[0].row).toBe(0)
  })

  it('reports an empty held persona source', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [held('Agi', '')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['UNKNOWN_SOURCE_PERSONA'])
    expect(errors[0].row).toBe(0)
    expect(errors[0].message).toBe('Choose a persona that already has the skill')
  })

  it('reports an unknown held persona source', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [held('Agi', 'Nope')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['UNKNOWN_SOURCE_PERSONA'])
    expect(errors[0].row).toBe(0)
    expect(errors[0].message).toBe('Unknown source persona: Nope')
  })

  it('reports TOO_MANY_SKILLS without row errors for valid card rows', () => {
    const names = [
      'Absorb Curse',
      'Absorb Fire',
      'Absorb Phys',
      'Abysmal Surge',
      'Adverse Resolve',
      'Agi',
      'Agidyne',
      'Agilao',
      'Assault Dive',
    ]
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', names.map(card)),
    )
    expect(errors.map((error) => error.code)).toEqual(['TOO_MANY_SKILLS'])
    expect(errors[0].row).toBeUndefined()
  })

  it('reports a duplicate skill on the second row', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [innate('Dia'), innate('Dia')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['DUPLICATE_SKILL'])
    expect(errors[0].row).toBe(1)
  })

  it('reports a non-innate skill', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [innate('Agi')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['NOT_INNATE'])
    expect(errors[0].row).toBe(0)
  })

  it('reports a missing card', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [card('Absorb Bless')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['NO_CARD'])
    expect(errors[0].row).toBe(0)
  })

  it('reports a persona source that does not learn the skill', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [persona('Zio', 'Angel')]),
    )
    expect(errors.map((error) => error.code)).toEqual([
      'SOURCE_DOES_NOT_LEARN',
    ])
    expect(errors[0].row).toBe(0)
    expect(errors[0].message).toContain('already has it')
  })

  it('reports a held source that learns the skill natively', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [held('Zio', 'Pixie')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['HELD_IS_NATIVE'])
    expect(errors[0].row).toBe(0)
  })

  it('reports a held unique skill before checking the persona', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [held('Hassou Tobi', 'Pixie')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['HELD_UNIQUE'])
    expect(errors[0].row).toBe(0)
  })

  it('reports a held skill the target cannot inherit', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [held('Vacuum Wave', 'Pixie')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['NOT_INHERITABLE'])
    expect(errors[0].row).toBe(0)
  })

  it('reports a persona source whose target cannot inherit the skill', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [persona('Vacuum Wave', 'Pixie')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['NOT_INHERITABLE'])
    expect(errors[0].row).toBe(0)
  })

  it('reports the target as a persona source', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [persona('Zio', 'Agathion')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['SOURCE_IS_TARGET'])
    expect(errors[0].row).toBe(0)
  })

  it('reports the target as a held source with the held wording', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [held('Agi', 'Agathion')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['SOURCE_IS_TARGET'])
    expect(errors[0].message).toBe(
      'The target already has this skill; it cannot also supply it through fusion.',
    )
  })

  it('reports too many inherited skills for the target capacity', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [
        held('Agi', 'Crystal Skull'),
        held('Bufu', 'Crystal Skull'),
        held('Kouha', 'Crystal Skull'),
        held('Eiha', 'Crystal Skull'),
        held('Mazio', 'Crystal Skull'),
      ]),
    )
    expect(errors.map((error) => error.code)).toEqual(['TOO_MANY_INHERITED'])
    expect(errors[0].row).toBeUndefined()
    expect(inheritedCapacity(data, recipes, 'Agathion')).toBe(4)
    expect(errors[0].message).toContain('at most 4')
  })

  it('reports a source that cannot pass on a trait', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [innate('Zio')], {
        name: 'Ultimate Vessel',
        from: 'Crystal Skull',
      }),
    )
    expect(errors.map((error) => error.code)).toEqual([
      'TRAIT_NOT_INHERITABLE',
    ])
    expect(errors[0].row).toBeUndefined()
  })

  it('reports a trait that does not match the source persona', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Agathion', [innate('Zio')], {
        name: 'Rare Antibody',
        from: 'Pixie',
      }),
    )
    expect(errors.map((error) => error.code)).toEqual([
      'TRAIT_SOURCE_MISMATCH',
    ])
    expect(errors[0].row).toBeUndefined()
  })

  it('reports a rare target that would need inherited skills', () => {
    const errors = validateBuild(
      data,
      recipes,
      build('Regent', [held('Agi', 'Pixie')]),
    )
    expect(errors.map((error) => error.code)).toEqual(['TARGET_NOT_FUSABLE'])
    expect(errors[0].row).toBeUndefined()
  })

  it('accepts a valid innate build', () => {
    expect(
      validateBuild(data, recipes, build('Agathion', [innate('Zio')])),
    ).toEqual([])
  })

  it('accepts a valid held build', () => {
    expect(
      validateBuild(data, recipes, build('Agathion', [held('Agi', 'Pixie')])),
    ).toEqual([])
  })
})

describe('inheritedCapacity', () => {
  it('uses the largest recipe size the target can come from', () => {
    expect(inheritedCapacity(data, recipes, 'Agathion')).toBe(4)
    expect(inheritedCapacity(data, recipes, 'Neko Shogun')).toBe(5)
  })

  it('is zero when the target has no fusion recipe', () => {
    expect(inheritedCapacity(data, recipes, 'Regent')).toBe(0)
  })
})
