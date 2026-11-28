import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../src/ui/App'

function choosePersona(name: string) {
  fireEvent.change(screen.getByLabelText('Persona'), {
    target: { value: name },
  })
}

function row(position: number): HTMLElement {
  return screen.getAllByTestId('skill-row')[position - 1]
}

function changeSkill(position: number, value: string) {
  fireEvent.change(within(row(position)).getByLabelText(`Skill ${position}`), {
    target: { value },
  })
}

function selectSource(position: number, skill: string, value: string) {
  fireEvent.change(
    within(row(position)).getByLabelText(`Source for ${skill}`),
    { target: { value } },
  )
}

function solveButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Solve' })
}

describe('PlanTree', () => {
  it('renders a one-fusion plan with its inherited skill and learn level', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Patra')
    selectSource(1, 'Patra', 'persona:Pixie')

    fireEvent.click(solveButton())

    expect(screen.getByTestId('plan-tree')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fusion plan' })).toBeInTheDocument()

    const fusion = screen.getByTestId('plan-fusion')
    expect(fusion).toHaveTextContent('Arsène')
    expect(fusion).toHaveTextContent('Pixie')

    expect(screen.getByTestId('plan-inherit')).toHaveTextContent(
      'Inherit: Patra from Pixie',
    )

    const learns = screen.getAllByTestId('plan-learn')
    expect(
      learns.some(
        (element) =>
          element.textContent?.includes('Patra') &&
          element.textContent?.includes('Lv 3'),
      ),
    ).toBe(true)
  })

  it('renders an advanced three-ingredient fusion plan', () => {
    render(<App />)
    choosePersona('Neko Shogun')
    changeSkill(1, 'Garu')
    selectSource(1, 'Garu', 'persona:Kodama')

    fireEvent.click(solveButton())

    expect(screen.queryByText(/not supported yet/)).not.toBeInTheDocument()
    expect(screen.getByTestId('plan-tree')).toBeInTheDocument()

    const fusion = screen.getByTestId('plan-fusion')
    expect(fusion).toHaveTextContent('Kodama')
    expect(fusion).toHaveTextContent('Sudama')
    expect(fusion).toHaveTextContent('Anzu')
    expect(fusion).toHaveTextContent('Neko Shogun')

    expect(screen.getByTestId('plan-inherit')).toHaveTextContent(
      'Inherit: Garu from Kodama',
    )

    const fuseStep = screen
      .getAllByTestId('plan-step')
      .find((element) => element.getAttribute('data-kind') === 'fuse')
    expect(fuseStep).toBeDefined()
    expect(fuseStep).toHaveTextContent('Fuse Kodama + Sudama + Anzu → Neko Shogun')
  })

  it('shows no plan found within four fusions', () => {
    render(<App />)
    choosePersona('Arsène')
    changeSkill(1, 'Eiga')
    selectSource(1, 'Eiga', 'persona:Choronzon')

    fireEvent.click(solveButton())

    expect(
      screen.getByText('No plan found within 4 fusions'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('plan-tree')).not.toBeInTheDocument()
  })

  it('clears the previous plan when the target changes', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Patra')
    selectSource(1, 'Patra', 'persona:Pixie')

    fireEvent.click(solveButton())
    expect(screen.getByTestId('plan-tree')).toBeInTheDocument()

    choosePersona('Neko Shogun')
    expect(screen.queryByTestId('plan-tree')).not.toBeInTheDocument()
  })

  it('disables Solve while the build has validation errors', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Hassou Tobi')

    expect(solveButton()).toBeDisabled()
  })
})
