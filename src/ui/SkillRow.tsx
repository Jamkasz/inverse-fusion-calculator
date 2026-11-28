import { useId } from 'react'
import type { GameData, Persona } from '../data/types'
import { formatCost } from '../data/load'
import { sourceOptions, sourceUnavailableReason } from '../engine/build'
import type { BuildError, SkillSource } from '../engine/build'
import CardSourceList from './CardSourceList'

const HELD_OPTION_LABEL =
  'A persona I own already has it (e.g. Network Fusion)…'

export type MovesetRow = {
  id: number
  skill: string
  source: SkillSource
}

type SkillRowProps = {
  position: number
  row: MovesetRow
  persona: Persona
  data: GameData
  datalistId: string
  errors: BuildError[]
  reachFor: (skill: string, source: string) => Map<string, number>
  onSkillChange: (id: number, skill: string) => void
  onSourceChange: (id: number, source: SkillSource) => void
  onRemove: (id: number) => void
}

function encodeSource(source: SkillSource): string {
  switch (source.kind) {
    case 'innate':
      return 'innate'
    case 'card':
      return 'card'
    case 'persona':
      return `persona:${source.persona}`
    case 'held':
      return 'held'
  }
}

function decodeSource(value: string): SkillSource {
  if (value.startsWith('persona:')) {
    return { kind: 'persona', persona: value.slice('persona:'.length) }
  }
  if (value === 'held') return { kind: 'held', persona: '' }
  if (value === 'card') return { kind: 'card' }
  return { kind: 'innate' }
}

