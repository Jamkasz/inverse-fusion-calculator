import { useId, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Persona } from '../data/types'

type TargetPickerProps = {
  personas: Persona[]
  onSelect: (persona: Persona | null) => void
}

export default function TargetPicker({ personas, onSelect }: TargetPickerProps) {
  const [value, setValue] = useState('')
  const inputId = useId()
  const listId = useId()

  const query = value.trim()
  const exactMatch = personas.find((persona) => persona.name === query) ?? null
  const isPrefix =
    query !== '' && personas.some((persona) => persona.name.startsWith(query))
  const showUnknown = query !== '' && exactMatch === null && !isPrefix

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value
    setValue(nextValue)
    const nextQuery = nextValue.trim()
    onSelect(personas.find((persona) => persona.name === nextQuery) ?? null)
  }

  return (
    <div className="target-picker">
      <label htmlFor={inputId}>Persona</label>
      <input
        id={inputId}
        list={listId}
        value={value}
        onChange={handleChange}
        placeholder="e.g. Agathion"
        autoComplete="off"
        spellCheck={false}
      />
      <datalist id={listId}>
        {personas.map((persona) => (
          <option key={persona.name} value={persona.name} />
        ))}
      </datalist>
      {showUnknown ? (
        <p className="field-error" role="alert">
          No such persona
        </p>
      ) : null}
    </div>
  )
}
