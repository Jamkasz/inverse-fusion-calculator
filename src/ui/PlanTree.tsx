import type { Node, Plan } from '../engine/solver'

function learnLabel(learn: Node['learns'][number]): string {
  if (learn.level === null) return `learn ${learn.skill} (already has it)`
  if (learn.level === 0) return `learn ${learn.skill} (base)`
  return `learn ${learn.skill} at Lv ${learn.level}`
}

function PlanNodeItem({ node }: { node: Node }) {
  if (node.recipe === null) {
    return (
      <li className="plan-node plan-node-leaf">
        <span className="plan-persona" data-testid="plan-persona">
          {node.persona}
        </span>
        {node.learns.map((learn) => (
          <p
            key={learn.skill}
            className="plan-learn"
            data-testid="plan-learn"
          >
            {learnLabel(learn)}
          </p>
        ))}
      </li>
    )
  }

  const recipe = node.recipe
  const ingredientNames = recipe.ingredients.map(
    (ingredient) => ingredient.persona,
  )

  return (
    <li className="plan-node plan-node-fused">
      <p className="plan-fusion" data-testid="plan-fusion">
        {`Fuse ${ingredientNames.join(' + ')} → ${node.persona}`}
      </p>
      {recipe.inherit.map((entry) => (
        <p
          key={`${entry.from}-${entry.skill}`}
          className="plan-inherit"
          data-testid="plan-inherit"
        >
          {`Inherit: ${entry.skill} from ${recipe.ingredients[entry.from]?.persona ?? 'unknown ingredient'}`}
        </p>
      ))}
      <ul className="plan-children">
        {recipe.ingredients.map((ingredient, index) => (
          <PlanNodeItem
            key={`${index}-${ingredient.persona}`}
            node={ingredient}
          />
        ))}
      </ul>
    </li>
  )
}

export default function PlanTree({ plan }: { plan: Plan }) {
  return (
    <section className="plan-tree" data-testid="plan-tree">
      <h3 className="plan-tree-heading">Fusion plan</h3>
      <ul className="plan-nodes">
        <PlanNodeItem node={plan.root} />
      </ul>
    </section>
  )
}
