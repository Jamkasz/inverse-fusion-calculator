import type { GameData, Persona } from '../../src/data/types'
import type { Build } from '../../src/engine/build'
import { createFusion } from '../../src/engine/fusion'
import { canInherit, inheritCapacity } from '../../src/engine/inheritance'
import { buildRecipeIndex } from '../../src/engine/recipes'
import { canPassTrait } from '../../src/engine/rules'
import type { Node, Plan } from '../../src/engine/solver'
import type { Settings } from '../../src/settings'

function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((value, index) => value === sortedB[index])
}

/**
 * Re-derives a plan from scratch and returns every violation it finds. An empty
 * list means the plan is valid: every node is produced by a real fusion, every
 * inherited skill respects the inheritance rules and traces back to its
 * designated source, and the reported totals match the tree.
 */
export function replay(
  data: GameData,
  settings: Settings,
  build: Build,
  plan: Plan,
): string[] {
  const violations: string[] = []
  const fusion = createFusion(data, { allowRare: settings.allowRare })
  // Building the index exercises the same recipe set the solver used.
  const recipes = buildRecipeIndex(data, fusion, settings.playerLevel)
  const personaByName = new Map<string, Persona>(
    data.personas.map((persona) => [persona.name, persona]),
  )

  let fusions = 0
  let cost = 0

  const requestedInherited = new Set(
    build.skills
      .filter(
        (row) => row.source.kind === 'persona' || row.source.kind === 'held',
      )
      .map((row) => row.name),
  )

  function buildRow(skill: string): Build['skills'][number] | undefined {
    return build.skills.find((row) => row.name === skill)
  }

  function learnsSkill(node: Node, skill: string): boolean {
    return node.learns.some((entry) => entry.skill === skill)
  }

  /** A node holds a skill if it learns it, carries it, or inherits it itself. */
  function holdsSkill(node: Node, skill: string): boolean {
    if (learnsSkill(node, skill)) return true
    if (node.carries.includes(skill)) return true
    if (node.recipe?.inherit.some((entry) => entry.skill === skill)) {
      return true
    }
    return false
  }

  function validateLeaf(node: Node): void {
    if (node.carries.length > 0) {
      violations.push(
        `Leaf ${node.persona} cannot carry inherited skills (${node.carries.join(', ')})`,
      )
    }
    if (node.carriesTrait !== null) {
      violations.push(
        `Leaf ${node.persona} cannot carry an inherited trait (${node.carriesTrait})`,
      )
    }

    const persona = personaByName.get(node.persona)
    if (!persona) return

    for (const learn of node.learns) {
      const row = buildRow(learn.skill)
      if (!row) {
        violations.push(
          `Leaf ${node.persona} supplies ${learn.skill}, which is not part of the build`,
        )
        continue
      }
      if (row.source.kind !== 'persona' && row.source.kind !== 'held') {
        violations.push(
          `Leaf ${node.persona} supplies ${learn.skill}, but its build source is ${row.source.kind}`,
        )
        continue
      }
      if (node.persona !== row.source.persona) {
        violations.push(
          `Leaf ${node.persona} does not match the source ${row.source.persona} of ${learn.skill}`,
        )
        continue
      }

      if (row.source.kind === 'persona') {
        if (!Object.hasOwn(persona.skills, learn.skill)) {
          violations.push(
            `Leaf ${node.persona} does not learn ${learn.skill} natively`,
          )
        } else if (learn.level !== persona.skills[learn.skill]) {
          violations.push(
            `Leaf ${node.persona} must learn ${learn.skill} at level ${persona.skills[learn.skill]}, got ${learn.level}`,
          )
        }
      } else {
        if (learn.level !== null) {
          violations.push(
            `Held leaf ${node.persona} must carry ${learn.skill} at level null, got ${learn.level}`,
          )
        }
        if (Object.hasOwn(persona.skills, learn.skill)) {
          violations.push(
            `Held leaf ${node.persona} learns ${learn.skill} natively; it should be a persona source`,
          )
        }
      }
    }
  }

  function validateFused(
    node: Node,
    recipe: NonNullable<Node['recipe']>,
    ancestorsForChildren: ReadonlySet<string>,
  ): void {
    const ingredients = recipe.ingredients
    const persona = personaByName.get(node.persona)

    // A held skill belongs to a fixed owned leaf; a fused persona cannot
    // already hold a skill it did not learn natively.
    for (const learn of node.learns) {
      if (learn.level === null) {
        violations.push(
          `Fused persona ${node.persona} cannot already hold ${learn.skill}`,
        )
      }
    }

    if (!persona) {
      violations.push(`Unknown fused persona: ${node.persona}`)
    } else if (
      settings.playerLevel !== null &&
      persona.level > settings.playerLevel
    ) {
      violations.push(
        `Fused ${node.persona} has base level ${persona.level}, above the player level ${settings.playerLevel}`,
      )
    }

    // The ingredients must really produce this persona.
    if (ingredients.length === 2) {
      const result = fusion.fuse(
        ingredients[0].persona,
        ingredients[1].persona,
      )
      if (result !== node.persona) {
        violations.push(
          `Fusing ${ingredients[0].persona} + ${ingredients[1].persona} gives ${result ?? 'nothing'}, not ${node.persona}`,
        )
      }
    } else {
      const combo = data.specialCombos.find(
        (candidate) =>
          candidate.result === node.persona &&
          sameMultiset(
            candidate.sources,
            ingredients.map((ingredient) => ingredient.persona),
          ),
      )
      if (!combo) {
        violations.push(
          `No special combination produces ${node.persona} from ${ingredients.map((ingredient) => ingredient.persona).join(', ')}`,
        )
      }
    }

    // Inheritance rules.
    const capacity = inheritCapacity(data, node.persona, ingredients.length)
    if (recipe.inherit.length > capacity) {
      violations.push(
        `${node.persona} inherits ${recipe.inherit.length} skills, above its capacity of ${capacity}`,
      )
    }

    for (const entry of recipe.inherit) {
      if (!requestedInherited.has(entry.skill)) {
        violations.push(
          `${node.persona} inherits ${entry.skill}, which the build did not request as an inherited skill`,
        )
      }
      if (!canInherit(data, node.persona, entry.skill)) {
        violations.push(`${node.persona} cannot inherit ${entry.skill}`)
      }
      if (
        !Number.isInteger(entry.from) ||
        entry.from < 0 ||
        entry.from >= ingredients.length
      ) {
        violations.push(
          `Inheritance of ${entry.skill} points at ingredient ${entry.from}, which does not exist`,
        )
        continue
      }
      const from = ingredients[entry.from]
      if (!holdsSkill(from, entry.skill)) {
        violations.push(
          `Ingredient ${from.persona} does not hold ${entry.skill}, inherited by ${node.persona}`,
        )
      }
    }

    // Carries must be exactly the inherited skill names.
    const carried = [...node.carries].sort()
    const inherited = recipe.inherit.map((entry) => entry.skill).sort()
    if (
      carried.length !== inherited.length ||
      carried.some((skill, index) => skill !== inherited[index])
    ) {
      violations.push(
        `${node.persona} carries ${node.carries.join(', ') || 'nothing'} but inherits ${recipe.inherit.map((entry) => entry.skill).join(', ') || 'nothing'}`,
      )
    }

    // A carried trait must come from a valid, trait-passing ingredient that
    // holds the same trait.
    if (node.carriesTrait === null) {
      if (recipe.traitFrom !== null) {
        violations.push(
          `${node.persona} has a trait source but does not carry a trait`,
        )
      }
    } else if (recipe.traitFrom === null) {
      violations.push(
        `${node.persona} carries trait ${node.carriesTrait} but has no trait source`,
      )
    } else if (
      !Number.isInteger(recipe.traitFrom) ||
      recipe.traitFrom < 0 ||
      recipe.traitFrom >= ingredients.length
    ) {
      violations.push(
        `Trait source ${recipe.traitFrom} of ${node.persona} does not exist`,
      )
    } else {
      const source = ingredients[recipe.traitFrom]
      const sourcePersona = personaByName.get(source.persona)
      if (sourcePersona && !canPassTrait(sourcePersona)) {
        violations.push(`${source.persona} cannot pass on a trait`)
      }
      const holdsTrait =
        source.carriesTrait !== null
          ? source.carriesTrait === node.carriesTrait
          : sourcePersona?.trait === node.carriesTrait
      if (!holdsTrait) {
        violations.push(
          `${source.persona} does not hold trait ${node.carriesTrait}`,
        )
      }
    }

    // Tree totals use the same recipe cost as the solver's index.
    fusions += 1
    const matchingRecipe = recipes
      .get(node.persona)
      ?.find((candidate) =>
        sameMultiset(
          candidate.ingredients,
          ingredients.map((ingredient) => ingredient.persona),
        ),
      )
    if (matchingRecipe) {
      cost += matchingRecipe.cost
    } else {
      violations.push(
        `No recipe in the index produces ${node.persona} from ${ingredients.map((ingredient) => ingredient.persona).join(', ')}`,
      )
    }

    for (const ingredient of ingredients) {
      walk(ingredient, ancestorsForChildren, false)
    }
  }

  function walk(
    node: Node,
    ancestors: ReadonlySet<string>,
    isRoot: boolean,
  ): void {
    if (!isRoot && node.persona === build.target) {
      violations.push(
        `Descendant ${node.persona} repeats the root target ${build.target}`,
      )
    }
    if (node.recipe !== null && ancestors.has(node.persona)) {
      violations.push(
        `Circular plan: ${node.persona} is already an ancestor`,
      )
    }

    const nextAncestors = new Set(ancestors)
    nextAncestors.add(node.persona)

    if (node.recipe === null) {
      validateLeaf(node)
    } else {
      validateFused(node, node.recipe, nextAncestors)
    }
  }

  /**
   * Whether `skill` in `node` originates from a leaf with persona
   * `expectedSource` and the correct learn level, following the chosen
   * inheritance edges.
   */
  function trace(
    node: Node,
    skill: string,
    expectedSource: string,
    kind: 'persona' | 'held',
  ): boolean {
    const learn = node.learns.find((entry) => entry.skill === skill)
    if (learn) {
      if (node.persona !== expectedSource) return false
      const persona = personaByName.get(node.persona)
      if (!persona) return false
      if (kind === 'persona') {
        return (
          Object.hasOwn(persona.skills, skill) &&
          learn.level === persona.skills[skill]
        )
      }
      return learn.level === null && !Object.hasOwn(persona.skills, skill)
    }

    const recipe = node.recipe
    if (!recipe) return false

    const entry = recipe.inherit.find((candidate) => candidate.skill === skill)
    if (!entry) return false
    if (
      !Number.isInteger(entry.from) ||
      entry.from < 0 ||
      entry.from >= recipe.ingredients.length
    ) {
      return false
    }
    return trace(
      recipe.ingredients[entry.from],
      skill,
      expectedSource,
      kind,
    )
  }

  /**
   * Whether the trait `name` carried by `node` originates from a persona
   * `expectedSource` that owns it. A node that is itself the source wins; a
   * node carrying the trait follows its chosen `traitFrom` ingredient.
   */
  function traceTrait(
    node: Node,
    name: string,
    expectedSource: string,
  ): boolean {
    const persona = personaByName.get(node.persona)
    if (node.persona === expectedSource) {
      return persona?.trait === name
    }
    if (node.carriesTrait !== name) return false

    const recipe = node.recipe
    if (!recipe || recipe.traitFrom === null) return false
    if (
      !Number.isInteger(recipe.traitFrom) ||
      recipe.traitFrom < 0 ||
      recipe.traitFrom >= recipe.ingredients.length
    ) {
      return false
    }
    return traceTrait(
      recipe.ingredients[recipe.traitFrom],
      name,
      expectedSource,
    )
  }

  /** Rejects any trait routing anywhere in a build that keeps its own trait. */
  function rejectTraitRouting(node: Node): void {
    if (node.carriesTrait !== null) {
      violations.push(
        `Node ${node.persona} carries trait ${node.carriesTrait}, but the build asked to keep its own`,
      )
    }
    const recipe = node.recipe
    if (!recipe) return
    if (recipe.traitFrom !== null) {
      violations.push(
        `Fusion ${node.persona} routes a trait, but the build asked to keep its own`,
      )
    }
    for (const ingredient of recipe.ingredients) {
      rejectTraitRouting(ingredient)
    }
  }

  walk(plan.root, new Set(), true)

  if (plan.root.persona !== build.target) {
    violations.push(
      `Root persona is ${plan.root.persona}, expected ${build.target}`,
    )
  }

  if (build.trait === null) {
    if (plan.root.carriesTrait !== null) {
      violations.push(
        `Root ${plan.root.persona} carries trait ${plan.root.carriesTrait}, but the build asked to keep its own`,
      )
    }
    rejectTraitRouting(plan.root)
  } else {
    const targetPersona = personaByName.get(build.target)
    const keepsOwn =
      build.trait.from === build.target &&
      targetPersona?.trait === build.trait.name &&
      plan.root.carriesTrait === null
    if (!keepsOwn) {
      if (plan.root.carriesTrait !== build.trait.name) {
        violations.push(
          `Root ${plan.root.persona} carries trait ${plan.root.carriesTrait ?? 'nothing'}, expected ${build.trait.name}`,
        )
      } else if (
        !traceTrait(plan.root, build.trait.name, build.trait.from)
      ) {
        violations.push(
          `Trait ${build.trait.name} does not trace back to ${build.trait.from}`,
        )
      }
    }
  }

  for (const row of build.skills) {
    if (row.source.kind !== 'persona' && row.source.kind !== 'held') continue
    if (!plan.root.carries.includes(row.name)) {
      violations.push(
        `Root ${plan.root.persona} does not carry inherited skill ${row.name}`,
      )
    }
    if (
      !trace(
        plan.root,
        row.name,
        row.source.persona,
        row.source.kind,
      )
    ) {
      violations.push(
        `Skill ${row.name} does not trace back to ${row.source.persona}`,
      )
    }
  }

  if (plan.fusions !== fusions) {
    violations.push(
      `Plan reports ${plan.fusions} fusions, but the tree has ${fusions}`,
    )
  }
  if (plan.cost !== cost) {
    violations.push(`Plan reports cost ${plan.cost}, but the tree costs ${cost}`)
  }

  return violations
}
