import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { BackButton } from '../components/BackButton'
import { HeaderMenu } from '../components/HeaderMenu'
import { LimitedInput } from '../components/LimitedInput'
import { ask, notify } from '../components/Dialog'
import { IconClose, IconPencil, IconPlus, IconTrash } from '../components/Icons'
import { supabase, errMsg, type List, type ListItem } from '../lib/supabase'
import { readCache, writeCache, useOnResume } from '../lib/network'
import { cachedTools, itemStatus, usePeople } from '../lib/tools'
import { useMe } from '../lib/auth'

// Éléments en cache ou venant d'une ancienne version : toujours une liste de prises
const normalize = (its: ListItem[] | null) => (its ?? []).map((i) => ({ ...i, list_claims: i.list_claims ?? [] }))

/** Un pense-bête : ajouter des éléments (quantité facultative), chacun coche ce qu'il prend et combien */
export default function NoteList() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const backTo = (useLocation().state as { from?: string } | null)?.from ?? '/notes'
  const [list, setList] = useState<List | null>(() => {
    const c = cachedTools('notes').find((l) => l.id === id)
    return c ? { ...c, name: c.title } : null
  })
  const [items, setItems] = useState<ListItem[]>(() => normalize(readCache<ListItem[]>(`items:${id}`, [])))
  const [missing, setMissing] = useState(false)
  const [text, setText] = useState('')
  const [renaming, setRenaming] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const me = useMe()
  const people = usePeople(list)
  const nameOf = new Map(people.map((p) => [p.id, p.id === me ? 'Moi' : p.display_name]))

  const load = async () => {
    const [{ data: l }, { data: its, error }] = await Promise.all([
      supabase.from('lists').select('*').eq('id', id).maybeSingle(),
      supabase.from('list_items').select('*, list_claims(*)').eq('list_id', id).order('created_at'),
    ])
    if (!l) { if (navigator.onLine) setMissing(true); return }
    setList(l)
    if (error) return notify(errMsg(error))
    setItems(normalize(its)); writeCache(`items:${id}`, its ?? [])
  }
  useOnResume(load)
  useEffect(() => {
    load()
    // les autres membres voient les changements en direct
    const ch = supabase.channel(`list-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items', filter: `list_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_claims' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id])

  // Modifications appliquées tout de suite à l'écran, puis envoyées
  const patch = async (item: ListItem, changes: Pick<Partial<ListItem>, 'quantity'>) => {
    setItems((its) => its.map((i) => (i.id === item.id ? { ...i, ...changes } : i)))
    const { error } = await supabase.from('list_items').update(changes).eq('id', item.id)
    if (error) { notify(errMsg(error)); load() }
  }
  const setClaims = (item: ListItem, claims: ListItem['list_claims']) =>
    setItems((its) => its.map((i) => (i.id === item.id ? { ...i, list_claims: claims } : i)))
  // Je coche : je prends ce qui reste (modifiable) ; je décoche : je retire ma prise
  const toggleClaim = async (item: ListItem) => {
    const mine = item.list_claims.some((c) => c.user_id === me)
    const others = item.list_claims.filter((c) => c.user_id !== me)
    const { left } = itemStatus(item.quantity, others)
    const qty = left ? left : null
    setClaims(item, mine ? others : [...others, { item_id: item.id, user_id: me, qty }])
    const { error } = mine
      ? await supabase.from('list_claims').delete().eq('item_id', item.id).eq('user_id', me)
      : await supabase.from('list_claims').insert({ item_id: item.id, qty })
    if (error) { notify(errMsg(error)); load() }
  }
  const setMyQty = async (item: ListItem, raw: string) => {
    const n = parseFloat(raw.replace(',', '.'))
    const qty = n > 0 ? n : null
    if (qty === item.list_claims.find((c) => c.user_id === me)?.qty) return
    setClaims(item, item.list_claims.map((c) => (c.user_id === me ? { ...c, qty } : c)))
    const { error } = await supabase.from('list_claims').update({ qty }).eq('item_id', item.id).eq('user_id', me)
    if (error) { notify(errMsg(error)); load() }
  }
  const remove = async (item: ListItem) => {
    setItems((its) => its.filter((i) => i.id !== item.id))
    const { error } = await supabase.from('list_items').delete().eq('id', item.id)
    if (error) { notify(errMsg(error)); load() }
  }
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = text.trim()
    if (!content) return
    setText('')
    input.current?.focus()
    const { data, error } = await supabase.from('list_items').insert({ list_id: id, content }).select().single()
    if (error) return notify(errMsg(error))
    setItems((its) => (its.some((i) => i.id === data.id) ? its : [...its, { ...data, list_claims: [] }]))
  }
  const rename = async (name: string) => {
    setRenaming(false)
    if (!list || !name.trim() || name.trim() === list.name) return
    setList({ ...list, name: name.trim() })
    const { error } = await supabase.from('lists').update({ name: name.trim() }).eq('id', id)
    if (error) notify(errMsg(error))
  }
  const destroy = async () => {
    if (!list || !(await ask(`Supprimer le pense-bête « ${list.name} » et tout son contenu ?`))) return
    const { error } = await supabase.from('lists').delete().eq('id', id)
    if (error) return notify(errMsg(error))
    nav(backTo, { replace: true })
  }

  if (missing) return <Screen header={<><BackButton to={backTo} /><h1>Introuvable</h1><span className="icon-btn" /></>}>
    <p className="empty">Ce pense-bête n'existe plus ou tu n'y as plus accès.</p>
  </Screen>

  const done = (i: ListItem) => itemStatus(i.quantity, i.list_claims).done
  const todo = items.filter((i) => !done(i))
  const finished = items.filter(done)
  const fmt = (n: number) => n.toLocaleString('fr-FR')
  const row = (i: ListItem) => {
    const st = itemStatus(i.quantity, i.list_claims)
    const mine = i.list_claims.find((c) => c.user_id === me)
    return (
      <div key={i.id} className={`note-item${st.done ? ' checked' : ''}`}>
        <div className="note-line">
          <label className="note-check">
            <input type="checkbox" checked={!!mine} onChange={() => toggleClaim(i)} />
            <span className="note-text">{i.content}</span>
          </label>
          <input className="note-qty" placeholder="Qté" defaultValue={i.quantity ?? ''} maxLength={20} aria-label="Quantité demandée"
            onBlur={(e) => { const q = e.target.value.trim() || null; if (q !== i.quantity) patch(i, { quantity: q }) }} />
          <button className="icon-btn" onClick={() => remove(i)} aria-label="Supprimer"><IconClose /></button>
        </div>
        {i.list_claims.length > 0 && <div className="claims">
          {i.list_claims.map((c) => c.user_id === me
            ? <label key={c.user_id} className="claim mine">Moi ×
                <input inputMode="decimal" placeholder="?" defaultValue={c.qty ?? ''} key={c.qty ?? ''} aria-label="Combien j'en prends"
                  onBlur={(e) => setMyQty(i, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} /></label>
            : <span key={c.user_id} className="claim">{nameOf.get(c.user_id) ?? '?'}{c.qty !== null && ` × ${fmt(Number(c.qty))}`}</span>)}
          {st.want !== null && <span className={`claim-status${st.done ? ' ok' : ''}`}>
            {st.done ? `${fmt(st.got || st.want)}/${fmt(st.want)} ✓` : `reste ${fmt(st.left!)}`}
          </span>}
        </div>}
      </div>
    )
  }

  return (
    <Screen header={<>
      <BackButton to={backTo} />
      <div className="chat-title">
        {renaming
          ? <LimitedInput max={40} className="title-input" autoFocus defaultValue={list?.name}
              onBlur={(e) => rename(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false) }} />
          : <button className="title-edit" onClick={() => setRenaming(true)} aria-label="Renommer"><span>{list?.name ?? '…'}</span><IconPencil /></button>}
      </div>
      <HeaderMenu convId={list?.conversation_id ?? undefined} />
    </>} footer={
      <form className="composer-wrap composer" onSubmit={add}>
        <LimitedInput ref={input} max={100} placeholder="Ajouter un élément…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="send" disabled={!text.trim()} aria-label="Ajouter" onPointerDown={(e) => e.preventDefault()}><IconPlus size={22} /></button>
      </form>
    }>
      {items.length === 0 && <p className="empty">Rien pour l'instant. Ajoute un premier élément en bas.</p>}
      <div className="note-items">{todo.map(row)}</div>
      {finished.length > 0 && <>
        <div className="section-title">Pris en charge ({finished.length})</div>
        <div className="note-items">{finished.map(row)}</div>
      </>}
      {list && <button className="settings-row danger note-delete" onClick={destroy}><IconTrash /><span>Supprimer le pense-bête</span></button>}
    </Screen>
  )
}
