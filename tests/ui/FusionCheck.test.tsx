import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../../src/ui/App'

function openFusionCheck(): HTMLElement {
  const toggle = screen.getByRole('button', { name: 'Fusion check' })
  fireEvent.click(toggle)
  return toggle
}

function choosePersonas(first: string, second: string) {
  fireEvent.change(screen.getByLabelText('First persona'), {
    target: { value: first },
  })
  fireEvent.change(screen.getByLabelText('Second persona'), {
    target: { value: second },
  })
}

describe('FusionCheck', () => {
  it('starts collapsed and expands into a labelled region', () => {
    render(<App />)

    const toggle = screen.getByRole('button', { name: 'Fusion check' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const panelId = toggle.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    expect(document.getElementById(panelId as string)).toHaveAttribute('hidden')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(panelId as string)).not.toHaveAttribute('hidden')
    expect(
      screen.getByRole('region', { name: 'Fusion check' }),
    ).toBeInTheDocument()
  })

  it('shows Shiva for Barong + Rangda', () => {
    render(<App />)
    openFusionCheck()

    choosePersonas('Barong', 'Rangda')

    expect(screen.getByTestId('fusion-result')).toHaveTextContent('Shiva')
  })

  it('shows a cannot-fuse message when fuse returns null', () => {
    render(<App />)
    openFusionCheck()

    // Judgement and Chariot have no fusion combination in the data.
    choosePersonas('Abaddon', 'Agathion')

    expect(screen.getByTestId('fusion-result')).toHaveTextContent(
      'These cannot be fused',
    )
  })

  it('forces allowRare:true and notes the treasure-demon base-level assumption', () => {
    render(<App />)
    openFusionCheck()

    // Regent is a rare treasure demon: this pair is null with allowRare:false
    // but resolves to Slime when rare fusion is allowed.
    choosePersonas('Regent', 'Agathion')

    expect(screen.getByTestId('fusion-result')).toHaveTextContent('Slime')
    expect(
      screen.getByText('Assumes the other persona is at its base level.'),
    ).toBeInTheDocument()
  })

  it('does not show the treasure-demon note for rare + rare pairs', () => {
    render(<App />)
    openFusionCheck()

    // Both ingredients are treasure demons, so this is not a rare fusion and
    // the base-level assumption does not apply.
    choosePersonas('Regent', 'Koh-i-Noor')

    expect(
      screen.queryByText('Assumes the other persona is at its base level.'),
    ).not.toBeInTheDocument()
  })

  it('asks for two different personas when the same name is chosen twice', () => {
    render(<App />)
    openFusionCheck()

    choosePersonas('Barong', 'Barong')

    expect(screen.getByTestId('fusion-result')).toHaveTextContent(
      'Pick two different personas',
    )
    expect(
      screen.queryByText('Assumes the other persona is at its base level.'),
    ).not.toBeInTheDocument()
  })
})
