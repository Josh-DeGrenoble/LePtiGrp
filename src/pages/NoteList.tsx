import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { BackButton } from '../components/BackButton'
import { HeaderMenu } from '../components/HeaderMenu'
import { LimitedInput } from '../components/LimitedInput'
import { NoteEditor, type EditorActions } from '../components/NoteEditor'
import { QtySheet } from '../components/QtySheet'
import { ask, notify } from '../components/Dialog'
import { IconBack, IconPencil, IconTrash } from '../components/Icons'
import { supabase, errMsg, type List, type ListItem } from '../lib/supabase'
import { readCache, writeCache, useOnResume } from '../lib/network'
import { cachedTools, itemStatus, useGhosts, usePeople } from '../lib/tools'
import { between, sections } from '../lib/notes'
import { useMe } from '../lib/auth'

// Éléments en cache ou venant d'une ancienne version : valeurs par défaut des champs récents
const normalize = (its: ListItem[] | null) => (its ?? []).map((i) => ({
  ...i, list_claims: i.list_claims ?? [], qty_kind: i.qty_kind ?? 'take', level: i.level ?? null, category: i.category ?? null, position: i.position ?? i.id,
}))
const fmt = (n: number) => n.toLocaleString('fr-FR')

/**
 * Un pense-bête. Mode normal : on coche (et on dit combien on prend).
 * Mode « Modifier » : éléments, quantités, catégories et tri par glisser-déposer.
 */
