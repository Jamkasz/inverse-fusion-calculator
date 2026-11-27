import { describe, expect, it } from 'vitest'
import { loadGameData } from '../src/data/load'
import type { GameData } from '../src/data/types'
import { createFusion } from '../src/engine/fusion'
import goldenSource from './golden/fusions.json?raw'

type GoldenSection = Record<string, string | null>
type GoldenFile = { noDlc: GoldenSection; allDlc: GoldenSection }

// The file is compiled into the test bundle as a raw string so TypeScript does
// not have to infer a literal type from ~48k keys.
const golden = JSON.parse(goldenSource) as GoldenFile

type Mismatch = {
  key: string
  expected: string | null | undefined
  actual: string | null
}

type ParityResult = {
  config: string
  personas: number
  pairs: number
  goldenKeys: number
  mismatches: number
  samples: Mismatch[]
}

/** Canonical, order-independent pair key using default JS string comparison. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function checkParity(
  config: string,
  data: GameData,
  section: GoldenSection,
): ParityResult {
  const fusion = createFusion(data, { allowRare: true })
  const names = data.personas.map((persona) => persona.name)

  const mismatches: Mismatch[] = []
  let mismatchCount = 0
  let pairs = 0

  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      pairs += 1
      const key = pairKey(names[i], names[j])

      if (!Object.hasOwn(section, key)) {
        mismatchCount += 1
        if (mismatches.length < 20) {
          mismatches.push({ key, expected: undefined, actual: fusion.fuse(names[i], names[j]) })
        }
        continue
      }

      const expected = section[key]
      const actual = fusion.fuse(names[i], names[j])
      if (actual !== expected) {
        mismatchCount += 1
        if (mismatches.length < 20) {
          mismatches.push({ key, expected, actual })
        }
      }
    }
  }

  return {
    config,
    personas: names.length,
    pairs,
    goldenKeys: Object.keys(section).length,
    mismatches: mismatchCount,
    samples: mismatches,
  }
}

function expectParity(result: ParityResult): void {
  expect({
    config: result.config,
    personas: result.personas,
    pairs: result.pairs,
    goldenKeys: result.goldenKeys,
    mismatches: result.mismatches,
    samples: result.samples,
  }).toEqual({
    config: result.config,
    personas: result.personas,
    pairs: result.pairs,
    // A stale extra or missing key also fails parity, not just a wrong value.
    goldenKeys: result.pairs,
    mismatches: 0,
    samples: [],
  })
}

describe('golden parity: no DLC owned', () => {
  it('matches the reference for every unordered persona pair', () => {
    const data = loadGameData({ ownedDlc: [] })
    expectParity(checkParity('noDlc', data, golden.noDlc))
  })
})

describe('golden parity: all DLC owned', () => {
  it('matches the reference for every unordered persona pair', () => {
    const allDlc = [...new Set(loadGameData({ ownedDlc: [] }).dlcGroups.flat())]
    const data = loadGameData({ ownedDlc: allDlc })
    expectParity(checkParity('allDlc', data, golden.allDlc))
  })
})
