import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { GameData, Persona } from '../data/types'
import { sourceOptions } from '../engine/build'
import type { Build, SkillSource } from '../engine/build'
import { MAX_SKILLS } from '../engine/rules'
import SkillRow from './SkillRow'
import type { MovesetRow } from './SkillRow'

type BuildFormProps = {
  persona: Persona
  data: GameData
  onChange: (build: Build) => void
}

/** The persona's own real skills (not treasure-demon extra trait names). */
function nativeSkills(persona: Persona, data: GameData): string[] {
  const skillNames = new Set(data.skills.map((skill) => skill.name))
  return Object.entries(persona.skills)
    .filter(([name]) => skillNames.has(name))
    .map(([name, level], index) => ({ name, level, index }))
    .sort((a, b) => a.level - b.level || a.index - b.index)
    .map(({ name }) => name)
}

function defaultSource(
  data: GameData,
  target: Persona,
  skill: string,
): SkillSource {
  if (skill === '' || skill in target.skills) return { kind: 'innate' }
  return sourceOptions(data, target.name, skill)[0] ?? { kind: 'innate' }
}

export default function BuildForm({ persona, data, onChange }: BuildFormProps) {
  const datalistId = useId()
  const idCounter = useRef(0)
  const makeId = () => {
    const id = idCounter.current
    idCounter.current += 1
    return id
  }

  const [rows, setRows] = useState<MovesetRow[]>(() =>
    nativeSkills(persona, data)
      .slice(0, MAX_SKILLS)
      .map((name) => ({
        id: makeId(),
        skill: name,
        source: { kind: 'innate' as const },
      })),
  )

  const allNative = useMemo(
    () => nativeSkills(persona, data),
    [persona, data],
  )
  const extras = allNative.slice(MAX_SKILLS)
  const availableExtras = extras.filter(
    (name) => !rows.some((row) => row.skill === name),
  )
  const hasFreeRow = rows.length < MAX_SKILLS || rows.some((row) => row.skill === '')

  const datalistOptions = useMemo(() => {
    const skillNames = new Set(data.skills.map((skill) => skill.name))
    const seen = new Set<string>()
    const names: string[] = []

    for (const skill of data.skills) {
      if (skill.unique || seen.has(skill.name)) continue
      seen.add(skill.name)
      names.push(skill.name)
    }
    for (const name of Object.keys(persona.skills)) {
      if (!skillNames.has(name) || seen.has(name)) continue
      seen.add(name)
      names.push(name)
    }
    return names
  }, [data, persona])

  useEffect(() => {
    onChange({
      target: persona.name,
      skills: rows
        .filter((row) => row.skill !== '')
        .map((row) => ({ name: row.skill, source: row.source })),
      trait: null,
    })
  }, [persona.name, rows, onChange])

  function handleSkillChange(id: number, skill: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? { ...row, skill, source: defaultSource(data, persona, skill) }
          : row,
      ),
    )
  }

  function handleSourceChange(id: number, source: SkillSource) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, source } : row)),
    )
  }

  function handleRemove(id: number) {
    setRows((current) => current.filter((row) => row.id !== id))
  }

  function handleAddRow() {
    setRows((current) => {
      if (current.length >= MAX_SKILLS) return current
      return [...current, { id: makeId(), skill: '', source: { kind: 'innate' } }]
    })
  }

  function handleAddExtra(skill: string) {
    setRows((current) => {
      const emptyIndex = current.findIndex((row) => row.skill === '')
      if (emptyIndex !== -1) {
        return current.map((row, index) =>
          index === emptyIndex
            ? { ...row, skill, source: defaultSource(data, persona, skill) }
            : row,
        )
      }
      if (current.length >= MAX_SKILLS) return current
      return [
        ...current,
        { id: makeId(), skill, source: defaultSource(data, persona, skill) },
      ]
    })
  }

  return (
    <section className="build-form">
      <h3 className="build-form-heading">Moveset</h3>

      <datalist id={datalistId}>
        {datalistOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <ul className="skill-list">
        {rows.map((row, index) => (
          <SkillRow
            key={row.id}
            position={index + 1}
            row={row}
            persona={persona}
            data={data}
            datalistId={datalistId}
            onSkillChange={handleSkillChange}
            onSourceChange={handleSourceChange}
            onRemove={handleRemove}
          />
        ))}
      </ul>

      <button
        type="button"
        className="add-skill"
        onClick={handleAddRow}
        disabled={rows.length >= MAX_SKILLS}
      >
        Add skill
      </button>

      {availableExtras.length > 0 ? (
        <div className="also-learns">
          <p className="also-learns-label">Also learns</p>
          <div className="also-learns-chips">
            {availableExtras.map((name) => (
              <button
                key={name}
                type="button"
                className="also-learns-chip"
                onClick={() => handleAddExtra(name)}
                disabled={!hasFreeRow}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
