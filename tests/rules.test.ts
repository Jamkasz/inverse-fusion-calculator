import { describe, expect, it } from 'vitest'
import rawGameData from '../src/data/game-data.json'
import { loadGameData } from '../src/data/load'
import type { GameData, Persona, Skill } from '../src/data/types'
import {
  CARD_IGNORES_INHERIT_TYPE,
  DISPUTED_INHERIT_TYPE,
  MAX_SKILLS,
  RARE_INHERIT_TYPE,
  canPassTrait,
  inheritTier,
  isSkillInheritable,
  maxInherited,
  minTotalSkillsFor,
} from '../src/engine/rules'

const allData = rawGameData as unknown as GameData
const noDlcData = loadGameData({ ownedDlc: [] })

function persona(data: GameData, name: string): Persona {
  const found = data.personas.find((entry) => entry.name === name)
  if (!found) throw new Error(`Missing persona ${name}`)
  return found
}

function skill(data: GameData, name: string): Skill {
  const found = data.skills.find((entry) => entry.name === name)
  if (!found) throw new Error(`Missing skill ${name}`)
  return found
}

describe('inheritTier', () => {
  it('matches every boundary in the inheritance table', () => {
    expect(inheritTier(2)).toBe(0)
    expect(inheritTier(3)).toBe(1)
    expect(inheritTier(5)).toBe(1)
    expect(inheritTier(6)).toBe(2)
    expect(inheritTier(8)).toBe(2)
    expect(inheritTier(9)).toBe(3)
    expect(inheritTier(12)).toBe(3)
    expect(inheritTier(13)).toBe(4)
    expect(inheritTier(23)).toBe(4)
    expect(inheritTier(24)).toBe(5)
    expect(inheritTier(31)).toBe(5)
    expect(inheritTier(32)).toBe(6)
    expect(inheritTier(41)).toBe(6)
    // 42+ is treated as 6, never the disputed 8.
    expect(inheritTier(42)).toBe(6)
    expect(inheritTier(48)).toBe(6)
  })
})

describe('maxInherited', () => {
  it('uses the best case of eight skills per ingredient', () => {
    expect(maxInherited(2)).toBe(4)
    expect(maxInherited(3)).toBe(5)
    expect(maxInherited(4)).toBe(6)
    expect(maxInherited(5)).toBe(6)
    expect(maxInherited(6)).toBe(6)
  })
})

describe('minTotalSkillsFor', () => {
  it('is a lower bound for the tier of every total', () => {
    for (let total = 0; total <= 48; total += 1) {
      expect(minTotalSkillsFor(inheritTier(total))).toBeLessThanOrEqual(total)
    }
  })

  it('round-trips through inheritTier for every tier', () => {
    for (let count = 0; count <= 6; count += 1) {
      expect(inheritTier(minTotalSkillsFor(count))).toBe(count)
    }
  })
})

describe('canPassTrait', () => {
  it('rejects DLC personas, rejects treasure demons and accepts Agathion', () => {
    const dlc = allData.personas.find((entry) => entry.dlc)
    if (!dlc) throw new Error('Expected at least one DLC persona')

    expect(canPassTrait(dlc)).toBe(false)
    expect(canPassTrait(persona(noDlcData, 'Regent'))).toBe(false)
    expect(canPassTrait(persona(noDlcData, 'Agathion'))).toBe(true)
  })
})

describe('DISPUTED_INHERIT_TYPE', () => {
  it('names personas that all exist in the no-DLC data', () => {
    const names = new Set(noDlcData.personas.map((entry) => entry.name))
    expect(DISPUTED_INHERIT_TYPE).toEqual([
      'Clotho',
      'Hecatoncheires',
      'Macabre',
      'Mandrake',
      'Maria',
    ])
    for (const name of DISPUTED_INHERIT_TYPE) {
      expect(names.has(name)).toBe(true)
    }
  })
})

describe('isSkillInheritable and constants', () => {
  it('uses the unique flag', () => {
    expect(isSkillInheritable(skill(noDlcData, 'Hassou Tobi'))).toBe(false)
    expect(isSkillInheritable(skill(noDlcData, 'Agi'))).toBe(true)
  })

  it('exposes the researched constants', () => {
    expect(MAX_SKILLS).toBe(8)
    expect(CARD_IGNORES_INHERIT_TYPE).toBe(true)
    expect(RARE_INHERIT_TYPE).toBe('Almighty')
  })
})
