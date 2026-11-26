#!/usr/bin/env node
// Converts the pinned reference data files into src/data/game-data.json.
//
// Usage: npm run data (fetch + build) or node tools/build-data.mjs
//
// The reference files declare their maps with top-level `var`, so evaluating
// all three in one `node:vm` context shares their scope. Anything declared with
// `const` would not be visible on the context object, which is why the script
// appends an explicit `globalThis.__d = {...}` assignment before running.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDir, '..')
const referenceDir = join(repoRoot, 'vendor', 'reference')
const outputPath = join(repoRoot, 'src', 'data', 'game-data.json')

/** Vendored files, concatenated in dependency order. */
const SOURCE_FILES = [
  join(referenceDir, 'data', 'Data5Royal.js'),
  join(referenceDir, 'data', 'PersonaDataRoyal.js'),
  join(referenceDir, 'data', 'SkillDataRoyal.js'),
]

/** Globals the build expects the reference files to define. */
const REQUIRED_GLOBALS = [
  'rarePersonaeRoyal',
  'rareCombosRoyal',
  'arcana2CombosRoyal',
  'specialCombosRoyal',
  'dlcPersonaRoyal',
  'inheritanceChartRoyal',
  'personaMapRoyal',
  'skillMapRoyal',
]

/** Assignment appended so `node:vm` cannot hide any top-level declaration. */
const EXPORT_LINE = `globalThis.__d = { ${REQUIRED_GLOBALS.join(', ')} };`

function loadReferenceData() {
  const source = SOURCE_FILES.map((file) => {
    try {
      return readFileSync(file, 'utf8')
    } catch (error) {
      throw new Error(`Cannot read reference file ${file}: ${error.message}`)
    }
  }).join('\n')

  const context = vm.createContext({})
  vm.runInContext(`${source}\n${EXPORT_LINE}`, context, {
    filename: 'reference-data-combined.js',
  })

  const data = context.__d
  if (!data || typeof data !== 'object') {
    throw new Error('Reference files did not assign globalThis.__d')
  }

  for (const key of REQUIRED_GLOBALS) {
    if (!(key in data) || data[key] === undefined || data[key] === null) {
      throw new Error(`Reference data is missing the global ${key}`)
    }
  }

  return data
}

function toPersonaList(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }
  for (const name of value) {
    if (typeof name !== 'string') {
      throw new Error(`${label} contains a non-string entry: ${String(name)}`)
    }
  }
  return value
}

function normaliseTalkField(talk) {
  if (talk === undefined) return []
  if (Array.isArray(talk)) return talk.slice()
  if (typeof talk === 'string') return [talk]
  throw new Error(`Unexpected talk field ${JSON.stringify(talk)}`)
}

function buildCardSourceMaps(personaMapRoyal) {
  const chair = new Map()
  const chairAlarm = new Map()

  const add = (map, key, personaName) => {
    if (typeof key !== 'string') return
    const list = map.get(key)
    if (list) list.push(personaName)
    else map.set(key, [personaName])
  }

  for (const [personaName, persona] of Object.entries(personaMapRoyal)) {
    if (persona.skillCard !== true) continue
    add(chair, persona.item, personaName)
    add(chairAlarm, persona.itemr, personaName)
  }

  return { chair, chairAlarm }
}

