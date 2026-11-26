import type { GameData, Persona } from '../data/types'
import type { Settings } from '../settings'

/**
 * Forward fusion. This is a direct port of `FusionCalculator.fuse`,
 * `getSpecialFuseResult`, `fuseNormal` and `fuseRare` from
 * `vendor/reference/src/FusionCalculator.ts`, following the reference's
 * "Forward fusion [REF]" control flow so the two can be diffed side by side.
 *
 * Only the local data shape differs: persona names are the public ids, so the
 * API takes and returns names, and the reference's global lookup tables
 * (`personaMap`, `personaeByArcana`, `arcanaMap`, ...) are built once here from
 * the supplied `GameData`.
 */
export function createFusion(
  data: GameData,
  settings: Pick<Settings, 'allowRare'>,
): { fuse(a: string, b: string): string | null } {
  const personaMap = new Map<string, Persona>()
  for (const persona of data.personas) {
    personaMap.set(persona.name, persona)
  }

  // Reference `personaeByArcana`: grouped by arcana, sorted by level ascending.
  const personaeByArcana: Record<string, Persona[]> = {}
  for (const persona of data.personas) {
    const list = personaeByArcana[persona.arcana]
    if (list) list.push(persona)
    else personaeByArcana[persona.arcana] = [persona]
  }
  for (const list of Object.values(personaeByArcana)) {
    list.sort((a, b) => a.level - b.level)
  }

  // Reference `arcanaMap`: filled in both directions from `arcana2Combos`.
  const arcanaMap: Record<string, Record<string, string>> = {}
  for (const combo of data.arcanaCombos) {
    const [source1, source2] = combo.source
    if (!arcanaMap[source1]) arcanaMap[source1] = {}
    arcanaMap[source1][source2] = combo.result
    if (!arcanaMap[source2]) arcanaMap[source2] = {}
    arcanaMap[source2][source1] = combo.result
  }

  // Reference `special2Combos`: the two-ingredient special fusions only.
  const special2Combos = data.specialCombos.filter(
    (combo) => combo.sources.length === 2,
  )

  const rareIndex = new Map<string, number>()
  data.rarePersonae.forEach((name, index) => rareIndex.set(name, index))

  function getResultArcana(arcana1: string, arcana2: string): string | null {
    return arcanaMap[arcana1]?.[arcana2] ?? null
  }

  function getSpecialFuseResult(
    persona1: Persona,
    persona2: Persona,
  ): Persona | null {
    for (const combo of special2Combos) {
      if (
        (persona1.name === combo.sources[0] &&
          persona2.name === combo.sources[1]) ||
        (persona2.name === combo.sources[0] &&
          persona1.name === combo.sources[1])
      ) {
        return personaMap.get(combo.result) ?? null
      }
    }
    return null
  }

  /** Does not handle rare fusion and special fusion. */
  function fuseNormal(persona1: Persona, persona2: Persona): Persona | null {
    // don't handle rare fusion between a normal persona and a rare persona
    if ((persona1.rare && !persona2.rare) || (persona2.rare && !persona1.rare)) {
      return null
    }

    // don't handle 2-persona-special fusions
    if (getSpecialFuseResult(persona1, persona2) !== null) {
      return null
    }

    const level = 1 + Math.floor((persona1.level + persona2.level) / 2)
    const arcana = getResultArcana(persona1.arcana, persona2.arcana)
    if (!arcana) {
      // only Judgement + [Justice/Strength/Chariot/Death] can result in this
      return null
    }

    const personae = personaeByArcana[arcana] ?? []

    let persona: Persona | null = null
    let found = false
    if (persona1.arcana === persona2.arcana) {
      // same-arcana down-rank fusion
      for (let i = personae.length - 1; i >= 0; i--) {
        persona = personae[i]
        if (persona.level <= level) {
          if (
            persona.special ||
            persona.rare ||
            persona === persona1 ||
            persona === persona2
          )
            continue
          found = true
          break
        }
      }
    } else {
      // different-arcana fusion
      for (let i = 0; i < personae.length; i++) {
        persona = personae[i]
        if (persona.level >= level) {
          if (persona.special || persona.rare) continue
          found = true
          break
        }
      }
    }

    return found ? persona : null
  }

  /** Fuse a rare persona with a normal persona. */
  function fuseRare(
    rarePersona: Persona,
    mainPersona: Persona,
  ): Persona | null {
    const combos = data.rareCombos[mainPersona.arcana]
    const rarePosition = rareIndex.get(rarePersona.name)
    if (!combos || rarePosition === undefined) return null
    if (rarePosition < 0 || rarePosition >= combos.length) return null

    let modifier = combos[rarePosition]
    const personae = personaeByArcana[mainPersona.arcana] ?? []
    const mainPersonaIndex = personae.indexOf(mainPersona)
    let newPersona: Persona | undefined = personae[mainPersonaIndex + modifier]

    if (!newPersona) {
      return null
    }

    while (newPersona && (newPersona.special || newPersona.rare)) {
      if (modifier > 0) modifier++
      else if (modifier < 0) modifier--
      // The reference data never uses a 0 modifier, but guard against an
      // infinite loop if it ever did.
      else return null

      newPersona = personae[mainPersonaIndex + modifier]
    }

    return newPersona ?? null
  }

  function fuse(a: string, b: string): string | null {
    const persona1 = personaMap.get(a)
    const persona2 = personaMap.get(b)
    if (!persona1 || !persona2) return null

    // special fusion
    const special = getSpecialFuseResult(persona1, persona2)
    if (special !== null) {
      return special.name
    }

    // rare fusion
    if ((persona1.rare && !persona2.rare) || (!persona1.rare && persona2.rare)) {
      if (!settings.allowRare) {
        // Exactly-one-rare pairs are disabled when rare fusions are off.
        return null
      }
      const rarePersona = persona1.rare ? persona1 : persona2
      const normalPersona = persona1.rare ? persona2 : persona1
      return fuseRare(rarePersona, normalPersona)?.name ?? null
    }

    // either both rare or both normal => normal fusion
    return fuseNormal(persona1, persona2)?.name ?? null
  }

  return { fuse }
}
