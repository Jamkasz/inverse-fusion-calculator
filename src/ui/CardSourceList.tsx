import type { Skill } from '../data/types'

type CardSourceListProps = {
  skill: Skill
}

export default function CardSourceList({ skill }: CardSourceListProps) {
  const groups = [
    { label: 'Electric chair', values: skill.cardSources.chair },
    {
      label: 'Electric chair during fusion alarm',
      values: skill.cardSources.chairAlarm,
    },
    { label: 'Negotiation', values: skill.cardSources.negotiation },
  ].filter((group) => group.values.length > 0)

  if (groups.length === 0) return null

  return (
    <div className="card-sources" data-testid="card-source-list">
      {groups.map((group) => (
        <p
          key={group.label}
          className="card-source-group"
          data-testid="card-source-group"
        >
          {`${group.label}: ${group.values.join(', ')}`}
        </p>
      ))}
    </div>
  )
}
