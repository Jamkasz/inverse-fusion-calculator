import { describe, expect, it } from 'vitest'
import rawGameData from '../src/data/game-data.json'
import type { GameData, Persona, Skill } from '../src/data/types'
import { formatCost, hasCard, loadGameData, personasByArcana } from '../src/data/load'

const data = rawGameData as unknown as GameData

function persona(name: string): Persona {
  const found = data.personas.find((entry) => entry.name === name)
  if (!found) throw new Error(`Missing persona ${name}`)
  return found
}

function skill(name: string): Skill {
  const found = data.skills.find((entry) => entry.name === name)
  if (!found) throw new Error(`Missing skill ${name}`)
  return found
}

const allDlcNames = [...new Set(data.dlcGroups.flat())]

describe('game-data.json', () => {
  it('contains the expected counts', () => {
    expect(data.personas).toHaveLength(232)
    expect(data.personas.filter((entry) => entry.rare)).toHaveLength(9)
    expect(data.personas.filter((entry) => entry.special)).toHaveLength(24)
    expect(data.personas.filter((entry) => entry.dlc)).toHaveLength(25)

    expect(data.dlcGroups).toHaveLength(13)
    expect(data.dlcGroups.flat()).toHaveLength(25)

    expect(data.traits).toHaveLength(90)

    // The plan's 459 figure is a miscount; the pinned skillMapRoyal has 525
    // entries (435 skills + 90 traits), verified against
    // vendor/reference/data/SkillDataRoyal.js.
    expect(data.skills).toHaveLength(435)
    expect(data.skills.length + data.traits.length).toBe(525)
  })

  it('removes unowned DLC personas and keeps the full set when all are owned', () => {
    expect(loadGameData({ ownedDlc: [] }).personas).toHaveLength(207)
    expect(loadGameData({ ownedDlc: allDlcNames }).personas).toHaveLength(232)
  })

  it('resolves every persona trait and every persona skill key', () => {
    const skillNames = new Set(data.skills.map((entry) => entry.name))
    const traitNames = new Set(data.traits.map((entry) => entry.name))
    const rareNames = new Set(
      data.personas.filter((entry) => entry.rare).map((entry) => entry.name),
    )

    const missingTraits: string[] = []
    const unresolvedKeys: string[] = []
    const traitValuedKeys: { persona: string; skill: string }[] = []

    for (const entry of data.personas) {
      if (!traitNames.has(entry.trait)) missingTraits.push(entry.name)
      for (const name of Object.keys(entry.skills)) {
        if (skillNames.has(name)) continue
        if (traitNames.has(name)) {
          traitValuedKeys.push({ persona: entry.name, skill: name })
        } else {
          unresolvedKeys.push(`${entry.name}: ${name}`)
        }
      }
    }

    expect(missingTraits).toEqual([])
    expect(unresolvedKeys).toEqual([])

    // These are the treasure demons' three extra traits each. They sit in the
    // reference `persona.skills` map even though they are traits; v1 does not
    // use them, but the data must still be represented and testable.
    expect(traitValuedKeys).toHaveLength(27)
    expect(traitValuedKeys.every((entry) => rareNames.has(entry.persona))).toBe(true)
    expect(new Set(traitValuedKeys.map((entry) => entry.persona)).size).toBe(9)

    const traitKeysPerRarePersona = new Map<string, number>()
    for (const entry of traitValuedKeys) {
      traitKeysPerRarePersona.set(
        entry.persona,
        (traitKeysPerRarePersona.get(entry.persona) ?? 0) + 1,
      )
    }
    expect([...traitKeysPerRarePersona.values()]).toEqual(Array(9).fill(3))
  })

  it('matches known persona facts', () => {
    const agathion = persona('Agathion')
    expect(agathion.arcana).toBe('Chariot')
    expect(agathion.level).toBe(3)
    expect(agathion.skills.Zio).toBe(7)
    expect(agathion.trait).toBe('Rare Antibody')
    expect(agathion.inherits).toBe('Electric')

    expect(persona('Abaddon').trait).toBe('Mouth of Savoring')
  })

  it('has a valid inheritance type for every persona and twelve chart columns', () => {
    const chartKeys = new Set(Object.keys(data.inheritanceChart))

    const badNonRare = data.personas
      .filter((entry) => !entry.rare)
      .filter((entry) => entry.inherits === null || !chartKeys.has(entry.inherits))
      .map((entry) => entry.name)
    const badRare = data.personas
      .filter((entry) => entry.rare && entry.inherits !== null)
      .map((entry) => entry.name)

    expect(badNonRare).toEqual([])
    expect(badRare).toEqual([])

    for (const row of Object.values(data.inheritanceChart)) {
      expect(row).toHaveLength(12)
    }
  })

  it('derives skill-card sources from the persona data', () => {
    expect(skill('Zio').cardSources.chair).toContain('Agathion')
    expect(skill('Mazio').cardSources.chairAlarm).toContain('Agathion')
    expect(skill('Abysmal Surge').cardSources.negotiation).toEqual([
      'Awakened God (Arahabaki)',
    ])
  })

  it('gives every skill and trait a non-empty effect', () => {
    const emptyEffects = [...data.skills, ...data.traits]
      .filter((entry) => entry.effect.trim() === '')
      .map((entry) => entry.name)
    expect(emptyEffects).toEqual([])
  })

  it('keeps the acquisition note separate from card sources', () => {
    const networkFusion = skill('Almighty Amp')
    expect(networkFusion.acquisitionNote).toBe('Network Fusion')

    const allCardNames = [
      ...networkFusion.cardSources.chair,
      ...networkFusion.cardSources.chairAlarm,
      ...networkFusion.cardSources.negotiation,
    ]
    expect(allCardNames).not.toContain('Network Fusion')
    expect(hasCard(networkFusion)).toBe(allCardNames.length > 0)

    const synthetic: Skill = {
      name: 'Synthetic',
      element: 'passive',
      effect: 'Synthetic effect.',
      cost: null,
      unique: false,
      personas: {},
      cardSources: { chair: [], chairAlarm: [], negotiation: [] },
      acquisitionNote: 'Network Fusion',
    }
    expect(hasCard(synthetic)).toBe(false)
  })

  it('formats costs as SP, % HP or "-"', () => {
    expect(formatCost(skill('Abysmal Surge'))).toBe('8 SP')

    const passive = data.skills.find((entry) => entry.element === 'passive')
    expect(passive).toBeDefined()
    if (passive) expect(formatCost(passive)).toBe('-')

    const hpCosted = data.skills.find(
      (entry) => entry.cost !== null && entry.cost > 0 && entry.cost < 100,
    )
    expect(hpCosted).toBeDefined()
    if (hpCosted && hpCosted.cost !== null) {
      expect(formatCost(hpCosted)).toBe(`${hpCosted.cost}% HP`)
    }
  })

  it('never references an unowned DLC persona after filtering', () => {
    const dlcNames = new Set(
      data.personas.filter((entry) => entry.dlc).map((entry) => entry.name),
    )
    const filtered = loadGameData({ ownedDlc: [] })

    expect(filtered.personas.some((entry) => entry.dlc)).toBe(false)
    expect(filtered.personas.filter((entry) => dlcNames.has(entry.name))).toEqual([])

    const leaked: string[] = []
    for (const entry of [...filtered.skills, ...filtered.traits]) {
      const cardNames = [
        ...entry.cardSources.chair,
        ...entry.cardSources.chairAlarm,
        ...entry.cardSources.negotiation,
      ]
      for (const name of cardNames) {
        if (dlcNames.has(name)) leaked.push(`${entry.name}: card ${name}`)
      }
      for (const name of Object.keys(entry.personas)) {
        if (dlcNames.has(name)) leaked.push(`${entry.name}: persona ${name}`)
      }
    }
    expect(leaked).toEqual([])
  })

  it('returns independent data on every call and never exposes the import', () => {
    const first = loadGameData({ ownedDlc: [] })
    const second = loadGameData({ ownedDlc: [] })

    expect(first).not.toBe(second)
    expect(first.personas).not.toBe(second.personas)
    expect(first.personas[0]).not.toBe(second.personas[0])
    expect(first.skills[0]).not.toBe(second.skills[0])
    expect(first.skills[0].cardSources.chair).not.toBe(
      second.skills[0].cardSources.chair,
    )
    expect(first.dlcGroups).not.toBe(second.dlcGroups)
    expect(first.dlcGroups[0]).not.toBe(second.dlcGroups[0])

    first.personas.pop()
    first.skills[0].cardSources.chair.push('X')
    first.dlcGroups.push([])

    const fresh = loadGameData({ ownedDlc: [] })
    expect(fresh.personas).toHaveLength(207)
    expect(fresh.skills).toHaveLength(435)
    expect(fresh.dlcGroups).toHaveLength(13)
    expect(fresh.personas.some((entry) => entry.name === 'X')).toBe(false)
    expect(
      fresh.skills.some((entry) => entry.cardSources.chair.includes('X')),
    ).toBe(false)
  })

  it('groups personas by arcana sorted by level without mutating its input', () => {
    const before = data.personas.map((entry) => entry.name)
    const grouped = personasByArcana(data)
    const after = data.personas.map((entry) => entry.name)

    expect(after).toEqual(before)
    expect(Object.values(grouped).flat()).toHaveLength(data.personas.length)

    const arcanaKeys = Object.keys(grouped)
    expect(arcanaKeys).toEqual([...arcanaKeys].sort())

    for (const list of Object.values(grouped)) {
      for (let index = 1; index < list.length; index += 1) {
        expect(list[index].level).toBeGreaterThanOrEqual(list[index - 1].level)
      }
    }
  })
})
