import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { loadGameData } from '../../src/data/load'
import type { Skill } from '../../src/data/types'
import CardSourceList from '../../src/ui/CardSourceList'

const data = loadGameData({ ownedDlc: [] })

function skill(name: string): Skill {
  const found = data.skills.find((entry) => entry.name === name)
  if (!found) throw new Error(`Missing skill ${name}`)
  return found
}

describe('CardSourceList', () => {
  it('shows only the normal electric chair group for Zio', () => {
    render(<CardSourceList skill={skill('Zio')} />)

    expect(screen.getByTestId('card-source-list')).toBeInTheDocument()
    const groups = screen.getAllByTestId('card-source-group')
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveTextContent('Electric chair: Agathion')
  })

  it('shows only the alarm electric chair group for Mazio', () => {
    render(<CardSourceList skill={skill('Mazio')} />)

    const groups = screen.getAllByTestId('card-source-group')
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveTextContent(
      'Electric chair during fusion alarm: Agathion',
    )
  })

  it('shows only the negotiation group for Brain Buster', () => {
    render(<CardSourceList skill={skill('Brain Buster')} />)

    const groups = screen.getAllByTestId('card-source-group')
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveTextContent(
      'Negotiation: Monk of the Valley (Kurama Tengu)',
    )
  })

  it('shows alarm and negotiation but not normal chair for Abysmal Surge', () => {
    render(<CardSourceList skill={skill('Abysmal Surge')} />)

    const groups = screen.getAllByTestId('card-source-group')
    expect(groups).toHaveLength(2)
    expect(screen.getByText('Electric chair during fusion alarm: Loa')).toBeInTheDocument()
    expect(
      screen.getByText('Negotiation: Awakened God (Arahabaki)'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Electric chair: Loa')).not.toBeInTheDocument()
  })

  it('renders nothing when every card source is empty', () => {
    render(<CardSourceList skill={skill('Absorb Bless')} />)

    expect(screen.queryByTestId('card-source-list')).not.toBeInTheDocument()
  })

  it('joins multiple entries with commas', () => {
    const synthetic: Skill = {
      ...skill('Zio'),
      cardSources: {
        chair: ['Agathion', 'Pixie'],
        chairAlarm: [],
        negotiation: ['Shadow One (Persona One)', 'Shadow Two (Persona Two)'],
      },
    }

    render(<CardSourceList skill={synthetic} />)

    const groups = screen.getAllByTestId('card-source-group')
    expect(groups).toHaveLength(2)
    const list = screen.getByTestId('card-source-list')
    expect(within(list).getByText('Electric chair: Agathion, Pixie')).toBeInTheDocument()
    expect(
      within(list).getByText(
        'Negotiation: Shadow One (Persona One), Shadow Two (Persona Two)',
      ),
    ).toBeInTheDocument()
  })
})