export default function NoteList() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const me = useMe()
  const backTo = (useLocation().state as { from?: string } | null)?.from ?? '/notes'
  const [list, setList] = useState<List | null>(() => {
    const c = cachedTools('notes').find((l) => l.id === id)
    return c ? { ...c, name: c.title } : null
  })
  const [items, setItems] = useState<ListItem[]>(() => normalize(readCache<ListItem[]>(`items:${id}`, [])))
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [qtyFor, setQtyFor] = useState<ListItem | null>(null)
  const [collapsed, setCollapsed] = useState<string[]>(() => readCache<string[]>(`collapsed:${id}`, []))
  const people = usePeople(list)
  const ghosts = useGhosts(people, items.flatMap((i) => i.list_claims.map((c) => c.user_id)))
  const nameOf = new Map([...people, ...ghosts].map((p) => [p.id, p.id === me ? 'Moi' : p.display_name]))

  const load = async () => {
    const [{ data: l }, { data: its, error }] = await Promise.all([
      supabase.from('lists').select('*').eq('id', id).maybeSingle(),
      supabase.from('list_items').select('*, list_claims(*)').eq('list_id', id),
    ])
    if (!l) { if (navigator.onLine) setMissing(true); return }
    setList(l)
    if (error) return notify(errMsg(error))
    setItems(normalize(its)); writeCache(`items:${id}`, its ?? [])
    if (!its?.length) setEditing(true)  // liste vide : on commence par la remplir
  }
  useOnResume(load)
  useEffect(() => {
    load()
    // les autres membres voient les changements en direct
    const ch = supabase.channel(`list-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items', filter: `list_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_claims' }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lists', filter: `id=eq.${id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Toute modification s'affiche tout de suite, puis part au serveur (rechargement si refus)
  const run = async (q: PromiseLike<{ error: unknown }>) => { const { error } = await q; if (error) { notify(errMsg(error)); load() } }
  const updateItem = (item: ListItem, changes: Partial<ListItem>) => {
    setItems((its) => its.map((i) => (i.id === item.id ? { ...i, ...changes } : i)))
    return run(supabase.from('list_items').update(changes).eq('id', item.id))
  }
  const setCategories = (categories: string[]) => {
    setList((l) => l && { ...l, categories })
    return run(supabase.from('lists').update({ categories }).eq('id', id))
  }
  const cats = () => sections(list, items).slice(1).map((s) => s.cat!)

  const act: EditorActions = {
    update: updateItem,
    add: async (content, cat) => {
      const last = sections(list, items).find((s) => s.cat === cat)?.items.at(-1)
      const { data, error } = await supabase.from('list_items').insert({ list_id: id, content, category: cat, position: between(last) }).select('*, list_claims(*)').single()
      if (error) return notify(errMsg(error))
      setItems((its) => (its.some((i) => i.id === data.id) ? its : [...its, ...normalize([data])]))
    },
    remove: (item) => {
      setItems((its) => its.filter((i) => i.id !== item.id))
      run(supabase.from('list_items').delete().eq('id', item.id))
    },
    qty: setQtyFor,
    addCategory: (name) => { if (!cats().includes(name)) setCategories([...cats(), name]) },
    renameCategory: async (from, to) => {
      if (cats().includes(to)) return notify('Cette catégorie existe déjà.')
      setItems((its) => its.map((i) => (i.category === from ? { ...i, category: to } : i)))
      await run(supabase.from('list_items').update({ category: to }).eq('list_id', id).eq('category', from))
      setCategories(cats().map((c) => (c === from ? to : c)))
    },
    removeCategory: async (cat) => {
      const n = items.filter((i) => i.category === cat).length
      if (n && !(await ask(`Supprimer la catégorie « ${cat} » ? Ses ${n} élément${n > 1 ? 's' : ''} passeront dans « Sans catégorie ».`))) return
      setItems((its) => its.map((i) => (i.category === cat ? { ...i, category: null } : i)))
      await run(supabase.from('list_items').update({ category: null }).eq('list_id', id).eq('category', cat))
      setCategories(cats().filter((c) => c !== cat))
    },
  }

  // ---- Mode normal : cocher
  const setClaims = (item: ListItem, claims: ListItem['list_claims']) =>
    setItems((its) => its.map((i) => (i.id === item.id ? { ...i, list_claims: claims } : i)))
  // Je coche : je prends ce qui reste (modifiable) ; je décoche : je retire ma prise
  const toggleClaim = (item: ListItem) => {
    const mine = item.list_claims.some((c) => c.user_id === me)
    const others = item.list_claims.filter((c) => c.user_id !== me)
    const { left } = itemStatus(item.quantity, others, item.qty_kind)
    const qty = left ? left : null
    setClaims(item, mine ? others : [...others, { item_id: item.id, user_id: me, qty }])
    run(mine
      ? supabase.from('list_claims').delete().eq('item_id', item.id).eq('user_id', me)
      : supabase.from('list_claims').insert({ item_id: item.id, qty }))
  }
  const setMyQty = (item: ListItem, raw: string) => {
    const n = parseFloat(raw.replace(',', '.'))
    const qty = n > 0 ? n : null
    if (qty === item.list_claims.find((c) => c.user_id === me)?.qty) return
    setClaims(item, item.list_claims.map((c) => (c.user_id === me ? { ...c, qty } : c)))
    run(supabase.from('list_claims').update({ qty }).eq('item_id', item.id).eq('user_id', me))
  }
  const toggleSection = (key: string) => {
    const next = collapsed.includes(key) ? collapsed.filter((k) => k !== key) : [...collapsed, key]
    setCollapsed(next); writeCache(`collapsed:${id}`, next)
  }

  const rename = async (name: string) => {
    if (!list || !name.trim() || name.trim() === list.name) return
    setList({ ...list, name: name.trim() })
    run(supabase.from('lists').update({ name: name.trim() }).eq('id', id))
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

  const row = (i: ListItem) => {
    const st = itemStatus(i.quantity, i.list_claims, i.qty_kind)
    const mine = i.list_claims.find((c) => c.user_id === me)
    const take = i.qty_kind !== 'left'
    return (
      <div key={i.id} className={`note-item${st.done ? ' checked' : ''}`}>
        <label className="note-check">
          <input type="checkbox" checked={!!mine} onChange={() => toggleClaim(i)} />
          <span className="note-text">{i.content}</span>
          {take && i.quantity && <span className="qty-tag">{i.quantity}</span>}
          {!take && i.level !== null && <span className="level-tag" title="Restant"><span style={{ width: `${i.level}%` }} />{i.level} %</span>}
        </label>
        {i.list_claims.length > 0 && <div className="claims">
          {i.list_claims.map((c) => c.user_id === me && take
            ? <label key={c.user_id} className="claim mine">Moi ×
                <input inputMode="decimal" placeholder="?" defaultValue={c.qty ?? ''} key={c.qty ?? ''} aria-label="Combien j'en prends"
                  onBlur={(e) => setMyQty(i, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} /></label>
            : <span key={c.user_id} className={`claim${c.user_id === me ? ' mine' : ''}`}>{nameOf.get(c.user_id) ?? '?'}{c.qty !== null && take && ` × ${fmt(Number(c.qty))}`}</span>)}
          {st.want !== null && <span className={`claim-status${st.done ? ' ok' : ''}`}>
            {st.done ? `${fmt(st.got || st.want)}/${fmt(st.want)} ✓` : `reste ${fmt(st.left!)}`}
          </span>}
        </div>}
      </div>
    )
  }
  const secs = sections(list, items).filter((s) => s.items.length)
  const hasCats = secs.some((s) => s.cat !== null)

  return (
    <Screen header={<>
      <BackButton to={backTo} />
      <div className="chat-title">
        {editing
          ? <LimitedInput max={40} className="title-input" defaultValue={list?.name} key={list?.name} aria-label="Nom du pense-bête"
              onBlur={(e) => rename(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          : <span className="title-edit"><span>{list?.name ?? '…'}</span></span>}
      </div>
      <button className={`edit-toggle${editing ? ' on' : ''}`} onClick={() => setEditing(!editing)}>
        {editing ? 'OK' : <><IconPencil size={14} /> Modifier</>}
      </button>
      <HeaderMenu convId={list?.conversation_id ?? undefined} />
    </>}>
      {editing ? <>
        <NoteEditor list={list} items={items} act={act} />
        {list && <button className="settings-row danger note-delete" onClick={destroy}><IconTrash /><span>Supprimer le pense-bête</span></button>}
      </> : <>
        {items.length === 0 && <p className="empty">Rien pour l'instant. Touche « Modifier » pour ajouter des éléments.</p>}
        {secs.map((s) => {
          const key = s.cat ?? ''
          const done = s.items.filter((i) => itemStatus(i.quantity, i.list_claims, i.qty_kind).done)
          const open = !collapsed.includes(key)
          // dans chaque catégorie, ce qui est déjà pris passe en bas
          const ordered = [...s.items.filter((i) => !done.includes(i)), ...done]
          return <div key={key} className="note-section">
            {hasCats && <button className={`note-cat${open ? ' open' : ''}`} onClick={() => toggleSection(key)}>
              <IconBack size={16} /><span>{s.cat ?? 'Sans catégorie'}</span><small>{done.length}/{s.items.length}</small>
            </button>}
            <div className={`fold${open ? '' : ' out'}`}><div className="fold-in note-items">{ordered.map(row)}</div></div>
          </div>
        })}
      </>}
      {qtyFor && <QtySheet item={qtyFor} onClose={() => setQtyFor(null)} onSave={(q) => { updateItem(qtyFor, q); setQtyFor(null) }} />}
    </Screen>
  )
}
