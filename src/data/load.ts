import type { Settings } from '../settings'
import type { GameData, Persona, Skill } from './types'
import rawGameData from './game-data.json'

// Negotiation entries are stored as "Shadow (Persona)" strings.
const NEGOTIATION_PERSONA_PATTERN = /\(([^)]+)\)\s*$/

function removeNames<T>(record: Record<string, T>, removed: Set<string>): Record<string, T> {
  const result: Record<string, T> = {}
  for (const [name, value] of Object.entries(record)) {
    if (!removed.has(name)) result[name] = value
  }
  return result
}

function removeListed(names: string[], removed: Set<string>): string[] {
  return names.filter((name) => !removed.has(name))
}

function removeNegotiationEntries(names: string[], removed: Set<string>): string[] {
  // An entry is removed if the whole string is a removed DLC persona, or if the
  // persona name inside the trailing parentheses is a removed DLC persona.
  return names.filter((name) => {
    if (removed.has(name)) return false
    const match = NEGOTIATION_PERSONA_PATTERN.exec(name)
    return !(match && removed.has(match[1]))
  })
}

function filterSkill(skill: Skill, removed: Set<string>): Skill {
  return {
    ...skill,
    personas: removeNames(skill.personas, removed),
    cardSources: {
      chair: removeListed(skill.cardSources.chair, removed),
      chairAlarm: removeListed(skill.cardSources.chairAlarm, removed),
      negotiation: removeNegotiationEntries(skill.cardSources.negotiation, removed),
    },
  }
}

/**
 * Returns the game data with every unowned DLC persona removed, as required by
 * Game Rules §5: they are removed from every list before any calculation.
 * Always returns a deep, independent copy, so callers can never mutate the
 * imported JSON or a value returned by another call. `dlcGroups` stays intact
 * for settings UIs.
 */
export function loadGameData(settings: Pick<Settings, 'ownedDlc'>): GameData {
  // structuredClone is available in Node 22+ and all supported browsers.
  const data = structuredClone(rawGameData) as unknown as GameData

  const owned = new Set(settings.ownedDlc)
  const removed = new Set(
    data.personas
      .filter((persona) => persona.dlc && !owned.has(persona.name))
      .map((persona) => persona.name),
  )

  if (removed.size === 0) {
    return data
  }

  data.personas = data.personas.filter((persona) => !removed.has(persona.name))
  data.skills = data.skills.map((skill) => filterSkill(skill, removed))
  data.traits = data.traits.map((trait) => filterSkill(trait, removed))
  data.rarePersonae = removeListed(data.rarePersonae, removed)
  return data
}

/** Personas grouped by arcana; each group sorted by base level ascending. */
export function personasByArcana(data: GameData): Record<string, Persona[]> {
  const groups: Record<string, Persona[]> = {}
  for (const persona of data.personas) {
    const list = groups[persona.arcana]
    if (list) list.push(persona)
    else groups[persona.arcana] = [persona]
  }

  const sorted: Record<string, Persona[]> = {}
  for (const arcana of Object.keys(groups).sort()) {
    sorted[arcana] = groups[arcana].slice().sort((a, b) => a.level - b.level)
  }
  return sorted
}

/** A skill is offered as a card source only if at least one card list is non-empty. */
export function hasCard(skill: Skill): boolean {
  const { chair, chairAlarm, negotiation } = skill.cardSources
  return chair.length > 0 || chairAlarm.length > 0 || negotiation.length > 0
}

/**
 * Reference costs: below 100 means % HP, otherwise cost / 100 SP.
 * Passives and traits have no cost and render as "-".
 */
export function formatCost(skill: Skill): string {
  if (skill.cost === null) return '-'
  if (skill.cost < 100) return `${skill.cost}% HP`
  return `${skill.cost / 100} SP`
}
