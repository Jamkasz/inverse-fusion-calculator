import type { GameData, Persona } from '../data/types'
import { formatCost } from '../data/load'
import { sourceOptions, sourceUnavailableReason } from '../engine/build'
import type { SkillSource } from '../engine/build'

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
      return `held:${source.persona}`
  }
}

function decodeSource(value: string): SkillSource {
  if (value.startsWith('persona:')) {
    return { kind: 'persona', persona: value.slice('persona:'.length) }
  }
  if (value.startsWith('held:')) {
    return { kind: 'held', persona: value.slice('held:'.length) }
  }
  if (value === 'card') return { kind: 'card' }
  return { kind: 'innate' }
}

export default function SkillRow({
  position,
  row,
  persona,
  data,
  datalistId,
  onSkillChange,
  onSourceChange,
  onRemove,
}: SkillRowProps) {
  const skill =
    row.skill === ''
      ? undefined
      : data.skills.find((entry) => entry.name === row.skill)
  const learnLevel = row.skill in persona.skills ? persona.skills[row.skill] : null
  const options =
    row.skill === '' ? [] : sourceOptions(data, persona.name, row.skill)
  const reason =
    row.skill !== '' && options.length === 0
      ? sourceUnavailableReason(data, persona.name, row.skill)
      : null

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
        ) : options.length > 0 ? (
          <select
            className="skill-source"
            aria-label={`Source for ${row.skill}`}
            data-testid="skill-source"
            value={encodeSource(row.source)}
            onChange={(event) =>
              onSourceChange(row.id, decodeSource(event.target.value))
            }
          >
            {options.map((source) => (
              <option key={encodeSource(source)} value={encodeSource(source)}>
                {sourceLabel(source)}
              </option>
            ))}
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
    </li>
  )
}
