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
    changeSkill(1, 'Absorb Bless')

    const row = rows()[0]
    const select = within(row).getByTestId('skill-source') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((option) => option.value)
    const optionLabels = Array.from(select.options).map(
      (option) => option.textContent,
    )

    expect(optionValues).not.toContain('innate')
    expect(optionLabels).not.toContain('Innate')
    expect(optionLabels).toContain('Cybele (Lv 87)')
    expect(optionLabels).toContain('Vohu Manah (Lv 82)')

    const first = sourceOptions(data, 'Agathion', 'Absorb Bless')[0]
    expect(first.kind).toBe('persona')
    expect(select.value).toBe(
      first.kind === 'persona' ? `persona:${first.persona}` : '',
    )
    expect(
      within(row).getByRole('option', { name: /Cybele/ }),
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
    changeSkill(1, 'Vacuum Wave')

    expect(rows()[0]).toBeDefined()
    expect(screen.getByTestId('source-reason')).toHaveTextContent(
      'Agathion cannot inherit Wind skills',
    )
  })

  it('offers Skill card for Zio and lists the normal electric chair source', () => {
    render(<App />)
    choosePersona('Agathion')

    const row = rows()[4]
    const select = within(row).getByLabelText(
      'Source for Zio',
    ) as HTMLSelectElement
    expect(
      Array.from(select.options).map((option) => option.textContent),
    ).toContain('Skill card')

    fireEvent.change(select, { target: { value: 'card' } })

    const list = within(row).getByTestId('card-source-list')
    expect(within(list).getByText('Electric chair: Agathion')).toBeInTheDocument()
    expect(
      within(list).getAllByTestId('card-source-group'),
    ).toHaveLength(1)

    fireEvent.change(select, { target: { value: 'innate' } })

    expect(within(row).queryByTestId('card-source-list')).not.toBeInTheDocument()
  })

  it('defaults Mazio to the card and shows only the alarm chair source', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Mazio')

    const row = rows()[0]
    expect(within(row).getByTestId('skill-source')).toHaveValue('card')
    const list = within(row).getByTestId('card-source-list')
    expect(
      within(list).getByText('Electric chair during fusion alarm: Agathion'),
    ).toBeInTheDocument()
    expect(
      within(list).queryByText('Electric chair: Agathion'),
    ).not.toBeInTheDocument()
    expect(within(list).getAllByTestId('card-source-group')).toHaveLength(1)
  })

  it('defaults Brain Buster to the card and shows only its negotiation source', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Brain Buster')

    const row = rows()[0]
    expect(within(row).getByTestId('skill-source')).toHaveValue('card')
    const list = within(row).getByTestId('card-source-list')
    expect(
      within(list).getByText('Negotiation: Monk of the Valley (Kurama Tengu)'),
    ).toBeInTheDocument()
    expect(within(list).queryByText(/Electric chair/)).not.toBeInTheDocument()
    expect(within(list).getAllByTestId('card-source-group')).toHaveLength(1)
  })

  it('shows both alarm and negotiation groups for Abysmal Surge', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Abysmal Surge')

    const row = rows()[0]
    expect(within(row).getByTestId('skill-source')).toHaveValue('card')
    const list = within(row).getByTestId('card-source-list')
    expect(
      within(list).getByText('Electric chair during fusion alarm: Loa'),
    ).toBeInTheDocument()
    expect(
      within(list).getByText('Negotiation: Awakened God (Arahabaki)'),
    ).toBeInTheDocument()
    expect(within(list).queryByText('Electric chair: Loa')).not.toBeInTheDocument()
    expect(within(list).getAllByTestId('card-source-group')).toHaveLength(2)
  })

  it('shows the reference acquisition note even when there is no source', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Almighty Amp')

    const row = rows()[0]
    expect(within(row).getByTestId('source-reason')).toHaveTextContent(
      'No persona learns this skill',
    )
    expect(within(row).queryByTestId('skill-source')).not.toBeInTheDocument()
    expect(within(row).getByTestId('acquisition-note')).toHaveTextContent(
      'Reference notes: Network Fusion',
    )
  })

  it('shows a Fusion Mutation reference note too', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Attract')

    const row = rows()[0]
    expect(within(row).getByTestId('source-reason')).toHaveTextContent(
      'No persona learns this skill',
    )
    expect(within(row).queryByTestId('skill-source')).not.toBeInTheDocument()
    expect(within(row).getByTestId('acquisition-note')).toHaveTextContent(
      'Reference notes: Fusion Mutation',
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

    changeSkill(1, 'Absorb Bless')

    const firstSource = sourceOptions(data, 'Agathion', 'Absorb Bless')[0]
    const expectedAfterEdit: Build = {
      target: 'Agathion',
      skills: [
        { name: 'Absorb Bless', source: firstSource },
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
