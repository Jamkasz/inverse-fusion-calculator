import { useId, useMemo } from 'react'
import type { ChangeEvent } from 'react'
import type { GameData, Persona } from '../data/types'
import type { Build, BuildError } from '../engine/build'
import type { Recipe } from '../engine/recipes'
import { traitReach } from '../engine/reach'
import { canPassTrait } from '../engine/rules'

type TraitPickerProps = {
  persona: Persona
  data: GameData
  recipes: Map<string, Recipe[]>
  value: Build['trait']
  onChange: (trait: Build['trait']) => void
  errors: BuildError[]
}

type TraitSource = {
  name: string
  index: number
  distance: number | undefined
}

/** Every persona that owns `name` and may pass it on, except the target. */
function passingOwners(
  data: GameData,
  target: string,
  name: string,
): Persona[] {
  return data.personas.filter(
    (persona) =>
      persona.name !== target &&
      persona.trait === name &&
      canPassTrait(persona),
  )
}

/**
 * Trait names a non-own choice can offer: those with at least one passing owner
 * other than the target. The target's own trait is excluded because Keep own
 * already covers it.
 */
function nonOwnTraitNames(data: GameData, target: Persona): string[] {
  const names = new Set<string>()
  for (const persona of data.personas) {
    if (persona.name === target.name) continue
    if (!canPassTrait(persona)) continue
    if (persona.trait === target.trait) continue
    names.add(persona.trait)
  }
  return [...names].sort()
}

/** Passing owners annotated with their trait distance to the target. */
function traitSources(
  data: GameData,
  recipes: Map<string, Recipe[]>,
  target: Persona,
  name: string,
): TraitSource[] {
  return passingOwners(data, target.name, name)
    .map((persona, index) => ({
      name: persona.name,
      index,
      distance: traitReach(data, recipes, persona.name).get(target.name),
    }))
    .sort((a, b) => {
      const reachA = a.distance === undefined ? Infinity : a.distance
      const reachB = b.distance === undefined ? Infinity : b.distance
      if (reachA !== reachB) return reachA - reachB
      return a.index - b.index
    })
}

function distanceSuffix(distance: number | undefined): string {
  if (distance === undefined) return ' · no route'
  return distance === 1 ? ' · 1 fusion' : ` · ${distance} fusions`
}

/**
 * The trait half of a build: keep the target's own trait (the default) or pick
 * one that a passing persona owns and route it to the target.
 */
export default function TraitPicker({
  persona,
  data,
  recipes,
  value,
  onChange,
  errors,
}: TraitPickerProps) {
  const traitSelectId = useId()
  const sourceSelectId = useId()

  const traitNames = useMemo(
    () => nonOwnTraitNames(data, persona),
    [data, persona],
  )
  const sources = useMemo(
    () =>
      value === null
        ? []
        : traitSources(data, recipes, persona, value.name),
    [data, recipes, persona, value],
  )

  const selectedTraitName = value === null ? persona.trait : value.name
  const effect =
    data.traits.find((trait) => trait.name === selectedTraitName)?.effect ?? ''

  function handleTraitChange(event: ChangeEvent<HTMLSelectElement>) {
    const name = event.target.value
    if (name === 'own') {
      onChange(null)
      return
    }
    const owners = traitSources(data, recipes, persona, name)
    onChange({ name, from: owners[0]?.name ?? '' })
  }

  function handleSourceChange(event: ChangeEvent<HTMLSelectElement>) {
    if (value === null) return
    onChange({ name: value.name, from: event.target.value })
  }

  return (
    <section className="trait-picker">
      <div className="trait-picker-row">
        <label htmlFor={traitSelectId}>Trait</label>
        <select
          id={traitSelectId}
          className="trait-select"
          value={value === null ? 'own' : value.name}
          onChange={handleTraitChange}
        >
          <option value="own">Keep own ({persona.trait})</option>
          {traitNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {value !== null ? (
        <div className="trait-picker-row">
          <label htmlFor={sourceSelectId}>Trait source</label>
          <select
            id={sourceSelectId}
            className="trait-source"
            value={value.from}
            onChange={handleSourceChange}
          >
            {sources.map((source) => (
              <option key={source.name} value={source.name}>
                {`${source.name}${distanceSuffix(source.distance)}`}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <p className="trait-effect" data-testid="trait-effect">
        {effect}
      </p>

      {errors.length > 0 ? (
        <div className="trait-errors" data-testid="trait-errors">
          {errors.map((error, index) => (
            <p
              key={`${error.code}-${index}`}
              className="build-error"
              role="alert"
            >
              {error.message}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  )
}
