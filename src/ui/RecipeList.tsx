import { useId, useState } from 'react'
import type { Persona } from '../data/types'
import type { Recipe } from '../engine/recipes'

type RecipeListProps = {
  persona: Persona
  recipes: Recipe[]
}

const INITIAL_VISIBLE = 20

export default function RecipeList({ persona, recipes }: RecipeListProps) {
  const [showAll, setShowAll] = useState(false)
  const listId = useId()

  const count = recipes.length
  const noun = count === 1 ? 'recipe' : 'recipes'
  const visible = showAll ? recipes : recipes.slice(0, INITIAL_VISIBLE)
  const canToggle = !persona.rare && count > INITIAL_VISIBLE

  return (
    <section className="recipe-list">
      <h2>
        Ways to fuse {persona.name}: {count} {noun}
      </h2>

      {persona.rare ? (
        <p className="recipe-list-empty">Cannot be fused</p>
      ) : count === 0 ? (
        <p className="recipe-list-empty">No recipes</p>
      ) : (
        <>
          <ol className="recipe-rows" id={listId}>
            {visible.map((recipe) => (
              <li
                className="recipe-row"
                data-testid="recipe-row"
                key={`${recipe.result}\u0000${recipe.ingredients.join('\u0000')}`}
              >
                <span
                  className="recipe-ingredients"
                  data-testid="recipe-ingredients"
                >
                  {recipe.ingredients.join(' + ')}
                </span>
                <span
                  className="recipe-cost"
                  data-testid="recipe-cost"
                  data-cost={recipe.cost}
                >
                  Approx. cost {recipe.cost}
                </span>
              </li>
            ))}
          </ol>

          {canToggle ? (
            <button
              type="button"
              className="recipe-toggle"
              aria-expanded={showAll}
              aria-controls={listId}
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll
                ? `Show first ${INITIAL_VISIBLE}`
                : `Show all ${count} recipes`}
            </button>
          ) : null}
        </>
      )}

      <p className="recipe-list-note">
        Fusions with exactly one treasure demon are not listed while they are
        disabled in settings.
      </p>
    </section>
  )
}
