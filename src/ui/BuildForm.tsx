import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { GameData, Persona } from '../data/types'
import {
  inheritedCapacity,
  sourceOptions,
  validateBuild,
} from '../engine/build'
import type { Build, BuildError, SkillSource } from '../engine/build'
import { skillReach } from '../engine/reach'
import type { Recipe } from '../engine/recipes'
import { MAX_SKILLS } from '../engine/rules'
import SkillRow from './SkillRow'
import type { MovesetRow } from './SkillRow'
import TraitPicker from './TraitPicker'

/** Row-less errors that belong next to the trait picker instead of the form. */
const TRAIT_ERROR_CODES: ReadonlySet<string> = new Set([
  'TRAIT_NOT_INHERITABLE',
  'TRAIT_SOURCE_MISMATCH',
  'UNKNOWN_SOURCE_PERSONA',
])

type BuildFormProps = {
  persona: Persona
  data: GameData
  recipes: Map<string, Recipe[]>
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
  if (skill === '') return { kind: 'innate' }

  const isKnownSkill = data.skills.some((entry) => entry.name === skill)
  if (isKnownSkill && Object.hasOwn(target.skills, skill)) {
    return { kind: 'innate' }
  }

  return sourceOptions(data, target.name, skill)[0] ?? { kind: 'held', persona: '' }
}

export default function BuildForm({
  persona,
  data,
  recipes,
  onChange,
}: BuildFormProps) {
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
  const [trait, setTrait] = useState<Build['trait']>(null)

  const allNative = useMemo(
    () => nativeSkills(persona, data),
    [persona, data],
  )

  // Reach is expensive, so compute it at most once per (skill, source) and
  // share the result across every row. Both keys reset when the data changes.
  const reachCache = useMemo(
    () => new Map<string, Map<string, number>>(),
    [data, recipes],
  )
  const reachFor = useCallback(
    (skill: string, source: string): Map<string, number> => {
      const key = `${skill}\u0000${source}`
      const cached = reachCache.get(key)
      if (cached) return cached
      const computed = skillReach(data, recipes, skill, source)
      reachCache.set(key, computed)
      return computed
    },
    [data, recipes, reachCache],
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
      trait,
    })
  }, [persona.name, rows, trait, onChange])

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

  const filledRows = rows.filter((row) => row.skill !== '')
  const build: Build = {
    target: persona.name,
    skills: filledRows.map((row) => ({ name: row.skill, source: row.source })),
    trait,
  }
  const errors = validateBuild(data, recipes, build)

  const rowErrors = new Map<number, BuildError[]>()
  for (const error of errors) {
    if (error.row === undefined) continue
    const uiRow = filledRows[error.row]
    if (!uiRow) continue
    const list = rowErrors.get(uiRow.id) ?? []
    list.push(error)
    rowErrors.set(uiRow.id, list)
  }
  const traitErrors = errors.filter(
    (error) => error.row === undefined && TRAIT_ERROR_CODES.has(error.code),
  )
  const formErrors = errors.filter(
    (error) => error.row === undefined && !TRAIT_ERROR_CODES.has(error.code),
  )

  const inheritedCount = build.skills.filter(
    (row) => row.source.kind === 'persona' || row.source.kind === 'held',
  ).length
  const capacity = inheritedCapacity(data, recipes, persona.name)
  const overLimit = inheritedCount > capacity

  return (
    <section className="build-form">
      <h3 className="build-form-heading">Moveset</h3>

      <TraitPicker
        persona={persona}
        data={data}
        recipes={recipes}
        value={trait}
        onChange={setTrait}
        errors={traitErrors}
      />

      <datalist id={datalistId}>
        {datalistOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {formErrors.length > 0 ? (
        <div className="build-errors" data-testid="build-form-errors">
          {formErrors.map((error, index) => (
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

      <ul className="skill-list">
        {rows.map((row, index) => (
          <SkillRow
            key={row.id}
            position={index + 1}
            row={row}
            persona={persona}
            data={data}
            datalistId={datalistId}
            errors={rowErrors.get(row.id) ?? []}
            reachFor={reachFor}
            onSkillChange={handleSkillChange}
            onSourceChange={handleSourceChange}
            onRemove={handleRemove}
          />
        ))}
      </ul>

      <p
        className={`inheritance-counter${overLimit ? ' over-limit' : ''}`}
        data-testid="inherited-counter"
        aria-live="polite"
      >
        Inherited: {inheritedCount} of {capacity}
      </p>

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
