import { fireEvent, render, screen } from '@testing-library/react'
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
  it('shows the header, arcana, base level and trait', () => {
    render(<App />)
    typePersona('Agathion')

    expect(screen.getByRole('heading', { name: 'Agathion' })).toBeInTheDocument()
    expect(screen.getByText('Chariot')).toBeInTheDocument()
    expect(screen.getByText('Base level 3')).toBeInTheDocument()
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
  })

  it('keeps a treasure demon’s own trait but only lists real skills as moves', () => {
    render(<App />)
    typePersona('Crystal Skull')

    expect(screen.getByTestId('trait-name')).toHaveTextContent('Ultimate Vessel')
    expect(screen.getByTestId('trait-effect')).toHaveTextContent(
      effectOf('Ultimate Vessel'),
    )

    expect(screen.getAllByTestId('skill-row')).toHaveLength(8)
    const values = (
      screen.getAllByLabelText(/^Skill \d+$/) as HTMLInputElement[]
    ).map((input) => input.value)

    expect(values).toContain('Maragidyne')
    expect(values).not.toContain('Foul Stench')
    expect(values).not.toContain('Ailment Hunter')
    expect(values).not.toContain('Cursed Bloodline')

    // The three extra trait names are not moveset skills at all, so they must
    // not appear as "also learns" chips and there is no extras section.
    for (const name of ['Foul Stench', 'Ailment Hunter', 'Cursed Bloodline']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Also learns')).not.toBeInTheDocument()
  })
})
