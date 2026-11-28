import type { Persona } from '../data/types'

type PersonaSummaryProps = {
  persona: Persona
}

export default function PersonaSummary({ persona }: PersonaSummaryProps) {
  return (
    <section className="persona-summary">
      <h2 className="persona-name">{persona.name}</h2>
      <p className="persona-meta">
        <span className="persona-arcana">{persona.arcana}</span>
        <span className="persona-level">Base level {persona.level}</span>
      </p>
    </section>
  )
}
