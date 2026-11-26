import { useConvSizes, isCrowd } from '../lib/convSizes'
import { useEffect, useState } from 'react'
import { Avatar } from './Avatar'
import { FriendPicker } from './FriendPicker'
import type { ConvSummary } from '../lib/supabase'
import { cachedConversations, fetchConversations } from '../lib/myConversations'
import type { Share } from '../lib/tools'

const MODES: { mode: Share['mode']; label: string }[] = [{ mode: 'me', label: 'Moi seul' }, { mode: 'conv', label: 'Une conv' }, { mode: 'free', label: 'Libre' }]

/** Avec qui partager un outil : moi seul, les membres d'une conv, ou des amis choisis (filtre par tags) */
export function ShareChooser({ value, onChange }: { value: Share; onChange: (s: Share) => void }) {
  const [convs, setConvs] = useState<ConvSummary[]>(cachedConversations)
  const sizes = useConvSizes()
  useEffect(() => {
    fetchConversations().then((d) => { if (d) setConvs(d) })
  }, [])

  return <>
    <div className="segmented share-modes">
      {MODES.map((m) => <button key={m.mode} className={value.mode === m.mode ? 'on' : ''} onClick={() => onChange({ ...value, mode: m.mode })}>{m.label}</button>)}
    </div>
    {value.mode === 'me' && <p className="muted small share-hint">Visible par toi seul.</p>}
    {value.mode === 'conv' && <div className="list-card fade-in">
      {convs.map((c) => (
        <button key={c.id} className={`settings-row conv-pick${value.conv === c.id ? ' on' : ''}`} onClick={() => onChange({ ...value, conv: c.id })}>
          <Avatar name={c.name ?? '?'} url={c.avatar_url} size={34} group={isCrowd(sizes, c)} /><span>{c.name ?? 'Discussion'}</span>
          <span className="radio" />
        </button>
      ))}
    </div>}
    {value.mode === 'free' && <div className="fade-in"><FriendPicker selected={value.ids} onChange={(ids) => onChange({ ...value, ids })} /></div>}
  </>
}
