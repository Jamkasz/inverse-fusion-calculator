export type Persona = {
  name: string
  arcana: string
  level: number
  skills: Record<string, number>
  trait: string
  inherits: string | null
  special: boolean
  rare: boolean
  dlc: boolean
}

export type CardSources = {
  chair: string[]
  chairAlarm: string[]
  negotiation: string[]
}

export type Skill = {
  name: string
  element: string
  effect: string
  cost: number | null
  unique: boolean
  personas: Record<string, number>
  cardSources: CardSources
  acquisitionNote: string | null
}

export type GameData = {
  personas: Persona[]
  skills: Skill[]
  traits: Skill[]
  arcanaCombos: { source: [string, string]; result: string }[]
  specialCombos: { result: string; sources: string[] }[]
  rarePersonae: string[]
  rareCombos: Record<string, number[]>
  inheritanceChart: Record<string, boolean[]>
  dlcGroups: string[][]
}
