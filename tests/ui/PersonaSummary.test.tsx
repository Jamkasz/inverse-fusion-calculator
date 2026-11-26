import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../src/ui/App'
import rawGameData from '../../src/data/game-data.json'
import type { GameData, Skill } from '../../src/data/types'

const data = rawGameData as unknown as GameData
const allEntries: Skill[] = [...data.skills, ...data.traits]

function effectOf(name: string): string {
  const found = allEntries.find((entry) => entry.name === name)
  if (!found) throw new Error(`Missing skill or trait ${name}`)
  return found.effect
}

function typePersona(value: string) {
  fireEvent.change(screen.getByLabelText('Persona'), { target: { value } })
}

describe('PersonaSummary', () => {
  it('lists Agathion’s skills in learn order with costs, effects and trait', () => {
    render(<App />)
    typePersona('Agathion')

    const rows = screen.getAllByTestId('skill-row')
    expect(rows).toHaveLength(6)

    const expectedOrder = ['Dia', 'Baisudi', 'Lunge', 'Rakukaja', 'Zio', 'Dodge Elec']
    expectedOrder.forEach((name, index) => {
      const row = rows[index]
      expect(within(row).getByTestId('skill-name')).toHaveTextContent(name)
      expect(within(row).getByText(effectOf(name))).toBeInTheDocument()
    })

    expect(within(rows[0]).getByTestId('skill-level')).toHaveTextContent('base')
    expect(within(rows[4]).getByTestId('skill-level')).toHaveTextContent('Lv 7')

    expect(screen.getByTestId('trait-name')).toHaveTextContent('Rare Antibody')
    expect(screen.getByTestId('trait-effect')).toHaveTextContent(
      effectOf('Rare Antibody'),
    )
  })

  it('shows "No such persona" for a name that matches nothing', () => {
    render(<App />)
    typePersona('NotAPersona')

    expect(screen.getByText('No such persona')).toBeInTheDocument()
    expect(screen.queryAllByTestId('skill-row')).toHaveLength(0)
  })

  it('ignores surrounding whitespace when matching a persona', () => {
    render(<App />)
    typePersona('Agathion ')

    expect(screen.queryByText('No such persona')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Agathion' })).toBeInTheDocument()
    expect(screen.getAllByTestId('skill-row')).toHaveLength(6)
  })

  it('renders treasure-demon extra-trait rows with their trait effects', () => {
    render(<App />)
    typePersona('Crystal Skull')

    const rows = screen.getAllByTestId('skill-row')
    expect(rows).toHaveLength(11)

    const foulStench = rows.find(
      (row) => within(row).getByTestId('skill-name').textContent === 'Foul Stench',
    )
    expect(foulStench).toBeDefined()
    if (foulStench) {
      expect(within(foulStench).getByText(effectOf('Foul Stench'))).toBeInTheDocument()
      expect(within(foulStench).getByText('trait')).toBeInTheDocument()
    }

    expect(screen.getByTestId('trait-name')).toHaveTextContent('Ultimate Vessel')
  })
})
