import { Fragment } from 'react'
import type { GameData } from '../data/types'
import type { Step } from '../engine/plan'
import CardSourceList from './CardSourceList'

const PERSONA_URL =
  'https://chinhodado.github.io/persona5_calculator/indexRoyal.html#/persona/'

function PersonaLink({ name }: { name: string }) {
  return (
    <a className="plan-persona-link" href={`${PERSONA_URL}${encodeURIComponent(name)}`}>
      {name}
    </a>
  )
}

function SkillName({ name, data }: { name: string; data: GameData }) {
  const skill = data.skills.find((entry) => entry.name === name)
  return (
    <span className="plan-skill" title={skill?.effect}>
      {name}
    </span>
  )
}

function TraitName({ name, data }: { name: string; data: GameData }) {
  const trait = data.traits.find((entry) => entry.name === name)
  return (
    <span className="plan-trait" title={trait?.effect}>
      {name}
    </span>
  )
}

function SkillList({ names, data }: { names: string[]; data: GameData }) {
  return (
    <>
      {names.map((name, index) => (
        <Fragment key={`${index}-${name}`}>
          {index > 0 ? ', ' : null}
          <SkillName name={name} data={data} />
        </Fragment>
      ))}
    </>
  )
}

function StepBody({ step, data }: { step: Step; data: GameData }) {
  switch (step.kind) {
    case 'obtain': {
      const persona = <PersonaLink name={step.persona} />
      if (step.holds.length > 0) {
        return (
          <p className="plan-step-main">
            Your {persona} that already has{' '}
            <SkillList names={step.holds} data={data} />.
            {step.learns.length > 0 ? (
              step.levelTo !== null ? (
                <>
                  {' '}Level it to Lv {step.levelTo} to learn{' '}
                  <SkillList names={step.learns} data={data} />.
                </>
              ) : (
                <>
                  {' '}It also knows{' '}
                  <SkillList names={step.learns} data={data} />.
                </>
              )
            ) : null}
          </p>
        )
      }
      if (step.learns.length > 0) {
        return (
          <p className="plan-step-main">
            Obtain {persona}
            {step.levelTo !== null ? <> at Lv {step.levelTo}</> : null}
            {' — knows '}
            <SkillList names={step.learns} data={data} />.
          </p>
        )
      }
      return <p className="plan-step-main">Obtain {persona}.</p>
    }

    case 'fuse':
      return (
        <>
          <p className="plan-step-main">
            Fuse{' '}
            {step.ingredients.map((name, index) => (
              <Fragment key={`${index}-${name}`}>
                {index > 0 ? ' + ' : null}
                <PersonaLink name={name} />
              </Fragment>
            ))}
            {' → '}
            <PersonaLink name={step.result} />.
            {step.inherit.length > 0 ? (
              <>
                {' Inherit '}
                <SkillList names={step.inherit} data={data} />.
              </>
            ) : null}
            {step.trait !== null ? (
              <>
                {' Trait: take '}
                <PersonaLink name={step.trait.from} />
                {"'s "}
                <TraitName name={step.trait.name} data={data} />.
              </>
            ) : null}
          </p>
          {step.skillsHeld < step.skillsNeeded ? (
            <p className="plan-step-note plan-step-shortfall">
              {`The ingredients must hold ${step.skillsNeeded} skills in total to inherit ${step.inherit.length}; add ${step.skillsNeeded - step.skillsHeld} more with skill cards or leveling first.`}
            </p>
          ) : null}
          {step.disputedInheritType ? (
            <p className="plan-step-note plan-step-disputed">
              {`Sources disagree on what ${step.result} can inherit; check the fusion screen before committing.`}
            </p>
          ) : null}
        </>
      )

    case 'card': {
      const skill = data.skills.find((entry) => entry.name === step.skill)
      return (
        <>
          <p className="plan-step-main">
            Use skill card: <SkillName name={step.skill} data={data} />.
          </p>
          {skill ? <CardSourceList skill={skill} /> : null}
        </>
      )
    }

    case 'level':
      return (
        <p className="plan-step-main">
          Level <PersonaLink name={step.persona} /> to Lv {step.levelTo} to
          learn <SkillList names={step.learns} data={data} />.
        </p>
      )
  }
}

export default function PlanSteps({
  steps,
  data,
}: {
  steps: Step[]
  data: GameData
}) {
  if (steps.length === 0) return null

  return (
    <section className="plan-steps-section">
      <h3 className="plan-steps-heading">Step-by-step instructions</h3>
      <ol className="plan-steps" data-testid="plan-steps">
        {steps.map((step, index) => (
          <li
            key={`${index}-${step.kind}`}
            className={`plan-step plan-step-${step.kind}`}
            data-testid="plan-step"
            data-kind={step.kind}
          >
            <StepBody step={step} data={data} />
          </li>
        ))}
      </ol>
    </section>
  )
}