function main() {
  const data = loadReferenceData()

  const rarePersonae = toPersonaList(data.rarePersonaeRoyal, 'rarePersonaeRoyal')
  const dlcGroups = data.dlcPersonaRoyal
  if (!Array.isArray(dlcGroups)) {
    throw new Error('dlcPersonaRoyal must be an array of arrays')
  }
  const dlcPersonae = new Set(dlcGroups.flat())
  const rarePersonaeSet = new Set(rarePersonae)
  const specialNames = new Set(data.specialCombosRoyal.map((combo) => combo.result))

  const personaEntries = Object.entries(data.personaMapRoyal)
  const specialFlagCount = personaEntries.filter(
    ([, persona]) => persona.special === true,
  ).length

  let useSpecialFlag = specialFlagCount === 24
  if (!useSpecialFlag) {
    console.warn(
      `Warning: persona.special flagged ${specialFlagCount} personas, expected 24. Falling back to specialCombos results.`,
    )
  }

  const personas = personaEntries.map(([name, persona]) => ({
    name,
    arcana: persona.arcana,
    level: persona.level,
    skills: { ...(persona.skills ?? {}) },
    trait: persona.trait,
    inherits: persona.inherits ?? null,
    special: useSpecialFlag ? persona.special === true : specialNames.has(name),
    rare: rarePersonaeSet.has(name),
    dlc: dlcPersonae.has(name),
  }))

  const { chair, chairAlarm } = buildCardSourceMaps(data.personaMapRoyal)

  const skillEntries = Object.entries(data.skillMapRoyal)
  const skills = []
  const traits = []
  const fuseMismatches = []

  for (const [name, entry] of skillEntries) {
    const cardSources = {
      chair: (chair.get(name) ?? []).slice(),
      chairAlarm: (chairAlarm.get(name) ?? []).slice(),
      negotiation: normaliseTalkField(entry.talk),
    }

    const skill = {
      name,
      element: entry.element,
      effect: entry.effect,
      cost: typeof entry.cost === 'number' ? entry.cost : null,
      unique: 'unique' in entry,
      personas: { ...(entry.personas ?? {}) },
      cardSources,
      acquisitionNote: entry.card ?? null,
    }

    if (entry.element === 'trait') traits.push(skill)
    else skills.push(skill)

    // Informational only: the reference `fuse` summary should equal the union
    // of the normal and alarm chair lists derived from the persona data.
    const fuse = new Set(entry.fuse ?? [])
    const union = new Set([...cardSources.chair, ...cardSources.chairAlarm])
    const same =
      fuse.size === union.size && [...fuse].every((persona) => union.has(persona))
    if (!same) {
      fuseMismatches.push({
        skill: name,
        fuse: [...fuse].sort(),
        union: [...union].sort(),
      })
    }
  }

  const inheritanceChart = {}
  for (const [inherits, row] of Object.entries(data.inheritanceChartRoyal)) {
    if (!Array.isArray(row)) {
      throw new Error(`inheritanceChartRoyal[${inherits}] is not an array`)
    }
    inheritanceChart[inherits] = row.map((cell) => {
      if (cell === '✓') return true
      if (cell === '✘') return false
      throw new Error(
        `Unknown inheritance chart character ${JSON.stringify(cell)} in ${inherits}`,
      )
    })
  }

  const arcanaCombos = data.arcana2CombosRoyal.map((combo) => ({
    source: [combo.source[0], combo.source[1]],
    result: combo.result,
  }))

  const specialCombos = data.specialCombosRoyal.map((combo) => ({
    result: combo.result,
    sources: combo.sources.slice(),
  }))

  const gameData = {
    personas,
    skills,
    traits,
    arcanaCombos,
    specialCombos,
    rarePersonae: rarePersonae.slice(),
    rareCombos: data.rareCombosRoyal,
    inheritanceChart,
    dlcGroups,
  }

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(gameData, null, 2)}\n`, 'utf8')

  const total = skills.length + traits.length
  console.log('Generated src/data/game-data.json')
  console.log(`  personas:        ${personas.length}`)
  console.log(`  rare personas:   ${personas.filter((p) => p.rare).length}`)
  console.log(`  special personas: ${personas.filter((p) => p.special).length}`)
  console.log(`  DLC personas:    ${personas.filter((p) => p.dlc).length}`)
  console.log(`  DLC groups:      ${dlcGroups.length} (${dlcPersonae.size} names)`)
  console.log(`  skills:          ${skills.length}`)
  console.log(`  traits:          ${traits.length}`)
  console.log(`  skill entries:   ${total}`)
  console.log(`  chart inherit types: ${Object.keys(inheritanceChart).length}`)

  console.log(`\nFuse/chair mismatches (informational): ${fuseMismatches.length}`)
  for (const mismatch of fuseMismatches) {
    console.log(
      `  ${mismatch.skill}: fuse=${JSON.stringify(mismatch.fuse)} union=${JSON.stringify(mismatch.union)}`,
    )
  }
}

try {
  main()
} catch (error) {
  console.error(`\nbuild-data failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
