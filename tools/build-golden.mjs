#!/usr/bin/env node
// Generates tests/golden/fusions.json: the reference calculator's forward
// fusion result for every unordered pair of distinct personas, once with no DLC
// owned and once with every DLC persona owned.
//
// Usage: npm run golden (or node tools/build-golden.mjs)
//
// The vendored files declare their maps with top-level `var`, so evaluating all
// of them in one `node:vm` context shares their scope. DataUtil's top-level
// IIFEs run immediately and mutate the persona objects, so every DLC
// configuration gets its own fresh context.
//
// Output is compact, deterministic JSON (stable key order, JSON.stringify with
// no indentation, trailing newline). Re-running must produce identical bytes.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDir, '..')
const referenceDir = join(repoRoot, 'vendor', 'reference')
const outputPath = join(repoRoot, 'tests', 'golden', 'fusions.json')

const DLC_DATA_FILE = join(referenceDir, 'data', 'Data5Royal.js')

/** Data files, concatenated first so the alias block can refer to the …Royal globals. */
const DATA_FILES = [
  join(referenceDir, 'data', 'Data5Royal.js'),
  join(referenceDir, 'data', 'PersonaDataRoyal.js'),
  join(referenceDir, 'data', 'SkillDataRoyal.js'),
]

/** Logic files, concatenated after the alias block (which mirrors indexRoyal.html). */
const LOGIC_FILES = [
  join(referenceDir, 'src', 'DataUtil.js'),
  join(referenceDir, 'src', 'FusionCalculator.js'),
]

/**
 * The reference code expects the unsuffixed globals. This mirrors the inline
 * script in vendor/reference/indexRoyal.html, inserted after the data files and
 * before DataUtil.js so its top-level IIFEs see the aliases.
 */
const ALIAS_BLOCK = [
  'var rarePersonae = rarePersonaeRoyal;',
  'var rareCombos = rareCombosRoyal;',
  'var arcana2Combos = arcana2CombosRoyal;',
  'var specialCombos = specialCombosRoyal;',
  'var dlcPersona = dlcPersonaRoyal;',
  'var personaMap = personaMapRoyal;',
  'var skillMap = skillMapRoyal;',
  'var inheritanceChart = inheritanceChartRoyal;',
].join('\n')

/**
 * Appended after FusionCalculator.js. The calculator must use DataUtil's
 * DLC-filtered grouping (customPersonaeByArcana), not a regrouping of
 * fullPersonaList. Exposes a host-friendly name-based `fuse`.
 */
const EXPORT_BLOCK = [
  'var __goldenCalculator = new FusionCalculator(customPersonaeByArcana);',
  'globalThis.__goldenRef = {',
  '  names: customPersonaList.map(function (persona) { return persona.name; }),',
  '  fuse: function (a, b) {',
  '    var result = __goldenCalculator.fuse(personaMap[a], personaMap[b]);',
  '    return result ? result.name : null;',
  '  }',
  '};',
].join('\n')

/** Expected persona and pair counts, from the pinned data. */
const EXPECTED = {
  noDlc: { personas: 207, pairs: (207 * 206) / 2 },
  allDlc: { personas: 232, pairs: (232 * 231) / 2 },
}

function readSource(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    throw new Error(`Cannot read reference file ${file}: ${error.message}`)
  }
}

/**
 * Reads the 25 DLC persona names from the pinned Data5Royal.js. This runs in a
 * throwaway context; it does not create a DLC configuration context.
 */
function readDlcPersonaNames() {
  const context = vm.createContext({})
  vm.runInContext(readSource(DLC_DATA_FILE), context, {
    filename: 'Data5Royal.js',
  })

  const groups = context.dlcPersonaRoyal
  if (!Array.isArray(groups) || !groups.every((group) => Array.isArray(group))) {
    throw new Error('dlcPersonaRoyal must be an array of arrays')
  }

  const names = groups.flat()
  if (!names.every((name) => typeof name === 'string')) {
    throw new Error('dlcPersonaRoyal contains a non-string entry')
  }
  return names
}

/**
 * Loads the reference in a fresh vm context for one DLC configuration and
 * returns the calculator's name-based API.
 */
function loadReference(allDlc, dlcNames) {
  const source = [
    ...DATA_FILES.map(readSource),
    ALIAS_BLOCK,
    ...LOGIC_FILES.map(readSource),
    EXPORT_BLOCK,
  ].join('\n')

  // DataUtil reads localStorage["dlcPersona"] and JSON.parse(...)[name] === true.
  const localStorage = allDlc
    ? {
        dlcPersona: JSON.stringify(
          Object.fromEntries(dlcNames.map((name) => [name, true])),
        ),
      }
    : {}

  const context = vm.createContext({ localStorage })
  vm.runInContext(source, context, {
    filename: allDlc ? 'reference-all-dlc-combined.js' : 'reference-no-dlc-combined.js',
  })

  const ref = context.__goldenRef
  if (!ref || typeof ref !== 'object') {
    throw new Error('Reference files did not assign globalThis.__goldenRef')
  }
  if (!Array.isArray(ref.names) || typeof ref.fuse !== 'function') {
    throw new Error('globalThis.__goldenRef is missing names or fuse')
  }
  return ref
}

/** Canonical, order-independent pair key using default JS string comparison. */
function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function buildSection(ref, label) {
  const { names, fuse } = ref
  const expected = EXPECTED[label]

  if (names.length !== expected.personas) {
    throw new Error(
      `${label}: expected ${expected.personas} personas, got ${names.length}`,
    )
  }
  for (const name of names) {
    if (typeof name !== 'string') {
      throw new Error(`${label}: non-string persona name ${String(name)}`)
    }
    if (name.includes('|')) {
      throw new Error(`${label}: persona name contains "|": ${name}`)
    }
  }

  const section = {}
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = names[i]
      const b = names[j]
      section[pairKey(a, b)] = fuse(a, b)
    }
  }

  const pairs = Object.keys(section).length
  if (pairs !== expected.pairs) {
    throw new Error(
      `${label}: expected ${expected.pairs} pairs, got ${pairs}`,
    )
  }

  return { section, personas: names.length, pairs }
}

function main() {
  const dlcNames = readDlcPersonaNames()

  const noDlc = buildSection(loadReference(false, dlcNames), 'noDlc')
  const allDlc = buildSection(loadReference(true, dlcNames), 'allDlc')

  const golden = {
    noDlc: noDlc.section,
    allDlc: allDlc.section,
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(golden)}\n`, 'utf8')

  console.log('Generated tests/golden/fusions.json')
  console.log(`  noDlc:  ${noDlc.personas} personas, ${noDlc.pairs} pairs`)
  console.log(`  allDlc: ${allDlc.personas} personas, ${allDlc.pairs} pairs`)
}

try {
  main()
} catch (error) {
  console.error(
    `\nbuild-golden failed: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
}
