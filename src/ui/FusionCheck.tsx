import { useId, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { GameData, Persona } from '../data/types'
import { createFusion } from '../engine/fusion'

type FusionCheckProps = {
  data: GameData
}

function resolvePersona(personas: Persona[], value: string): Persona | null {
  const query = value.trim()
  if (query === '') return null
  return personas.find((persona) => persona.name === query) ?? null
}

function isPrefixOfPersona(personas: Persona[], value: string): boolean {
  const query = value.trim()
  return query !== '' && personas.some((persona) => persona.name.startsWith(query))
}

export default function FusionCheck({ data }: FusionCheckProps) {
  const [open, setOpen] = useState(false)
  const [firstValue, setFirstValue] = useState('')
  const [secondValue, setSecondValue] = useState('')

  const panelId = useId()
  const firstInputId = useId()
  const firstListId = useId()
  const secondInputId = useId()
  const secondListId = useId()

  // A fusion check is a plain forward check: rare (treasure-demon) fusion is
  // always allowed here, regardless of the app-wide `allowRare` setting.
  const fusion = useMemo(
    () => createFusion(data, { allowRare: true }),
    [data],
  )

  // Treasure demons are the personas the data marks as rare; `rarePersonae`
  // lists exactly the same names, so check both for robustness.
  const rareNames = useMemo(() => new Set(data.rarePersonae), [data])
  const isTreasureDemon = (persona: Persona): boolean =>
    persona.rare || rareNames.has(persona.name)

  const first = resolvePersona(data.personas, firstValue)
  const second = resolvePersona(data.personas, secondValue)
  const bothChosen = first !== null && second !== null
  const samePersona =
    first !== null && second !== null && first.name === second.name
  const result =
    bothChosen && !samePersona ? fusion.fuse(first.name, second.name) : null
  // Show the treasure-demon note only when exactly one ingredient is rare
  // (reference: `persona.rare && !recipe.isAllRare`). Rare + rare is a normal
  // fusion and must not show it.
  const showTreasureNote =
    first !== null &&
    second !== null &&
    !samePersona &&
    isTreasureDemon(first) !== isTreasureDemon(second)

  const showUnknownFirst =
    first === null &&
    firstValue.trim() !== '' &&
    !isPrefixOfPersona(data.personas, firstValue)
  const showUnknownSecond =
    second === null &&
    secondValue.trim() !== '' &&
    !isPrefixOfPersona(data.personas, secondValue)

  function handleFirstChange(event: ChangeEvent<HTMLInputElement>) {
    setFirstValue(event.target.value)
  }

  function handleSecondChange(event: ChangeEvent<HTMLInputElement>) {
    setSecondValue(event.target.value)
  }

  return (
    <section className="fusion-check">
      <h2 className="fusion-check-heading">
        <button
          type="button"
          className="fusion-check-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          Fusion check
        </button>
      </h2>

      <div
        id={panelId}
        className="fusion-check-panel"
        role="region"
        aria-label="Fusion check"
        hidden={!open}
      >
        <div className="fusion-pickers">
          <div className="fusion-picker">
            <label htmlFor={firstInputId}>First persona</label>
            <input
              id={firstInputId}
              list={firstListId}
              value={firstValue}
              onChange={handleFirstChange}
              placeholder="e.g. Barong"
              autoComplete="off"
              spellCheck={false}
            />
            <datalist id={firstListId}>
              {data.personas.map((persona) => (
                <option key={persona.name} value={persona.name} />
              ))}
            </datalist>
            {showUnknownFirst ? (
              <p className="field-error" role="alert">
                No such persona
              </p>
            ) : null}
          </div>

          <div className="fusion-picker">
            <label htmlFor={secondInputId}>Second persona</label>
            <input
              id={secondInputId}
              list={secondListId}
              value={secondValue}
              onChange={handleSecondChange}
              placeholder="e.g. Rangda"
              autoComplete="off"
              spellCheck={false}
            />
            <datalist id={secondListId}>
              {data.personas.map((persona) => (
                <option key={persona.name} value={persona.name} />
              ))}
            </datalist>
            {showUnknownSecond ? (
              <p className="field-error" role="alert">
                No such persona
              </p>
            ) : null}
          </div>
        </div>

        <div className="fusion-result" aria-live="polite">
          {samePersona ? (
            <p data-testid="fusion-result" className="fusion-result-none">
              Pick two different personas
            </p>
          ) : bothChosen ? (
            result !== null ? (
              <p>
                Result:{' '}
                <strong data-testid="fusion-result" className="fusion-result-name">
                  {result}
                </strong>
              </p>
            ) : (
              <p data-testid="fusion-result" className="fusion-result-none">
                These cannot be fused
              </p>
            )
          ) : null}
          {showTreasureNote ? (
            <p className="fusion-note">
              Assumes the other persona is at its base level.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
