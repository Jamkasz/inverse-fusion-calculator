import type { GameData, Persona, Skill } from '../data/types'
import { formatCost } from '../data/load'

type PersonaSummaryProps = {
  persona: Persona
  data: GameData
}

type SkillRow = {
  name: string
  level: number
  skill: Skill
}

export default function PersonaSummary({ persona, data }: PersonaSummaryProps) {
  const skillsByName = new Map(data.skills.map((skill) => [skill.name, skill]))
  const traitsByName = new Map(data.traits.map((trait) => [trait.name, trait]))
  const trait = traitsByName.get(persona.trait)

  // The reference data puts a treasure demon's three extra trait names in its
  // `skills` map. Resolve those from `data.traits` so every row keeps a
  // description (they are out of scope for v1, but must not crash the summary).
  const rows: SkillRow[] = Object.entries(persona.skills)
    .map(([name, level]) => {
      const skill = skillsByName.get(name) ?? traitsByName.get(name)
      return skill ? { name, level, skill } : null
    })
    .filter((row): row is SkillRow => row !== null)
    .sort((a, b) => a.level - b.level)

  return (
    <section className="persona-summary">
      <h2 className="persona-name">{persona.name}</h2>
      <p className="persona-meta">
        <span className="persona-arcana">{persona.arcana}</span>
        <span className="persona-level">Base level {persona.level}</span>
      </p>

      <ul className="skill-list">
        {rows.map(({ name, level, skill }) => (
          <li className="skill-row" data-testid="skill-row" key={name}>
            <div className="skill-heading">
              <span className="skill-name" data-testid="skill-name">
                {name}
              </span>
              <span className="skill-level" data-testid="skill-level">
                {level === 0 ? 'base' : `Lv ${level}`}
              </span>
              <span className="skill-element">{skill.element}</span>
              <span className="skill-cost">{formatCost(skill)}</span>
            </div>
            <p className="skill-effect">{skill.effect}</p>
          </li>
        ))}
      </ul>

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
