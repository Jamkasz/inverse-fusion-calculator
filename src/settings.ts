export type Settings = {
  ownedDlc: string[]
  allowRare: boolean
  maxDepth: number
  playerLevel: number | null
}

export const DEFAULT_SETTINGS: Settings = {
  ownedDlc: [],
  allowRare: false,
  maxDepth: 4,
  playerLevel: null,
}
