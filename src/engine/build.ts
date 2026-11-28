import type { GameData, Persona, Skill } from '../data/types'
import { canInherit, inheritCapacity } from './inheritance'
import { canPassTrait, isSkillInheritable, MAX_SKILLS } from './rules'
import type { Recipe } from './recipes'

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
 * Whether any of the reference card lists has an entry. Kept private so the
 * engine does not depend on the JSON loader; the loader filters the same lists
 * for unowned DLC.
 */
function hasCardSource(skill: Skill): boolean {
  const { chair, chairAlarm, negotiation } = skill.cardSources
  return chair.length > 0 || chairAlarm.length > 0 || negotiation.length > 0
}

/**
 * The valid sources for one skill of a target: innate first when the target
 * learns it, then a skill card if one exists, then one persona source per other
 * persona that learns it natively. Cards ignore the inheritance type, so they
 * appear even when no persona source does. Persona sources only exist when the
 * target can inherit the skill at all. Held sources are appended by the form and
 * are never listed here.
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

  if (isSkillInheritable(skillEntry) && hasCardSource(skillEntry)) {
    options.push({ kind: 'card' })
  }

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

export type BuildErrorCode =
  | 'UNKNOWN_TARGET'
  | 'UNKNOWN_SKILL'
  | 'UNKNOWN_SOURCE_PERSONA'
  | 'TOO_MANY_SKILLS'
  | 'DUPLICATE_SKILL'
  | 'NOT_INNATE'
  | 'NO_CARD'
  | 'SOURCE_DOES_NOT_LEARN'
  | 'HELD_IS_NATIVE'
  | 'HELD_UNIQUE'
  | 'NOT_INHERITABLE'
  | 'SOURCE_IS_TARGET'
  | 'TOO_MANY_INHERITED'
  | 'TRAIT_NOT_INHERITABLE'
  | 'TRAIT_SOURCE_MISMATCH'
  | 'TARGET_NOT_FUSABLE'

export type BuildError = {
  code: BuildErrorCode
  message: string
  row?: number
}

/**
 * The most skills the target can inherit in one fusion: the best inheritance
 * capacity across every recipe size that can produce it. Targets that cannot be
 * fused (such as the rare treasure demons) have no capacity.
 */
export function inheritedCapacity(
  data: GameData,
  recipes: Map<string, Recipe[]>,
  target: string,
): number {
  const targetRecipes = recipes.get(target)
  if (!targetRecipes || targetRecipes.length === 0) return 0

  let capacity = 0
  for (const size of new Set(
    targetRecipes.map((recipe) => recipe.ingredients.length),
  )) {
    capacity = Math.max(capacity, inheritCapacity(data, target, size))
  }
  return capacity
}

function sourceError(
  data: GameData,
  target: Persona,
  skill: Skill,
  source: SkillSource,
  row: number,
): BuildError | null {
  switch (source.kind) {
    case 'innate':
      if (!(skill.name in target.skills)) {
        return {
          code: 'NOT_INNATE',
          message: `${target.name} does not learn ${skill.name} natively`,
          row,
        }
      }
      return null

    case 'card':
      if (!isSkillInheritable(skill) || !hasCardSource(skill)) {
        return {
          code: 'NO_CARD',
          message: `No skill card is available for ${skill.name}`,
          row,
        }
      }
      return null

    case 'persona': {
      const persona = data.personas.find(
        (entry) => entry.name === source.persona,
      )
      if (!persona) {
        return {
          code: 'UNKNOWN_SOURCE_PERSONA',
          message: `Unknown source persona: ${source.persona}`,
          row,
        }
      }
      if (persona.name === target.name) {
        return {
          code: 'SOURCE_IS_TARGET',
          message: `${target.name} is the target; choose a different persona source`,
          row,
        }
      }
      if (!canInherit(data, target.name, skill.name)) {
        return {
          code: 'NOT_INHERITABLE',
          message: `${target.name} cannot inherit ${skill.name}`,
          row,
        }
      }
      if (!(skill.name in persona.skills)) {
        return {
          code: 'SOURCE_DOES_NOT_LEARN',
          message: `${persona.name} does not learn ${skill.name}; use "already has it" if they hold it without learning it`,
          row,
        }
      }
      return null
    }

    case 'held': {
      if (!isSkillInheritable(skill)) {
        return {
          code: 'HELD_UNIQUE',
          message: `${skill.name} is unique and cannot be inherited`,
          row,
        }
      }
      if (source.persona === '') {
        return {
          code: 'UNKNOWN_SOURCE_PERSONA',
          message: 'Choose a persona that already has the skill',
          row,
        }
      }
      const persona = data.personas.find(
        (entry) => entry.name === source.persona,
      )
      if (!persona) {
        return {
          code: 'UNKNOWN_SOURCE_PERSONA',
          message: `Unknown source persona: ${source.persona}`,
          row,
        }
      }
      if (persona.name === target.name) {
        return {
          code: 'SOURCE_IS_TARGET',
          message:
            'The target already has this skill; it cannot also supply it through fusion.',
          row,
        }
      }
      if (skill.name in persona.skills) {
        return {
          code: 'HELD_IS_NATIVE',
          message: `${persona.name} learns ${skill.name} natively; choose them as a persona source instead`,
          row,
        }
      }
      if (!canInherit(data, target.name, skill.name)) {
        return {
          code: 'NOT_INHERITABLE',
          message: `${target.name} cannot inherit ${skill.name}`,
          row,
        }
      }
      return null
    }
  }
}

