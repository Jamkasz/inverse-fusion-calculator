export const PINNED_COMMIT = '802422dad1f5b9eee441e594e738aceaeb9e5a85'
export const SHORT_COMMIT = PINNED_COMMIT.slice(0, 7)
export const REFERENCE_SITE_URL =
  'https://chinhodado.github.io/persona5_calculator/indexRoyal.html'
export const REFERENCE_COMMIT_URL = `https://github.com/chinhodado/persona5_calculator/commit/${PINNED_COMMIT}`

export default function App() {
  return (
    <main className="app">
      <h1>Inverse Fusion Calculator</h1>
      <p className="description">
        Plan a Persona 5 Royal fusion backwards: choose a target persona and
        the skills and trait it should have.
      </p>
      <footer>
        <p>
          Built on the{' '}
          <a href={REFERENCE_SITE_URL} target="_blank" rel="noreferrer">
            Persona 5 fusion calculator
          </a>{' '}
          by chinhodado, pinned at commit{' '}
          <a href={REFERENCE_COMMIT_URL} target="_blank" rel="noreferrer">
            <code>{SHORT_COMMIT}</code>
          </a>{' '}
          (<code>{PINNED_COMMIT}</code>). Game data is vendored from that
          repository and used under the Apache License 2.0; see NOTICE.
        </p>
      </footer>
    </main>
  )
}
