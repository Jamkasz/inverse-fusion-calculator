import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '../../src/ui/App'
import TraitPicker from '../../src/ui/TraitPicker'
import { loadGameData } from '../../src/data/load'
import type { BuildError } from '../../src/engine/build'
import { createFusion } from '../../src/engine/fusion'
import { buildRecipeIndex } from '../../src/engine/recipes'

const data = loadGameData({ ownedDlc: [] })
const recipes = buildRecipeIndex(
  data,
  createFusion(data, { allowRare: false }),
  null,
)
const allDlcData = loadGameData({ ownedDlc: data.dlcGroups.flat() })
const allDlcRecipes = buildRecipeIndex(
  allDlcData,
  createFusion(allDlcData, { allowRare: false }),
  null,
)

function choosePersona(name: string) {
  fireEvent.change(screen.getByLabelText('Persona'), {
    target: { value: name },
  })
}

function traitSelect(): HTMLSelectElement {
  return screen.getByLabelText('Trait') as HTMLSelectElement
}

function sourceSelect(): HTMLSelectElement {
  return screen.getByLabelText('Trait source') as HTMLSelectElement
}

function ownOptionLabel(select: HTMLSelectElement): string | null | undefined {
  return Array.from(select.options).find((option) => option.value === 'own')
    ?.textContent
}

describe('TraitPicker', () => {
  it('defaults to keeping the target’s own trait and shows its effect', () => {
    render(<App />)
    choosePersona('Agathion')

    const select = traitSelect()
    expect(select).toHaveValue('own')
    expect(ownOptionLabel(select)).toBe('Keep own (Rare Antibody)')
    expect(screen.getByTestId('trait-effect')).toHaveTextContent(
      'Reduces susceptibility to ailments',
    )
    expect(screen.queryByTestId('trait-name')).not.toBeInTheDocument()
  })

  it('resets to the new target’s own trait when the target changes', () => {
    render(<App />)
    choosePersona('Agathion')
    fireEvent.change(traitSelect(), {
      target: { value: 'Static Electricity' },
    })

    choosePersona('Neko Shogun')

    const select = traitSelect()
    expect(select).toHaveValue('own')
    expect(ownOptionLabel(select)).toBe('Keep own (Pinch Anchor)')
    expect(screen.getByTestId('trait-effect')).toHaveTextContent(
      'Allows use of ambush-only skills after Baton Pass',
    )
  })

  it('does not list a trait whose only owners are unavailable DLC personas', () => {
    render(<App />)
    choosePersona('Agathion')

    const values = Array.from(traitSelect().options).map(
      (option) => option.value,
    )
    expect(values).not.toContain('God Maker')
    expect(
      screen.queryByRole('option', { name: 'God Maker' }),
    ).not.toBeInTheDocument()
  })

  it('excludes DLC-only and rare-only traits even when their owners exist', () => {
    const agathion = allDlcData.personas.find(
      (entry) => entry.name === 'Agathion',
    )
    if (!agathion) throw new Error('Missing Agathion')

    render(
      <TraitPicker
        persona={agathion}
        data={allDlcData}
        recipes={allDlcRecipes}
        value={null}
        onChange={vi.fn()}
        errors={[]}
      />,
    )

    const values = Array.from(traitSelect().options).map(
      (option) => option.value,
    )
    expect(values).not.toContain('God Maker')
    expect(values).not.toContain('Ultimate Vessel')
  })

  it('lists passing owners of the chosen trait annotated by trait reach', () => {
    render(<App />)
    choosePersona('Agathion')

    fireEvent.change(traitSelect(), {
      target: { value: 'Static Electricity' },
    })

    const select = sourceSelect()
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      'Pixie',
      'Mothman',
      'Oberon',
      'Queen Mab',
    ])
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(
      [
        'Pixie · 1 fusion',
        'Mothman · 3 fusions',
        'Oberon · 3 fusions',
        'Queen Mab · 3 fusions',
      ],
    )
    expect(select).toHaveValue('Pixie')
    expect(screen.getByTestId('trait-effect')).toHaveTextContent(
      'Increases chance of inflicting Shock on downed foes',
    )
  })

  it('solves a trait-only build and tells the plan whose trait to take', async () => {
    render(<App />)
    choosePersona('Agathion')

    fireEvent.change(traitSelect(), {
      target: { value: 'Static Electricity' },
    })

    const solve = screen.getByRole('button', { name: 'Solve' })
    await waitFor(() => expect(solve).not.toBeDisabled())
    fireEvent.click(solve)

    const steps = screen.getByTestId('plan-steps')
    expect(steps.textContent).toContain(
      "Trait: take Pixie's Static Electricity",
    )
  })

  it('renders trait validation errors next to the picker', () => {
    const agathion = data.personas.find((entry) => entry.name === 'Agathion')
    if (!agathion) throw new Error('Missing Agathion')

    const errors: BuildError[] = [
      {
        code: 'TRAIT_SOURCE_MISMATCH',
        message: "Pixie's own trait is Static Electricity, not Rare Antibody",
      },
    ]

    render(
      <TraitPicker
        persona={agathion}
        data={data}
        recipes={recipes}
        value={{ name: 'Rare Antibody', from: 'Pixie' }}
        onChange={vi.fn()}
        errors={errors}
      />,
    )

    expect(screen.getByTestId('trait-errors')).toHaveTextContent(
      "Pixie's own trait is Static Electricity, not Rare Antibody",
    )
  })
})