function traitError(
  data: GameData,
  target: Persona,
  trait: NonNullable<Build['trait']>,
): BuildError | null {
  const persona = data.personas.find((entry) => entry.name === trait.from)
  if (!persona) {
    return {
      code: 'UNKNOWN_SOURCE_PERSONA',
      message: `Unknown source persona: ${trait.from}`,
    }
  }
  // Explicit "keep own" names the target's own trait from the target itself, so
  // it needs no trait passing. This deliberately bypasses canPassTrait so a DLC
  // or treasure-demon target can still be left as it is.
  if (trait.from === target.name && target.trait === trait.name) {
    return null
  }
  if (!canPassTrait(persona)) {
    return {
      code: 'TRAIT_NOT_INHERITABLE',
      message: `${persona.name} cannot pass on a trait`,
    }
  }
  if (persona.trait !== trait.name) {
    return {
      code: 'TRAIT_SOURCE_MISMATCH',
      message: `${persona.name}'s own trait is ${persona.trait}, not ${trait.name}`,
    }
  }
  return null
}

/**
 * Every error in a proposed build. Row errors carry a zero-based index into
 * `build.skills`; form-level errors do not. Each row reports at most one source
 * error so a bad choice does not cascade into unrelated messages.
 */
export function validateBuild(
  data: GameData,
  recipes: Map<string, Recipe[]>,
  build: Build,
): BuildError[] {
  const target = data.personas.find((entry) => entry.name === build.target)
  if (!target) {
    return [{ code: 'UNKNOWN_TARGET', message: `Unknown target: ${build.target}` }]
  }

  const errors: BuildError[] = []
  if (build.skills.length > MAX_SKILLS) {
    errors.push({
      code: 'TOO_MANY_SKILLS',
      message: `A persona can have at most ${MAX_SKILLS} skills`,
    })
  }

  const seen = new Set<string>()
  let inherited = 0

  build.skills.forEach((row, index) => {
    if (row.source.kind === 'persona' || row.source.kind === 'held') {
      inherited += 1
    }

    const skill = data.skills.find((entry) => entry.name === row.name)
    if (!skill) {
      errors.push({
        code: 'UNKNOWN_SKILL',
        message: `Unknown skill: ${row.name}`,
        row: index,
      })
      return
    }

    if (seen.has(row.name)) {
      errors.push({
        code: 'DUPLICATE_SKILL',
        message: `Duplicate skill: ${row.name}`,
        row: index,
      })
    } else {
      seen.add(row.name)
    }

    const error = sourceError(data, target, skill, row.source, index)
    if (error) errors.push(error)
  })

  const keepsOwnTrait =
    build.trait !== null &&
    build.trait.from === target.name &&
    target.trait === build.trait.name

  if (build.trait !== null) {
    const error = traitError(data, target, build.trait)
    if (error) errors.push(error)
  }

  if (target.rare && (inherited > 0 || (build.trait !== null && !keepsOwnTrait))) {
    errors.push({
      code: 'TARGET_NOT_FUSABLE',
      message: `${target.name} is a treasure demon and cannot be fused`,
    })
  } else if (!target.rare) {
    const capacity = inheritedCapacity(data, recipes, target.name)
    if (inherited > capacity) {
      errors.push({
        code: 'TOO_MANY_INHERITED',
        message: `This build inherits ${inherited} skills, but ${target.name} can inherit at most ${capacity} in one fusion`,
      })
    }
  }

  return errors
}
