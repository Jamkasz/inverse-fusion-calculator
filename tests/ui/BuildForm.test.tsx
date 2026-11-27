import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '../../src/ui/App'
import BuildForm from '../../src/ui/BuildForm'
import { formatCost, loadGameData } from '../../src/data/load'
import type { GameData, Persona } from '../../src/data/types'
import { sourceOptions } from '../../src/engine/build'
import type { Build } from '../../src/engine/build'

const data = loadGameData({ ownedDlc: [] })

function skillOf(name: string) {
  const found = data.skills.find((skill) => skill.name === name)
  if (!found) throw new Error(`Missing skill ${name}`)
  return found
}

function choosePersona(name: string) {
  fireEvent.change(screen.getByLabelText('Persona'), {
    target: { value: name },
  })
}

function changeSkill(position: number, value: string) {
  fireEvent.change(screen.getByLabelText(`Skill ${position}`), {
    target: { value },
  })
}

function rows(): HTMLElement[] {
  return screen.getAllByTestId('skill-row')
}

function skillInputValues(): string[] {
  return (screen.getAllByLabelText(/^Skill \d+$/) as HTMLInputElement[]).map(
    (input) => input.value,
  )
}

function datalistValues(): string[] {
  const datalist = document.querySelector('datalist')
  if (!datalist) throw new Error('Missing datalist')
  return Array.from(datalist.querySelectorAll('option')).map(
    (option) => option.value,
  )
}

