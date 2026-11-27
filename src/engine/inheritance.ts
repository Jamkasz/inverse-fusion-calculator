import type { GameData } from '../data/types'
import {
  MAX_SKILLS,
  RARE_INHERIT_TYPE,
  isSkillInheritable,
  maxInherited,
} from './rules'

/** The order of the inheritance chart's twelve boolean columns. */
export const INHERIT_COLUMNS = [
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
] as const

/**
 * Whether `persona` may inherit `skill` through fusion.
 *
 * Elements without a chart column (almighty, support, passive and anything
 * unknown) are always inheritable. Unique skills never are.
 */
export function canInherit(
  data: GameData,
  persona: string,
  skill: string,
): boolean {
  const personaEntry = data.personas.find((entry) => entry.name === persona)
  const skillEntry = data.skills.find((entry) => entry.name === skill)
  if (!personaEntry || !skillEntry) return false
  if (!isSkillInheritable(skillEntry)) return false

  const column = INHERIT_COLUMNS.findIndex(
    (element) => element === skillEntry.element,
  )
  if (column === -1) return true

  const inheritType = personaEntry.inherits ?? RARE_INHERIT_TYPE
  const row = data.inheritanceChart[inheritType]
  if (!row) return false
  return row[column] === true
}

/**
 * How many skills a fusion into `persona` can inherit: the best case for the
 * ingredient count, capped by the free slots above the persona's base skills.
 */
export function inheritCapacity(
  data: GameData,
  persona: string,
  ingredientCount: number,
): number {
  const personaEntry = data.personas.find((entry) => entry.name === persona)
  if (!personaEntry) return 0

  const baseSkillCount = Object.values(personaEntry.skills).filter(
    (level) => level === 0,
  ).length

  return Math.max(
    0,
    Math.min(
      maxInherited(ingredientCount),
      MAX_SKILLS - baseSkillCount,
    ),
  )
}
