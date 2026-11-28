import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../src/ui/App'
import PlanSteps from '../../src/ui/PlanSteps'
import { loadGameData } from '../../src/data/load'
import type { Step } from '../../src/engine/plan'

const data = loadGameData({ ownedDlc: [] })

const patra = data.skills.find((skill) => skill.name === 'Patra')!
const zio = data.skills.find((skill) => skill.name === 'Zio')!
const staticElectricity = data.traits.find(
  (trait) => trait.name === 'Static Electricity',
)!

const steps: Step[] = [
  {
    kind: 'obtain',
    persona: 'Pixie',
    levelTo: 3,
    learns: ['Patra'],
    holds: [],
  },
  {
    kind: 'obtain',
    persona: 'Agathion',
    levelTo: null,
    learns: [],
    holds: [],
  },
  {
    kind: 'fuse',
    ingredients: ['Agathion', 'Pixie'],
    result: 'Mandrake',
    inherit: ['Patra', 'Zio'],
    trait: { name: 'Static Electricity', from: 'Pixie' },
    skillsNeeded: 9,
    skillsHeld: 2,
    disputedInheritType: true,
  },
  {
    kind: 'card',
    skill: 'Zio',
    cardSources: zio.cardSources,
  },
  {
    kind: 'level',
    persona: 'Agathion',
    levelTo: 8,
    learns: ['Zio', 'Dodge Elec'],
  },
]

describe('PlanSteps', () => {
  it('renders obtain, fuse, card and level steps', () => {
    render(<PlanSteps steps={steps} data={data} />)

    expect(screen.getByTestId('plan-steps').tagName).toBe('OL')
    const items = screen.getAllByTestId('plan-step')
    expect(items).toHaveLength(steps.length)
    expect(items.map((item) => item.getAttribute('data-kind'))).toEqual([
      'obtain',
      'obtain',
      'fuse',
      'card',
      'level',
    ])

    expect(items[0]).toHaveTextContent('Obtain Pixie at Lv 3 — knows Patra.')
    const pixieLink = within(items[0]).getByRole('link', { name: 'Pixie' })
    expect(pixieLink).toHaveAttribute(
      'href',
      'https://chinhodado.github.io/persona5_calculator/indexRoyal.html#/persona/Pixie',
    )
    expect(within(items[0]).getByText('Patra')).toHaveAttribute(
      'title',
      patra.effect,
    )

    expect(items[1]).toHaveTextContent('Obtain Agathion.')
    expect(items[2]).toHaveTextContent(
      'Fuse Agathion + Pixie → Mandrake. Inherit Patra, Zio.',
    )
    expect(items[2]).toHaveTextContent(
      "Trait: take Pixie's Static Electricity.",
    )
    expect(within(items[2]).getByText('Static Electricity')).toHaveAttribute(
      'title',
      staticElectricity.effect,
    )

    expect(
      screen.getByText(
        'The ingredients must hold 9 skills in total to inherit 2; add 7 more with skill cards or leveling first.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Sources disagree on what Mandrake can inherit; check the fusion screen before committing.',
      ),
    ).toBeInTheDocument()

    expect(items[3]).toHaveTextContent('Use skill card: Zio.')
    expect(
      within(items[3]).getByText('Electric chair: Agathion'),
    ).toBeInTheDocument()

    expect(items[4]).toHaveTextContent(
      'Level Agathion to Lv 8 to learn Zio, Dodge Elec.',
    )
  })

  it('renders a held skill and a leveled learned skill on one obtain step', () => {
    render(
      <PlanSteps
        steps={[
          {
            kind: 'obtain',
            persona: 'Pixie',
            levelTo: 3,
            learns: ['Patra'],
            holds: ['Agi'],
          },
        ]}
        data={data}
      />,
    )

    const item = screen.getByTestId('plan-step')
    expect(item).toHaveTextContent('Your Pixie that already has Agi.')
    expect(item).toHaveTextContent('Level it to Lv 3 to learn Patra.')
  })

  it('encodes persona names in reference links', () => {
    render(
      <PlanSteps
        steps={[
          {
            kind: 'obtain',
            persona: 'Arsène',
            levelTo: null,
            learns: [],
            holds: [],
          },
        ]}
        data={data}
      />,
    )

    const link = screen.getByRole('link', { name: 'Arsène' })
    expect(link.getAttribute('href')).toContain('Ars%C3%A8ne')
  })

  it('places the steps above the fusion tree in the app', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Persona'), {
      target: { value: 'Agathion' },
    })

    const row = screen.getAllByTestId('skill-row')[0]
    fireEvent.change(within(row).getByLabelText('Skill 1'), {
      target: { value: 'Patra' },
    })
    fireEvent.change(within(row).getByLabelText('Source for Patra'), {
      target: { value: 'persona:Pixie' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Solve' }))

    const planSteps = screen.getByTestId('plan-steps')
    const planTree = screen.getByTestId('plan-tree')
    expect(
      planSteps.compareDocumentPosition(planTree) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
