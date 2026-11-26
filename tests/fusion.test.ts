import { describe, expect, it } from 'vitest'
import { loadGameData } from '../src/data/load'
import type { Persona } from '../src/data/types'
import { createFusion } from '../src/engine/fusion'

// Exercise the full committed data set (all DLC owned); the loader's DLC
// filtering is covered separately in tests/data.test.ts.
const unfiltered = loadGameData({ ownedDlc: [] })
const allDlc = [...new Set(unfiltered.dlcGroups.flat())]
const data = loadGameData({ ownedDlc: allDlc })
const fusion = createFusion(data, { allowRare: true })

const personas = data.personas
const personaByName = new Map<string, Persona>(
  personas.map((persona) => [persona.name, persona]),
)

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`
}

// Two-ingredient special fusions, keyed by their unordered ingredient names.
const special2Results = new Map<string, string>()
for (const combo of data.specialCombos) {
  if (combo.sources.length === 2) {
    special2Results.set(pairKey(combo.sources[0], combo.sources[1]), combo.result)
  }
}

describe('createFusion', () => {
  it('fuses the two-ingredient special Barong + Rangda into Shiva in both orders', () => {
    expect(fusion.fuse('Barong', 'Rangda')).toBe('Shiva')
    expect(fusion.fuse('Rangda', 'Barong')).toBe('Shiva')
  })

  it('fuses a normal non-special pair into the reference result', () => {
    // Reference-verified: this pair goes through fuseNormal (neither rare nor
    // a two-ingredient special fusion).
    expect(fusion.fuse('Arsène', 'Cait Sith')).toBe('Mokoi')
  })

  it('returns null for unknown persona names', () => {
    expect(fusion.fuse('Barong', 'Not A Persona')).toBeNull()
    expect(fusion.fuse('Not A Persona', 'Rangda')).toBeNull()
  })

  it('makes every non-null normal Fool + Magician result a Death persona', () => {
    // Rare fusion ignores the arcana-combo table (the result stays in the
    // normal persona's arcana), so only normal personas are covered here.
    const fools = personas.filter(
      (entry) => entry.arcana === 'Fool' && !entry.rare,
    )
    const magicians = personas.filter(
      (entry) => entry.arcana === 'Magician' && !entry.rare,
    )
    const deathNames = new Set(
      personas
        .filter((entry) => entry.arcana === 'Death')
        .map((entry) => entry.name),
    )

    const offenders: string[] = []
    let resolved = 0
    for (const fool of fools) {
      for (const magician of magicians) {
        const result = fusion.fuse(fool.name, magician.name)
        if (result !== null) resolved += 1
        if (result !== null && !deathNames.has(result)) {
          offenders.push(`${fool.name} + ${magician.name} => ${result}`)
        }
      }
    }

    // Reference-verified: 166 of the 176 non-rare Fool + Magician pairs resolve.
    // Without this the "all non-null results are Death" assertion would pass
    // vacuously if fuseNormal returned null everywhere.
    expect(resolved).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('never returns either ingredient from a same-arcana fusion', () => {
    const offenders: string[] = []
    let resolved = 0

    for (let i = 0; i < personas.length; i += 1) {
      for (let j = i; j < personas.length; j += 1) {
        const first = personas[i]
        const second = personas[j]
        if (first.arcana !== second.arcana) continue

        const result = fusion.fuse(first.name, second.name)
        if (result !== null) resolved += 1
        if (result === first.name || result === second.name) {
          offenders.push(`${first.name} + ${second.name} => ${result}`)
        }
      }
    }

    // Guard against the whole loop being vacuous if fusion returned null.
    expect(resolved).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('never produces a rare persona or an unexplained special persona', () => {
    const rareNames = new Set(
      personas.filter((entry) => entry.rare).map((entry) => entry.name),
    )
    const offenders: string[] = []
    let resolved = 0

    for (let i = 0; i < personas.length; i += 1) {
      for (let j = i + 1; j < personas.length; j += 1) {
        const first = personas[i]
        const second = personas[j]
        const result = fusion.fuse(first.name, second.name)
        if (result === null) continue
        resolved += 1

        if (rareNames.has(result)) {
          offenders.push(`rare result: ${first.name} + ${second.name} => ${result}`)
          continue
        }

        const resultPersona = personaByName.get(result)
        if (!resultPersona) {
          offenders.push(`unknown result: ${first.name} + ${second.name} => ${result}`)
          continue
        }

        if (resultPersona.special) {
          const expected = special2Results.get(pairKey(first.name, second.name))
          if (expected !== result) {
            offenders.push(
              `special result not a 2-ingredient combo: ${first.name} + ${second.name} => ${result}`,
            )
          }
        }
      }
    }

    // Guard against the whole loop being vacuous if fusion returned null.
    expect(resolved).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('is commutative for every pair', () => {
    const offenders: string[] = []
    let resolved = 0

    for (let i = 0; i < personas.length; i += 1) {
      for (let j = i; j < personas.length; j += 1) {
        const first = personas[i].name
        const second = personas[j].name
        const forward = fusion.fuse(first, second)
        if (forward !== null) resolved += 1
        if (forward !== fusion.fuse(second, first)) {
          offenders.push(`${first} | ${second}`)
        }
      }
    }

    // Null === null would otherwise make commutativity pass vacuously.
    expect(resolved).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('returns null for exactly-one-rare pairs when allowRare is false', () => {
    const noRare = createFusion(data, { allowRare: false })
    const nonRare = personas.filter((entry) => !entry.rare)

    const nonNull: string[] = []
    for (const other of nonRare) {
      if (noRare.fuse('Regent', other.name) !== null) {
        nonNull.push(other.name)
      }
    }

    expect(nonNull).toEqual([])

    // Sanity check that the same pairs are not always null: with rare fusion
    // enabled at least one of them must resolve.
    expect(nonRare.some((other) => fusion.fuse('Regent', other.name) !== null)).toBe(
      true,
    )
  })
})
