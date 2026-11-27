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
import { createFusion } from '../../src/engine/fusion'
import { buildRecipeIndex } from '../../src/engine/recipes'

const data = loadGameData({ ownedDlc: [] })
const recipes = buildRecipeIndex(
  data,
  createFusion(data, { allowRare: false }),
  null,
)

const HELD_OPTION_LABEL =
  'A persona I own already has it (e.g. Network Fusion)…'

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

function lastOptionLabel(select: HTMLSelectElement): string | null {
  const options = Array.from(select.options)
  return options.length > 0 ? options[options.length - 1].textContent : null
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

    render(
      <BuildForm
        persona={yoshitsune}
        data={data}
        recipes={recipes}
        onChange={vi.fn()}
      />,
    )

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

  it('explains a unique skill and still offers the held option', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Hassou Tobi')

    const row = rows()[0]
    expect(within(row).getByTestId('source-reason')).toHaveTextContent(
      'unique to Yoshitsune',
    )
    const select = within(row).getByTestId('skill-source') as HTMLSelectElement
    expect(select).toHaveValue('held')
    expect(lastOptionLabel(select)).toBe(HELD_OPTION_LABEL)
  })

  it('explains an element the target cannot inherit and still offers held', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Vacuum Wave')

    const row = rows()[0]
    expect(within(row).getByTestId('source-reason')).toHaveTextContent(
      'Agathion cannot inherit Wind skills',
    )
    const select = within(row).getByTestId('skill-source') as HTMLSelectElement
    expect(select).toHaveValue('held')
    expect(lastOptionLabel(select)).toBe(HELD_OPTION_LABEL)
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

  it('shows the reference acquisition note even when only held is offered', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Almighty Amp')

    const row = rows()[0]
    expect(within(row).getByTestId('source-reason')).toHaveTextContent(
      'No persona learns this skill',
    )
    const select = within(row).getByTestId('skill-source') as HTMLSelectElement
    expect(select).toHaveValue('held')
    expect(lastOptionLabel(select)).toBe(HELD_OPTION_LABEL)
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
    const select = within(row).getByTestId('skill-source') as HTMLSelectElement
    expect(select).toHaveValue('held')
    expect(lastOptionLabel(select)).toBe(HELD_OPTION_LABEL)
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
      <BuildForm
        persona={synthetic}
        data={cloned}
        recipes={recipes}
        onChange={vi.fn()}
      />,
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
    render(
      <BuildForm
        persona={agathion}
        data={data}
        recipes={recipes}
        onChange={onChange}
      />,
    )

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

  it('turns the held option into a persona input and reports the held source', async () => {
    const agathion = data.personas.find((persona) => persona.name === 'Agathion')
    if (!agathion) throw new Error('Missing Agathion')

    const onChange = vi.fn()
    render(
      <BuildForm
        persona={agathion}
        data={data}
        recipes={recipes}
        onChange={onChange}
      />,
    )

    const row = rows()[4]
    fireEvent.change(within(row).getByLabelText('Source for Zio'), {
      target: { value: 'held' },
    })

    const input = within(row).getByLabelText('Owned persona for Zio')
    fireEvent.change(input, { target: { value: 'Pixie' } })

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)?.[0] as Build | undefined
      expect(last?.skills).toContainEqual({
        name: 'Zio',
        source: { kind: 'held', persona: 'Pixie' },
      })
    })
  })

  it('counts inherited rows against the target capacity', () => {
    render(<App />)
    choosePersona('Agathion')

    fireEvent.change(screen.getByLabelText('Source for Zio'), {
      target: { value: 'persona:Pixie' },
    })

    expect(screen.getByTestId('inherited-counter')).toHaveTextContent(
      'Inherited: 1 of 4',
    )
  })

  it('shows a row-level error for an invalid held skill', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'Hassou Tobi')

    expect(
      within(rows()[0]).getByTestId('build-error'),
    ).toHaveTextContent('Hassou Tobi is unique and cannot be inherited')
  })

  it('always ends the source select with the held option', () => {
    render(<App />)
    choosePersona('Agathion')

    const select = within(rows()[0]).getByTestId(
      'skill-source',
    ) as HTMLSelectElement
    expect(lastOptionLabel(select)).toBe(HELD_OPTION_LABEL)
  })

  it('labels the held input distinctly from the target persona picker', () => {
    render(<App />)
    choosePersona('Agathion')

    const row = rows()[4]
    fireEvent.change(within(row).getByLabelText('Source for Zio'), {
      target: { value: 'held' },
    })

    expect(within(row).getByLabelText('Owned persona for Zio')).toBeInTheDocument()
    expect(within(row).queryByLabelText('Persona')).not.toBeInTheDocument()
  })

  it('treats prototype names as unknown skills and keeps the held source', () => {
    render(<App />)
    choosePersona('Agathion')
    changeSkill(1, 'constructor')

    const row = rows()[0]
    expect(within(row).getByTestId('build-error')).toHaveTextContent(
      'Unknown skill: constructor',
    )
    const select = within(row).getByTestId('skill-source') as HTMLSelectElement
    expect(select).toHaveValue('held')
    expect(within(row).queryByTestId('skill-level')).not.toBeInTheDocument()
    expect(within(row).queryByText(/\[native code\]/)).not.toBeInTheDocument()
  })

  it('treats treasure-demon extra trait names as unknown skills', () => {
    render(<App />)
    choosePersona('Crystal Skull')
    changeSkill(1, 'Foul Stench')

    const row = rows()[0]
    expect(within(row).getByTestId('build-error')).toHaveTextContent(
      'Unknown skill: Foul Stench',
    )
    const select = within(row).getByTestId('skill-source') as HTMLSelectElement
    expect(select).toHaveValue('held')
    expect(within(row).queryByTestId('skill-level')).not.toBeInTheDocument()
  })

  it('shows the held persona input only while the held source is selected', () => {
    render(<App />)
    choosePersona('Agathion')

    const row = rows()[4]
    expect(
      within(row).queryByLabelText('Owned persona for Zio'),
    ).not.toBeInTheDocument()

    fireEvent.change(within(row).getByLabelText('Source for Zio'), {
      target: { value: 'held' },
    })
    expect(within(row).getByLabelText('Owned persona for Zio')).toBeInTheDocument()

    fireEvent.change(within(row).getByLabelText('Source for Zio'), {
      target: { value: 'innate' },
    })
    expect(
      within(row).queryByLabelText('Owned persona for Zio'),
    ).not.toBeInTheDocument()
  })
})
