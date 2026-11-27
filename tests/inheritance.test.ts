import { describe, expect, it } from 'vitest'
import { loadGameData } from '../src/data/load'
import type { GameData, Persona } from '../src/data/types'
import { canInherit, inheritCapacity } from '../src/engine/inheritance'
import { sourceOptions, sourceUnavailableReason } from '../src/engine/build'

const data = loadGameData({ ownedDlc: [] })

const CHART_COLUMNS = [
  'phys',
  'gun',
  'fire',
  'ice',
  'electric',
  'wind',
  'psy',
  'nuclear',
  'bless',
  'curse',
  'healing',
  'ailment',
]
const ELEMENTS_WITHOUT_A_COLUMN = ['almighty', 'support', 'passive']

describe('canInherit', () => {
  it('rejects unique skills and elements the target cannot inherit', () => {
    expect(canInherit(data, 'Agathion', 'Hassou Tobi')).toBe(false)
    expect(canInherit(data, 'Jack Frost', 'Agi')).toBe(false)
  })

  it('always accepts elements without a chart column', () => {
    expect(canInherit(data, 'Yoshitsune', 'Dodge Elec')).toBe(true)
  })

  it('treats a missing inherit type as the Almighty row', () => {
    // Regent is a rare treasure demon with inherits === null.
    expect(canInherit(data, 'Regent', 'Garu')).toBe(true)
  })

  it('rejects an inherit type whose chart row is missing', () => {
    const broken: GameData = {
      ...data,
      inheritanceChart: { ...data.inheritanceChart },
    }
    delete broken.inheritanceChart.Electric

    expect(canInherit(broken, 'Agathion', 'Agi')).toBe(false)
  })

  it('has no skill element outside the chart columns or the free elements', () => {
    const allowed = new Set([...CHART_COLUMNS, ...ELEMENTS_WITHOUT_A_COLUMN])
    const elements = [...new Set(data.skills.map((skill) => skill.element))]
    for (const element of elements) {
      expect(allowed.has(element)).toBe(true)
    }
  })
})

describe('inheritCapacity', () => {
  it('caps inheritance by base skills and ingredient count', () => {
    expect(inheritCapacity(data, 'Neko Shogun', 2)).toBe(4)
    expect(inheritCapacity(data, 'Neko Shogun', 3)).toBe(5)
  })

  it('leaves only two slots for a synthetic persona with six base skills', () => {
    const synthetic: Persona = {
      name: 'Six Skill Persona',
      arcana: 'Fool',
      level: 1,
      skills: {
        Agi: 0,
        Bufu: 0,
        Zio: 0,
        Garu: 0,
        Psi: 0,
        Kouha: 0,
      },
      trait: 'Rare Antibody',
      inherits: 'Almighty',
      special: false,
      rare: false,
      dlc: false,
    }
    const cloned: GameData = {
      ...data,
      personas: [...data.personas, synthetic],
    }

    expect(inheritCapacity(cloned, 'Six Skill Persona', 2)).toBe(2)
  })

  it('clamps to zero when base skills fill or exceed the moveset', () => {
    // Crystal Skull has eleven level-0 entries in its skills map.
    expect(inheritCapacity(data, 'Crystal Skull', 2)).toBe(0)
  })
})

describe('sourceOptions', () => {
  it('lists innate first for a skill the target learns', () => {
    const options = sourceOptions(data, 'Agathion', 'Zio')
    expect(options[0]).toEqual({ kind: 'innate' })
    expect(options).not.toContainEqual({ kind: 'persona', persona: 'Agathion' })
    for (const option of options) {
      expect(['innate', 'persona']).toContain(option.kind)
    }
  })

  it('lists only non-target personas that learn the skill', () => {
    expect(sourceOptions(data, 'Agathion', 'Kouha')).toEqual([
      { kind: 'persona', persona: 'Angel' },
    ])
  })

  it('is empty when the target cannot inherit the skill', () => {
    expect(sourceOptions(data, 'Jack Frost', 'Agi')).toEqual([])
    expect(sourceOptions(data, 'Agathion', 'Hassou Tobi')).toEqual([])
  })
})

describe('sourceUnavailableReason', () => {
  it('explains unique, wrong-element, unknown and valid cases', () => {
    expect(sourceUnavailableReason(data, 'Agathion', 'Hassou Tobi')).toBe(
      'unique to Yoshitsune',
    )
    expect(sourceUnavailableReason(data, 'Jack Frost', 'Agi')).toBe(
      'Jack Frost cannot inherit Fire skills',
    )
    expect(sourceUnavailableReason(data, 'Agathion', 'Garu')).toBe(
      'Agathion cannot inherit Wind skills',
    )
    expect(sourceUnavailableReason(data, 'Agathion', 'Definitely Not A Skill')).toBe(
      'Unknown skill',
    )
    expect(sourceUnavailableReason(data, 'Agathion', 'Zio')).toBeNull()
  })
})
