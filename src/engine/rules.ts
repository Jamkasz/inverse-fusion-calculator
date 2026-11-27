import type { Persona, Skill } from '../data/types'

/** A persona holds at most eight skills. */
export const MAX_SKILLS = 8

/**
 * The researched inheritance table, indexed by the total number of skills held
 * by all ingredients. 42+ is conservatively treated as 6, never the disputed 8.
 */
export function inheritTier(totalIngredientSkills: number): number {
  if (totalIngredientSkills <= 2) return 0
  if (totalIngredientSkills <= 5) return 1
  if (totalIngredientSkills <= 8) return 2
  if (totalIngredientSkills <= 12) return 3
  if (totalIngredientSkills <= 23) return 4
  if (totalIngredientSkills <= 31) return 5
  return 6
}

/** Best case for a fusion with this many ingredients (eight skills each). */
export function maxInherited(ingredientCount: number): number {
  return inheritTier(MAX_SKILLS * ingredientCount)
}

const MIN_TOTAL_SKILLS = [0, 3, 6, 9, 13, 24, 32]

/**
 * The fewest ingredient-held skills that allow inheriting this many skills.
 * Out-of-range values are clamped defensively to 0 or the top tier.
 */
export function minTotalSkillsFor(inheritCount: number): number {
  const tier = Math.floor(inheritCount)
  if (tier <= 0) return MIN_TOTAL_SKILLS[0]
  if (tier >= MIN_TOTAL_SKILLS.length) {
    return MIN_TOTAL_SKILLS[MIN_TOTAL_SKILLS.length - 1]
  }
  return MIN_TOTAL_SKILLS[tier]
}

/** Skill cards can be used on any persona regardless of its inheritance type. */
export const CARD_IGNORES_INHERIT_TYPE = true

/** Skills flagged unique are never inheritable (or available as cards). */
export function isSkillInheritable(skill: Skill): boolean {
  return !skill.unique
}

/** DLC personas never pass a trait; treasure demons do not either in v1. */
export function canPassTrait(persona: Persona): boolean {
  return !persona.dlc && !persona.rare
}

/**
 * The 9 rare treasure demons lack an inheritance type in the reference data;
 * the second data source confirms they behave as Almighty.
 */
export const RARE_INHERIT_TYPE = 'Almighty'

/** The five personas whose inheritance type the two data sources disagree on. */
export const DISPUTED_INHERIT_TYPE: string[] = [
  'Clotho',
  'Hecatoncheires',
  'Macabre',
  'Mandrake',
  'Maria',
]