describe('BuildForm', () => {
  it('prefills Agathion’s moveset with innate sources and full presentation', () => {
    render(<App />)
    choosePersona('Agathion')

    const list = rows()
    expect(list).toHaveLength(6)

    const expectedOrder = [
      'Dia',
      'Baisudi',
      'Lunge',
      'Rakukaja',
      'Zio',
      'Dodge Elec',
    ]

    expectedOrder.forEach((name, index) => {
      const row = list[index]
      expect(within(row).getByLabelText(`Skill ${index + 1}`)).toHaveValue(name)
      expect(within(row).getByTestId('skill-source')).toHaveValue('innate')
      expect(within(row).getByText(skillOf(name).effect)).toBeInTheDocument()

      const skill = skillOf(name)
      expect(within(row).getByTestId('skill-element')).toHaveTextContent(
        skill.element,
      )
      expect(within(row).getByTestId('skill-cost')).toHaveTextContent(
        formatCost(skill),
      )
    })

    expect(within(list[0]).getByTestId('skill-level')).toHaveTextContent('base')
    expect(within(list[4]).getByTestId('skill-level')).toHaveTextContent('Lv 7')
  })

  it('replaces the rows when the target changes', () => {
    render(<App />)
    choosePersona('Agathion')
    choosePersona('Neko Shogun')

    const list = rows()
    expect(list).toHaveLength(7)
    expect(within(list[0]).getByLabelText('Skill 1')).toHaveValue('Psio')
    for (const row of list) {
      expect(within(row).getByTestId('skill-source')).toHaveValue('innate')
    }
  })

  it('offers a unique target-owned skill in the shared datalist', () => {
    const yoshitsune = data.personas.find(
      (persona) => persona.name === 'Yoshitsune',
    )
    if (!yoshitsune) throw new Error('Missing Yoshitsune')

    render(<BuildForm persona={yoshitsune} data={data} onChange={vi.fn()} />)

    expect(datalistValues()).toContain('Hassou Tobi')

    const sourceLabels = screen
      .getAllByTestId('skill-source')
      .flatMap((element) =>
        Array.from((element as HTMLSelectElement).options).map(
          (option) => option.textContent,
        ),
      )
    expect(sourceLabels).not.toContain('Hassou Tobi')
  })

  it('removes innate and offers persona sources for an inherited skill', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Agi')

    const row = rows()[0]
    const select = within(row).getByTestId('skill-source') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((option) => option.value)
    const optionLabels = Array.from(select.options).map(
      (option) => option.textContent,
    )

    expect(optionValues).not.toContain('innate')
    expect(optionLabels).not.toContain('Innate')
    expect(optionLabels).toContain('Cait Sith (base)')
    expect(optionLabels).toContain('Succubus (Lv 8)')

    const first = sourceOptions(data, 'Agathion', 'Agi')[0]
    expect(first.kind).toBe('persona')
    expect(select.value).toBe(
      first.kind === 'persona' ? `persona:${first.persona}` : '',
    )
    expect(
      within(row).getByRole('option', { name: /Cait Sith/ }),
    ).toBeInTheDocument()
  })

  it('explains a unique skill instead of offering a source', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Hassou Tobi')

    const row = rows()[0]
    expect(within(row).getByTestId('source-reason')).toHaveTextContent(
      'unique to Yoshitsune',
    )
    expect(within(row).queryByTestId('skill-source')).not.toBeInTheDocument()
  })

  it('explains an element the target cannot inherit', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Garu')

    expect(rows()[0]).toBeDefined()
    expect(screen.getByTestId('source-reason')).toHaveTextContent(
      'Agathion cannot inherit Wind skills',
    )
  })

  it('caps the moveset at eight rows', () => {
    render(<App />)
    choosePersona('Agathion')
    expect(rows()).toHaveLength(6)

    fireEvent.click(screen.getByRole('button', { name: 'Add skill' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add skill' }))
    expect(rows()).toHaveLength(8)

    const add = screen.getByRole('button', { name: 'Add skill' })
    expect(add).toBeDisabled()
    fireEvent.click(add)
    expect(rows()).toHaveLength(8)
  })

  it('lists skills beyond eight as chips and adds them into a free row', () => {
    const agathion = data.personas.find((persona) => persona.name === 'Agathion')
    if (!agathion) throw new Error('Missing Agathion')

    const nineSkills = [
      'Dia',
      'Baisudi',
      'Lunge',
      'Rakukaja',
      'Zio',
      'Dodge Elec',
      'Agi',
      'Bufu',
      'Psio',
    ]
    const synthetic: Persona = {
      ...agathion,
      name: 'Test Persona',
      skills: Object.fromEntries(nineSkills.map((name, index) => [name, index])),
    }
    const cloned: GameData = {
      ...data,
      personas: [...data.personas, synthetic],
    }

    render(
      <BuildForm persona={synthetic} data={cloned} onChange={vi.fn()} />,
    )

    expect(rows()).toHaveLength(8)
    const chip = screen.getByRole('button', { name: 'Psio' })
    expect(chip).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Dia' }))
    expect(rows()).toHaveLength(7)
    expect(screen.getByRole('button', { name: 'Psio' })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Psio' }))
    expect(rows()).toHaveLength(8)
    expect(skillInputValues()).toContain('Psio')
    expect(
      screen.queryByRole('button', { name: 'Psio' }),
    ).not.toBeInTheDocument()
  })

  it('reports the build and uses the first valid source after an edit', async () => {
    const agathion = data.personas.find((persona) => persona.name === 'Agathion')
    if (!agathion) throw new Error('Missing Agathion')

    const onChange = vi.fn()
    render(<BuildForm persona={agathion} data={data} onChange={onChange} />)

    const nativeNames = ['Dia', 'Baisudi', 'Lunge', 'Rakukaja', 'Zio', 'Dodge Elec']
    const expected: Build = {
      target: 'Agathion',
      skills: nativeNames.map((name) => ({
        name,
        source: { kind: 'innate' },
      })),
      trait: null,
    }

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(expected)
    })

    changeSkill(1, 'Agi')

    const firstSource = sourceOptions(data, 'Agathion', 'Agi')[0]
    const expectedAfterEdit: Build = {
      target: 'Agathion',
      skills: [
        { name: 'Agi', source: firstSource },
        ...nativeNames.slice(1).map((name) => ({
          name,
          source: { kind: 'innate' as const },
        })),
      ],
      trait: null,
    }

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(expectedAfterEdit)
    })
  })
})
