import type { GameData } from '../data/types'
import { canInherit } from './inheritance'
import { isSkillInheritable } from './rules'

export type SkillSource =
  | { kind: 'innate' }
  | { kind: 'card' }
  | { kind: 'persona'; persona: string }
  | { kind: 'held'; persona: string }

export type Build = {
  target: string
  skills: { name: string; source: SkillSource }[]
  trait: null | { name: string; from: string }
}

/**
 * The valid sources for one skill of a target: innate first when the target
 * learns it, then one persona source per other persona that learns it natively.
 * Persona sources only exist when the target can inherit the skill at all.
 * Cards and held sources are added by later tasks.
 */
export function sourceOptions(
  data: GameData,
  target: string,
  skill: string,
): SkillSource[] {
  const targetEntry = data.personas.find((entry) => entry.name === target)
  const skillEntry = data.skills.find((entry) => entry.name === skill)
  if (!targetEntry || !skillEntry) return []

  const options: SkillSource[] = []
  if (skill in targetEntry.skills) options.push({ kind: 'innate' })

  if (canInherit(data, target, skill)) {
    for (const persona of data.personas) {
      if (persona.name === target) continue
      if (skill in persona.skills) {
        options.push({ kind: 'persona', persona: persona.name })
      }
    }
  }

  return options
}

function capitalize(value: string): string {
  if (value === '') return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Why no source is available for a skill, or null when at least one is.
 * Used by the form in place of an empty source select.
 */
export function sourceUnavailableReason(
  data: GameData,
  target: string,
  skill: string,
): string | null {
  if (sourceOptions(data, target, skill).length > 0) return null

  const skillEntry = data.skills.find((entry) => entry.name === skill)
  if (!skillEntry) return 'Unknown skill'

  if (!isSkillInheritable(skillEntry)) {
    const owners = Object.keys(skillEntry.personas)
    return owners.length > 0 ? `unique to ${owners[0]}` : 'This skill is unique'
  }

  const targetEntry = data.personas.find((entry) => entry.name === target)
  if (targetEntry && !canInherit(data, target, skill)) {
    return `${target} cannot inherit ${capitalize(skillEntry.element)} skills`
  }

  return 'No persona learns this skill'
}
