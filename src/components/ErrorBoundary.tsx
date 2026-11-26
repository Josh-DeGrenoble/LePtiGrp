import { Component, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from './Layout'
import { IconBack } from './Icons'

/** Écran de secours : on n'est jamais bloqué sur une page qui plante */
function Fallback({ error, retry }: { error: Error; retry: () => void }) {
  const nav = useNavigate()
  const back = () => (window.history.length > 1 ? nav(-1) : nav('/', { replace: true }))
  return (
    <Screen header={<><button className="icon-btn" onClick={back} aria-label="Retour"><IconBack /></button><h1>Oups</h1><span className="icon-btn" /></>}>
      <div className="crash">
        <p>Cette page a rencontré un problème.</p>
        <small className="muted">{error.message}</small>
        <button className="btn primary wide" onClick={retry}>Réessayer</button>
        <button className="btn wide" onClick={() => nav('/', { replace: true })}>Retour aux conversations</button>
      </div>
    </Screen>
  )
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error(error) }
  render() {
    return this.state.error ? <Fallback error={this.state.error} retry={() => this.setState({ error: null })} /> : this.props.children
  }
}
