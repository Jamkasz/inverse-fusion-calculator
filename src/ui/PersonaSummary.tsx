import type { GameData, Persona } from '../data/types'

type PersonaSummaryProps = {
  persona: Persona
  data: GameData
}

export default function PersonaSummary({ persona, data }: PersonaSummaryProps) {
  const trait = data.traits.find((entry) => entry.name === persona.trait)

  return (
    <section className="persona-summary">
      <h2 className="persona-name">{persona.name}</h2>
      <p className="persona-meta">
        <span className="persona-arcana">{persona.arcana}</span>
        <span className="persona-level">Base level {persona.level}</span>
      </p>

      <div className="persona-trait">
        <h3>Trait</h3>
        <p>
          <span className="trait-name" data-testid="trait-name">
            {persona.trait}
          </span>
          {': '}
          <span className="trait-effect" data-testid="trait-effect">
            {trait?.effect ?? ''}
          </span>
        </p>
      </div>
    </section>
  )
}
