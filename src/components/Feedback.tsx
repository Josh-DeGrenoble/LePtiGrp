import { useEffect, useState, type ReactNode } from 'react'
import { IconBug, IconBulb, IconClose, IconCoffee } from './Icons'
import { ask, notify } from './Dialog'
import { SGroup, SRow } from './SettingsRow'
import { C } from '../lib/palette'
import { supabase, errMsg } from '../lib/supabase'
import { useMe } from '../lib/auth'

type Kind = 'bug' | 'idea'
type Item = { id: number; kind: Kind; message: string; created_at: string; profiles: { display_name: string } | null }

/** Pop-up centrée ; `angry` la fait trembler (et vibrer le téléphone) quelques secondes */
function Popup({ children, onClose, angry }: { children: ReactNode; onClose: () => void; angry?: boolean }) {
  useEffect(() => { if (angry) navigator.vibrate?.([120, 60, 120, 60, 120, 60, 300]) }, [angry])
  return (
    <div className="popup-backdrop" onClick={onClose}>
      <div className={`popup${angry ? ' angry' : ''}`} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  )
}

const TEXT: Record<Kind, { title: string; intro: string; placeholder: string }> = {
  bug: {
    title: 'Remonter un bug',
    intro: "T'as trouvé un bug ? Impossible. C'est pas bien de mentir !!!!!! 😤 Bon allez, dis-moi comment ce n'est pas arrivé.",
    placeholder: "Ce que tu faisais, ce qui s'est passé…",
  },
  idea: { title: 'Proposer une évolution', intro: 'Une idée pour l\'appli ? Je t\'écoute 👂', placeholder: 'Ton idée…' },
}

/** Réglages, « Le dev » : café, bugs, idées */
export function DevSection() {
  const [coffee, setCoffee] = useState(false)
  const [kind, setKind] = useState<Kind | null>(null)
  const [text, setText] = useState('')

  const send = async () => {
    const { error } = await supabase.from('feedback').insert({ kind, message: text.trim() })
    if (error) return notify(errMsg(error))
    setKind(null); setText('')
    notify(kind === 'bug' ? 'Merci ! Je vais faire semblant de chercher 🕵️' : 'Merci pour l\'idée ! 🙌')
  }

  return <>
    <SGroup title="Le dev">
      <SRow icon={<IconCoffee size={18} />} color={C.amber} label="Payer un café au dev" onClick={() => setCoffee(true)} />
      <SRow icon={<IconBug size={18} />} color={C.pink} label="Remonter un bug" onClick={() => setKind('bug')} />
      <SRow icon={<IconBulb size={18} />} color={C.violet} label="Proposer une évolution" onClick={() => setKind('idea')} />
    </SGroup>

    {coffee && <Popup onClose={() => setCoffee(false)}>
      <div className="popup-emoji">🤢☕️➡️🍺😄</div>
      <p>Bweerk, c'est dégueu le café ! Tu me paieras une bière à l'occas 🍻😉</p>
      <button className="btn primary wide" onClick={() => setCoffee(false)}>Ça marche 🍺</button>
    </Popup>}
    {kind && <Popup angry={kind === 'bug'} onClose={() => setKind(null)}>
      <h3>{kind === 'bug' ? '😤 ' : '💡 '}{TEXT[kind].title}</h3>
      <p>{TEXT[kind].intro}</p>
      <textarea rows={5} maxLength={2000} placeholder={TEXT[kind].placeholder} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="inline-form">
        <button className="btn" onClick={() => setKind(null)}>Annuler</button>
        <button className="btn primary wide" disabled={!text.trim()} onClick={send}>Envoyer</button>
      </div>
    </Popup>}
  </>
}

/** Réglages, admin seulement : la liste des retours reçus (rien pour les autres) */
export function AdminFeedback() {
  const me = useMe()
  const [items, setItems] = useState<Item[] | null>(null)

  const load = () => supabase.from('feedback').select('id, kind, message, created_at, profiles(display_name)').order('created_at', { ascending: false })
    .then(({ data }) => setItems((data as unknown as Item[]) ?? []))
  useEffect(() => {
    supabase.from('app_admins').select('user_id').eq('user_id', me).maybeSingle().then(({ data }) => { if (data) load() })
  }, [me]) // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (it: Item) => {
    if (!(await ask('Supprimer ce retour ?'))) return
    setItems((xs) => xs && xs.filter((x) => x.id !== it.id))
    const { error } = await supabase.from('feedback').delete().eq('id', it.id)
    if (error) { notify(errMsg(error)); load() }
  }

  if (!items) return null
  return <>
    <SGroup title={`Retours reçus (${items.length})`}>
      {items.length === 0 && <p className="muted small help">Aucun retour pour l'instant.</p>}
      {items.map((it) => (
        <div key={it.id} className="feedback-row">
          <span className="srow-icon small" style={{ background: it.kind === 'bug' ? C.pink : C.violet }}>{it.kind === 'bug' ? <IconBug size={16} /> : <IconBulb size={16} />}</span>
          <div>
            <small className="muted">{it.profiles?.display_name ?? 'Ancien compte'} · {new Date(it.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</small>
            <div className="feedback-msg">{it.message}</div>
          </div>
          <button className="icon-btn" onClick={() => remove(it)} aria-label="Supprimer"><IconClose /></button>
        </div>
      ))}
    </SGroup>
  </>
}
