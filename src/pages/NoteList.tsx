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
import { cachedTools, usePeople } from '../lib/tools'
import { useMe } from '../lib/auth'

/** Un pense-bête : ajouter, cocher (avec quantité facultative), supprimer des éléments */
export default function NoteList() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const backTo = (useLocation().state as { from?: string } | null)?.from ?? '/notes'
  const [list, setList] = useState<List | null>(() => {
    const c = cachedTools('notes').find((l) => l.id === id)
    return c ? { ...c, name: c.title } : null
  })
  const [items, setItems] = useState<ListItem[]>(() => readCache<ListItem[]>(`items:${id}`, []))
  const [missing, setMissing] = useState(false)
  const [text, setText] = useState('')
  const [renaming, setRenaming] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const me = useMe()
  // Plusieurs personnes sur la liste : on affiche qui a coché quoi
  const people = usePeople(list)
  const nameOf = new Map(people.map((p) => [p.id, p.id === me ? 'moi' : p.display_name]))

  const load = async () => {
    const [{ data: l }, { data: its }] = await Promise.all([
      supabase.from('lists').select('*').eq('id', id).maybeSingle(),
      supabase.from('list_items').select('*').eq('list_id', id).order('created_at'),
    ])
    if (!l) { if (navigator.onLine) setMissing(true); return }
    setList(l); setItems(its ?? []); writeCache(`items:${id}`, its ?? [])
  }
  useOnResume(load)
  useEffect(() => {
    load()
    // les autres membres voient les changements en direct
    const ch = supabase.channel(`list-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items', filter: `list_id=eq.${id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id])

  // Modifications appliquées tout de suite à l'écran, puis envoyées
  const patch = async (item: ListItem, changes: Partial<ListItem>) => {
    setItems((its) => its.map((i) => (i.id === item.id ? { ...i, ...changes } : i)))
    const { error } = await supabase.from('list_items').update(changes).eq('id', item.id)
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
    setItems((its) => (its.some((i) => i.id === data.id) ? its : [...its, data]))
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

  const todo = items.filter((i) => !i.checked)
  const done = items.filter((i) => i.checked)
  const row = (i: ListItem) => (
    <div key={i.id} className={`note-item${i.checked ? ' checked' : ''}`}>
      <label className="note-check">
        <input type="checkbox" checked={i.checked} onChange={(e) => patch(i, { checked: e.target.checked, checked_by: e.target.checked ? me : null })} />
        <span><span className="note-text">{i.content}</span>{i.checked && i.checked_by && people.length > 1 && <small className="checked-by">✓ {nameOf.get(i.checked_by) ?? '?'}</small>}</span>
      </label>
      <input className="note-qty" placeholder="Qté" defaultValue={i.quantity ?? ''} maxLength={20} aria-label="Quantité"
        onBlur={(e) => { const q = e.target.value.trim() || null; if (q !== i.quantity) patch(i, { quantity: q }) }} />
      <button className="icon-btn" onClick={() => remove(i)} aria-label="Supprimer"><IconClose /></button>
    </div>
  )

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
      {done.length > 0 && <>
        <div className="section-title">Coché ({done.length})</div>
        <div className="note-items">{done.map(row)}</div>
      </>}
      {list && <button className="settings-row danger note-delete" onClick={destroy}><IconTrash /><span>Supprimer le pense-bête</span></button>}
    </Screen>
  )
}
