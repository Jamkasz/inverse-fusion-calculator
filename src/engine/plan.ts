import type { CardSources, GameData } from '../data/types'
import type { Build } from './build'
import { DISPUTED_INHERIT_TYPE, MAX_SKILLS, minTotalSkillsFor } from './rules'
import type { Node, Plan } from './solver'

export type Step =
  | {
      kind: 'obtain'
      persona: string
      levelTo: number | null
      learns: string[]
      holds: string[]
    }
  | {
      kind: 'fuse'
      ingredients: string[]
      result: string
      inherit: string[]
      trait: { name: string; from: string } | null
      skillsNeeded: number
      skillsHeld: number
      disputedInheritType: boolean
    }
  | { kind: 'card'; skill: string; cardSources: CardSources }
  | { kind: 'level'; persona: string; levelTo: number; learns: string[] }

/** Highest positive learn level a node must reach, or 0 when it has none. */
function requiredLevel(node: Node): number {
  let level = 0
  for (const learn of node.learns) {
    if (learn.level !== null && learn.level > level) level = learn.level
  }
  return level
}

/**
 * How many skills an ingredient naturally holds at the level the plan requires
 * of it: everything it learns at or below that level, plus the skills it
 * carries, plus the skills it holds from `held` sources, capped at eight.
 */
function naturalSkillCount(data: GameData, node: Node): number {
  const persona = data.personas.find((entry) => entry.name === node.persona)
  if (!persona) return 0

  const level = requiredLevel(node)
  const learned = Object.values(persona.skills).filter(
    (learnLevel) => learnLevel <= level,
  ).length
  const held = node.learns.filter((learn) => learn.level === null).length

  return Math.min(MAX_SKILLS, learned + node.carries.length + held)
}

function obtainStep(node: Node): Step {
  const learns: string[] = []
  const holds: string[] = []
  for (const learn of node.learns) {
    if (learn.level === null) holds.push(learn.skill)
    else learns.push(learn.skill)
  }
  const level = requiredLevel(node)
  return {
    kind: 'obtain',
    persona: node.persona,
    levelTo: level > 0 ? level : null,
    learns,
    holds,
  }
}

function fuseStep(
  data: GameData,
  node: Node,
  recipe: NonNullable<Node['recipe']>,
): Step {
  const inherit = recipe.inherit.map((entry) => entry.skill)
  const ingredients = recipe.ingredients.map(
    (ingredient) => ingredient.persona,
  )

  let trait: { name: string; from: string } | null = null
  if (recipe.traitFrom !== null) {
    const from = recipe.ingredients[recipe.traitFrom]?.persona ?? ''
    trait = { name: node.carriesTrait ?? '', from }
  }

  return {
    kind: 'fuse',
    ingredients,
    result: node.persona,
    inherit,
    trait,
    skillsNeeded: minTotalSkillsFor(inherit.length),
    skillsHeld: recipe.ingredients.reduce(
      (total, ingredient) => total + naturalSkillCount(data, ingredient),
      0,
    ),
    disputedInheritType:
      DISPUTED_INHERIT_TYPE.includes(node.persona) && inherit.length > 0,
  }
}

/**
 * The leveling step a fused node needs before a parent fusion can use the
 * skills it learned above base level, or null when it has none.
 */
function nodeLevelStep(node: Node): Step | null {
  const level = requiredLevel(node)
  if (level === 0) return null
  return {
    kind: 'level',
    persona: node.persona,
    levelTo: level,
    learns: node.learns
      .filter(
        (learn): learn is { skill: string; level: number } =>
          learn.level !== null && learn.level > 0,
      )
      .map((learn) => learn.skill),
  }
}

/**
 * Turns a plan tree into the ordered instructions the user performs: ingredient
 * steps before their fusion (a post-order walk), a leveling step immediately
 * after any fused node whose learned skills must be leveled before a parent
 * fusion uses them, then skill cards, then a single final leveling step for the
 * target's innate skills above base level.
 */
export function toSteps(data: GameData, build: Build, plan: Plan): Step[] {
  const steps: Step[] = []

  function walk(node: Node): void {
    if (node.recipe === null) {
      steps.push(obtainStep(node))
      return
    }
    for (const ingredient of node.recipe.ingredients) walk(ingredient)
    steps.push(fuseStep(data, node, node.recipe))
    const level = nodeLevelStep(node)
    if (level) steps.push(level)
  }

  walk(plan.root)

  for (const row of build.skills) {
    if (row.source.kind !== 'card') continue
    const skill = data.skills.find((entry) => entry.name === row.name)
    if (!skill) continue
    steps.push({ kind: 'card', skill: row.name, cardSources: skill.cardSources })
  }

  const target = data.personas.find((entry) => entry.name === build.target)
  if (target) {
    const innate: { skill: string; level: number }[] = []
    for (const row of build.skills) {
      if (row.source.kind !== 'innate') continue
      const level = target.skills[row.name]
      if (typeof level === 'number' && level > 0) {
        innate.push({ skill: row.name, level })
      }
    }
    if (innate.length > 0) {
      steps.push({
        kind: 'level',
        persona: build.target,
        levelTo: Math.max(...innate.map((entry) => entry.level)),
        learns: innate.map((entry) => entry.skill),
      })
    }
  }

  return steps
}
