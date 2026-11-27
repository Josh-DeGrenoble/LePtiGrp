import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { BackButton, goBack } from '../components/BackButton'
import { LimitedInput } from '../components/LimitedInput'
import { ShareChooser } from '../components/ShareChooser'
import { Toggle } from '../components/Sheet'
import { notify } from '../components/Dialog'
import { IconClose } from '../components/Icons'
import { DatePicker, dateLabel } from '../components/DatePicker'
import { supabase, errMsg } from '../lib/supabase'
import { useMe } from '../lib/auth'
import { TOOLS, createTool, type Share, type ToolKind } from '../lib/tools'

/** Création d'un pense-bête, de comptes ou d'un sondage, avec le choix du partage */
export default function NewTool({ kind }: { kind: ToolKind }) {
  const me = useMe()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const st = useLocation().state as { from?: string; root?: string } | null
  const backTo = st?.from ?? `/${kind}`
  const t = TOOLS[kind]
  const [title, setTitle] = useState(params.get('q') ?? '')
  const [share, setShare] = useState<Share>(() => ({ mode: params.get('conv') ? 'conv' : 'me', conv: params.get('conv'), ids: [] }))
  const [options, setOptions] = useState(['', ''])
  const [multiple, setMultiple] = useState(false)
  const [byDates, setByDates] = useState(false)
  const [dates, setDates] = useState<Date[]>([])
  const [busy, setBusy] = useState(false)
  const filled = byDates ? dates.map(dateLabel) : options.map((o) => o.trim()).filter(Boolean)
  const valid = !!title.trim() && (share.mode !== 'conv' || !!share.conv) && (kind !== 'polls' || filled.length >= 2)

  const create = async () => {
    setBusy(true)
    try {
      const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const fields = kind === 'polls' ? { question: title.trim(), options: filled, multiple, ...(byDates && { dates: dates.map(ymd) }) }
        : { name: title.trim() }
      const item = await createTool(kind, fields, share, me)
      // Un sondage de conv apparaît aussi dans le chat, comme un message votable
      if (kind === 'polls' && item.conversation_id) {
        const { error } = await supabase.from('messages').insert({ conversation_id: item.conversation_id, content: `📊 Sondage : ${title.trim()}`, poll_id: item.id })
        if (error) throw error
        return goBack(nav, `/c/${item.conversation_id}`)
      }
      nav(`/${kind}/${item.id}`, { replace: true, state: { from: backTo, root: st?.root } })
    } catch (e) { notify(errMsg(e)) } finally { setBusy(false) }
  }

  const setOption = (i: number, v: string) => {
    const next = options.map((o, j) => (j === i ? v : o))
    // une case vide de plus apparaît dès qu'on remplit la dernière (10 max)
    if (i === next.length - 1 && v && next.length < 31) next.push('')
    setOptions(next)
  }

  return (
    <Screen header={<><BackButton to={backTo} /><h1>{t.newTitle}</h1><span className="icon-btn" /></>} footer={
      <div className="footer-bar"><button className="btn primary wide" disabled={!valid || busy} onClick={create}>Créer</button></div>
    }>
      <div className="card form">
        <LimitedInput placeholder={t.placeholder} value={title} max={kind === 'polls' ? 200 : 40} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      {kind === 'polls' && <>
        <div className="section-title">Réponses</div>
        <div className="segmented share-modes">
          <button className={!byDates ? 'on' : ''} onClick={() => setByDates(false)}>Réponses libres</button>
          {/* pour trouver une date, on peut en général cocher plusieurs jours */}
          <button className={byDates ? 'on' : ''} onClick={() => { setByDates(true); setMultiple(true) }}>Dates</button>
        </div>
        {byDates ? <DatePicker value={dates} onChange={setDates} max={31} /> : <div className="poll-options-edit">
          {options.map((o, i) => (
            <div key={i} className="inline-form">
              <LimitedInput placeholder={`Réponse ${i + 1}`} value={o} max={80} onChange={(e) => setOption(i, e.target.value)} />
              {options.length > 2 && <button className="icon-btn" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label="Retirer"><IconClose /></button>}
            </div>
          ))}
        </div>}
        <Toggle label="Plusieurs réponses possibles" checked={multiple} onChange={setMultiple} />
      </>}
      <div className="section-title">Partagé avec</div>
      <ShareChooser value={share} onChange={setShare} />
    </Screen>
  )
}
