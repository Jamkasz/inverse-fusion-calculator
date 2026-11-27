import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../src/ui/App'

function choosePersona(name: string) {
  fireEvent.change(screen.getByLabelText('Persona'), {
    target: { value: name },
  })
}

function displayedCosts(): number[] {
  return screen
    .getAllByTestId('recipe-cost')
    .map((element) => Number(element.getAttribute('data-cost')))
}

describe('RecipeList', () => {
  it("shows Neko Shogun's single multi-ingredient recipe", () => {
    render(<App />)
    choosePersona('Neko Shogun')

    expect(
      screen.getByRole('heading', { name: /Ways to fuse Neko Shogun/ }),
    ).toBeInTheDocument()

    const rows = screen.getAllByTestId('recipe-row')
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByTestId('recipe-ingredients')).toHaveTextContent(
      'Kodama + Sudama + Anzu',
    )
    expect(within(rows[0]).getByTestId('recipe-cost')).toHaveTextContent(
      'Approx. cost 41064',
    )
  })

  it('shows Cannot be fused for a rare persona', () => {
    render(<App />)
    choosePersona('Regent')

    expect(screen.getByText('Cannot be fused')).toBeInTheDocument()
    expect(screen.queryAllByTestId('recipe-row')).toHaveLength(0)
  })

  it('lists recipes in cost ascending order', () => {
    render(<App />)
    choosePersona('Mokoi')

    const costs = displayedCosts()
    expect(costs.length).toBeGreaterThan(1)
    expect(costs).toEqual([...costs].sort((a, b) => a - b))
  })

  it('shows the first 20 recipes and toggles all on and off', () => {
    render(<App />)
    choosePersona('Ananta')

    expect(screen.getAllByTestId('recipe-row')).toHaveLength(20)

    const heading = screen.getByRole('heading', {
      name: /Ways to fuse Ananta/,
    })
    const match = /: (\d+) recipes?$/.exec(heading.textContent ?? '')
    expect(match).not.toBeNull()
    const total = Number(match?.[1])
    expect(total).toBeGreaterThan(20)

    const toggle = screen.getByRole('button', {
      name: /^Show all \d+ recipes$/,
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByTestId('recipe-row')).toHaveLength(total)

    fireEvent.click(screen.getByRole('button', { name: 'Show first 20' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByTestId('recipe-row')).toHaveLength(20)
  })

  it('notes that treasure-demon fusions are disabled', () => {
    render(<App />)
    choosePersona('Agathion')

    expect(
      screen.getByText(
        'Fusions with exactly one treasure demon are not listed while they are disabled in settings.',
      ),
    ).toBeInTheDocument()
  })
})