export default function SkillRow({
  position,
  row,
  persona,
  data,
  datalistId,
  errors,
  reachFor,
  onSkillChange,
  onSourceChange,
  onRemove,
}: SkillRowProps) {
  const heldDatalistId = useId()
  const skill =
    row.skill === ''
      ? undefined
      : data.skills.find((entry) => entry.name === row.skill)
  const learnLevel =
    skill !== undefined && Object.hasOwn(persona.skills, row.skill)
      ? persona.skills[row.skill]
      : null
  const options =
    row.skill === '' ? [] : sourceOptions(data, persona.name, row.skill)
  const reason =
    row.skill !== '' && options.length === 0
      ? sourceUnavailableReason(data, persona.name, row.skill)
      : null

  function reachDistance(sourcePersona: string): number | undefined {
    return reachFor(row.skill, sourcePersona).get(persona.name)
  }

  function distanceSuffix(distance: number | undefined): string {
    if (distance === undefined) return ' · no route'
    return distance === 1 ? ' · 1 fusion' : ` · ${distance} fusions`
  }

  // Keep innate/card in their authored order, sort only the persona options by
  // reach, and leave the held sentinel last. The original index is the stable
  // tie-break; engine sourceOptions order is never mutated.
  const nonPersonaOptions = options.filter(
    (source) => source.kind !== 'persona',
  )
  const orderedPersonaOptions = options
    .map((source, index) => ({ source, index }))
    .filter(
      (
        entry,
      ): entry is { source: Extract<SkillSource, { kind: 'persona' }>; index: number } =>
        entry.source.kind === 'persona',
    )
    .sort((a, b) => {
      const distanceA = reachDistance(a.source.persona)
      const distanceB = reachDistance(b.source.persona)
      const reachA = distanceA === undefined ? Infinity : distanceA
      const reachB = distanceB === undefined ? Infinity : distanceB
      if (reachA !== reachB) return reachA - reachB
      return a.index - b.index
    })
    .map((entry) => entry.source)
  const orderedOptions = [...nonPersonaOptions, ...orderedPersonaOptions]

  function sourceLabel(source: SkillSource): string {
    if (source.kind === 'innate') return 'Innate'
    if (source.kind === 'card') return 'Skill card'
    if (source.kind === 'held') return `${source.persona} (already has it)`

    const sourcePersona = data.personas.find(
      (entry) => entry.name === source.persona,
    )
    const level = sourcePersona?.skills[row.skill]
    const suffix =
      typeof level === 'number'
        ? level === 0
          ? ' (base)'
          : ` (Lv ${level})`
        : ''
    return `${source.persona}${suffix}`
  }

  function optionLabel(source: SkillSource): string {
    const label = sourceLabel(source)
    if (source.kind !== 'persona') return label
    return `${label}${distanceSuffix(reachDistance(source.persona))}`
  }

  const heldSourceName =
    row.source.kind === 'held' ? row.source.persona : ''
  const heldPersona =
    heldSourceName !== '' &&
    heldSourceName !== persona.name &&
    data.personas.some((entry) => entry.name === heldSourceName)
      ? heldSourceName
      : null

  const heldReach =
    skill !== undefined && heldPersona !== null
      ? distanceSuffix(reachFor(row.skill, heldPersona).get(persona.name))
      : null

  return (
    <li className="skill-row" data-testid="skill-row">
      <div className="skill-heading">
        <input
          className="skill-input"
          aria-label={`Skill ${position}`}
          list={datalistId}
          value={row.skill}
          onChange={(event) => onSkillChange(row.id, event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {learnLevel !== null ? (
          <span className="skill-level" data-testid="skill-level">
            {learnLevel === 0 ? 'base' : `Lv ${learnLevel}`}
          </span>
        ) : null}
        {skill ? (
          <>
            <span className="skill-element" data-testid="skill-element">
              {skill.element}
            </span>
            <span className="skill-cost" data-testid="skill-cost">
              {formatCost(skill)}
            </span>
          </>
        ) : null}
      </div>

      {skill ? <p className="skill-effect">{skill.effect}</p> : null}

      <div className="skill-source-row">
        {reason !== null ? (
          <p className="source-reason" data-testid="source-reason">
            {reason}
          </p>
        ) : null}

        {row.skill !== '' ? (
          <select
            className="skill-source"
            aria-label={`Source for ${row.skill}`}
            data-testid="skill-source"
            value={encodeSource(row.source)}
            onChange={(event) =>
              onSourceChange(row.id, decodeSource(event.target.value))
            }
          >
            {orderedOptions.map((source) => (
              <option key={encodeSource(source)} value={encodeSource(source)}>
                {optionLabel(source)}
              </option>
            ))}
            <option value="held">{HELD_OPTION_LABEL}</option>
          </select>
        ) : null}

        <button
          type="button"
          className="skill-remove"
          aria-label={`Remove ${row.skill}`}
          onClick={() => onRemove(row.id)}
        >
          Remove
        </button>
      </div>

      {skill && row.source.kind === 'held' ? (
        <div className="held-persona-row">
          <input
            className="held-persona-input"
            aria-label={`Owned persona for ${row.skill}`}
            list={heldDatalistId}
            value={row.source.persona}
            placeholder="Persona name"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) =>
              onSourceChange(row.id, {
                kind: 'held',
                persona: event.target.value,
              })
            }
          />
          <datalist id={heldDatalistId}>
            {data.personas.map((entry) => (
              <option key={entry.name} value={entry.name} />
            ))}
          </datalist>
          {heldReach !== null ? (
            <span className="held-reach" data-testid="held-reach">
              {heldReach}
            </span>
          ) : null}
        </div>
      ) : null}

      {errors.map((error, index) => (
        <p
          key={`${error.code}-${index}`}
          className="build-error"
          data-testid="build-error"
          role="alert"
        >
          {error.message}
        </p>
      ))}

      {skill && row.source.kind === 'card' ? (
        <CardSourceList skill={skill} />
      ) : null}

      {skill &&
      (skill.acquisitionNote === 'Network Fusion' ||
        skill.acquisitionNote === 'Fusion Mutation') ? (
        <p className="acquisition-note" data-testid="acquisition-note">
          Reference notes: {skill.acquisitionNote}
        </p>
      ) : null}
    </li>
  )
}
