import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { BackButton } from '../components/BackButton'
import { HeaderMenu } from '../components/HeaderMenu'
import { LimitedInput } from '../components/LimitedInput'
import { Sheet } from '../components/Sheet'
import { Avatar } from '../components/Avatar'
import { ask, notify } from '../components/Dialog'
import { IconClose, IconTrash } from '../components/Icons'
import { supabase, errMsg, type Expense, type Ledger } from '../lib/supabase'
import { readCache, writeCache, useOnResume } from '../lib/network'
import { useMe } from '../lib/auth'
import { cachedTools, euro, usePeople } from '../lib/tools'

/** Soldes en centimes : ce que chacun a payé moins sa part */
function balances(expenses: Expense[]) {
  const b = new Map<string, number>()
  const add = (id: string, c: number) => b.set(id, (b.get(id) ?? 0) + c)
  for (const e of expenses) {
    const cents = Math.round(Number(e.amount) * 100)
    add(e.paid_by, cents)
    const part = Math.floor(cents / e.split.length)
    e.split.forEach((id, i) => add(id, -(part + (i < cents % e.split.length ? 1 : 0))))
  }
  return b
}

/** Remboursements simplifiés : le plus gros débiteur rembourse le plus gros créancier, et ainsi de suite */
function settle(b: Map<string, number>) {
  const debt = [...b].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v })).sort((x, y) => y.v - x.v)
  const cred = [...b].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v })).sort((x, y) => y.v - x.v)
  const out: { from: string; to: string; cents: number }[] = []
  for (let i = 0, j = 0; i < debt.length && j < cred.length;) {
    const c = Math.min(debt[i].v, cred[j].v)
    out.push({ from: debt[i].id, to: cred[j].id, cents: c })
    debt[i].v -= c; cred[j].v -= c
    if (!debt[i].v) i++
    if (!cred[j].v) j++
  }
  return out
}

/** Des comptes : dépenses, soldes et qui doit combien à qui */
export default function LedgerPage() {
  const { id = '' } = useParams()
  const me = useMe()
  const nav = useNavigate()
  const backTo = (useLocation().state as { from?: string } | null)?.from ?? '/accounts'
  const [ledger, setLedger] = useState<Ledger | null>(() => {
    const c = cachedTools('accounts').find((l) => l.id === id)
    return c ? { ...c, name: c.title } : null
  })
  const [expenses, setExpenses] = useState<Expense[]>(() => readCache<Expense[]>(`expenses:${id}`, []))
  const [missing, setMissing] = useState(false)
  // dépense ouverte dans la fenêtre : 'new' pour en ajouter une
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const people = usePeople(ledger)
  const nameOf = (uid: string) => (uid === me ? 'Moi' : people.find((p) => p.id === uid)?.display_name ?? '?')

  const load = async () => {
    const [{ data: l }, { data: ex }] = await Promise.all([
      supabase.from('ledgers').select('*').eq('id', id).maybeSingle(),
      supabase.from('expenses').select('*').eq('ledger_id', id).order('spent_at', { ascending: false }),
    ])
    if (!l) { if (navigator.onLine) setMissing(true); return }
    setLedger(l); setExpenses(ex ?? []); writeCache(`expenses:${id}`, ex ?? [])
  }
  useOnResume(load)
  useEffect(() => {
    load()
    const ch = supabase.channel(`ledger-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `ledger_id=eq.${id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (e: Expense) => {
    if (!(await ask(`Supprimer la dépense « ${e.label} » ?`))) return
    setExpenses((xs) => xs.filter((x) => x.id !== e.id))
    const { error } = await supabase.from('expenses').delete().eq('id', e.id)
    if (error) { notify(errMsg(error)); load() }
  }
  const destroy = async () => {
    if (!ledger || !(await ask(`Supprimer les comptes « ${ledger.name} » et toutes leurs dépenses ?`))) return
    const { error } = await supabase.from('ledgers').delete().eq('id', id)
    if (error) return notify(errMsg(error))
    nav(backTo, { replace: true })
  }

  if (missing) return <Screen header={<><BackButton to={backTo} /><h1>Introuvable</h1><span className="icon-btn" /></>}>
    <p className="empty">Ces comptes n'existent plus ou tu n'y as plus accès.</p>
  </Screen>

  const bal = balances(expenses)
  const transfers = settle(bal)
  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <Screen header={<><BackButton to={backTo} /><h1>{ledger?.name ?? '…'}</h1><HeaderMenu convId={ledger?.conversation_id ?? undefined} /></>}
      footer={<div className="footer-bar"><button className="btn primary wide" onClick={() => setEditing('new')} disabled={!people.length}>Ajouter une dépense</button></div>}>
      <div className="card ledger-summary">
        <div className="ledger-total"><small>Total</small><b>{euro(total)}</b></div>
        {people.map((p) => {
          const v = (bal.get(p.id) ?? 0) / 100
          return (
            <div key={p.id} className="ledger-person">
              <Avatar name={p.display_name} url={p.avatar_url} size={28} /><span>{nameOf(p.id)}</span>
              <b className={v > 0 ? 'pos' : v < 0 ? 'neg' : ''}>{v > 0 ? '+' : ''}{euro(v)}</b>
            </div>
          )
        })}
      </div>

      <div className="section-title">Qui doit combien à qui</div>
      {transfers.length === 0
        ? <p className="muted small share-hint">{expenses.length ? 'Tout le monde est quitte 🎉' : 'Ajoute une première dépense.'}</p>
        : <div className="list-card">{transfers.map((t, i) => (
          <div key={i} className={`settings-row transfer${t.from === me || t.to === me ? ' mine' : ''}`}>
            <span><b>{nameOf(t.from)}</b> doit <b>{euro(t.cents / 100)}</b> à <b>{nameOf(t.to)}</b></span>
          </div>
        ))}</div>}

      {expenses.length > 0 && <>
        <div className="section-title">Dépenses</div>
        <div className="list-card">
          {expenses.map((e) => (
            <div key={e.id} className="settings-row expense">
              <div className="expense-main" onClick={() => setEditing(e)}>
                <div className="expense-label">{e.label}</div>
                <small>{nameOf(e.paid_by)} a payé · {e.split.length === people.length ? 'pour tous' : `pour ${e.split.map(nameOf).join(', ')}`} · {when(e.spent_at ?? e.created_at)}</small>
              </div>
              <b>{euro(Number(e.amount))}</b>
              <button className="icon-btn" onClick={() => remove(e)} aria-label="Supprimer"><IconClose /></button>
            </div>
          ))}
        </div>
      </>}
      {ledger && <button className="settings-row danger note-delete" onClick={destroy}><IconTrash /><span>Supprimer les comptes</span></button>}

      {editing && <ExpenseSheet expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} ledgerId={id}
        people={people.map((p) => ({ id: p.id, name: nameOf(p.id) }))} me={me}
        onSaved={(e) => setExpenses((xs) => [e, ...xs.filter((x) => x.id !== e.id)].sort((a, b) => (b.spent_at ?? b.created_at).localeCompare(a.spent_at ?? a.created_at)))} />}
    </Screen>
  )
}

const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
// valeur d'un champ datetime-local à l'heure locale
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60e3).toISOString().slice(0, 16)

/** Ajout ou modification d'une dépense */
function ExpenseSheet({ expense, onClose, ledgerId, people, me, onSaved }: {
  expense: Expense | null; onClose: () => void; ledgerId: string; people: { id: string; name: string }[]; me: string; onSaved: (e: Expense) => void
}) {
  const [label, setLabel] = useState(expense?.label ?? '')
  const [amount, setAmount] = useState(expense ? String(expense.amount).replace('.', ',') : '')
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? me)
  const [split, setSplit] = useState<string[] | null>(expense?.split ?? null)  // null = tout le monde
  const [at, setAt] = useState(() => localInput(expense ? new Date(expense.spent_at ?? expense.created_at) : new Date()))
  const forWhom = split ?? people.map((p) => p.id)
  const value = Number(amount.replace(',', '.'))
  const valid = !!label.trim() && value > 0 && forWhom.length > 0 && !!at

  const toggle = (id: string) => setSplit(forWhom.includes(id) ? forWhom.filter((x) => x !== id) : [...forWhom, id])
  const save = async () => {
    const fields = { label: label.trim(), amount: Math.round(value * 100) / 100, paid_by: paidBy, split: forWhom, spent_at: new Date(at).toISOString() }
    const { data, error } = expense
      ? await supabase.from('expenses').update(fields).eq('id', expense.id).select().single()
      : await supabase.from('expenses').insert({ ledger_id: ledgerId, ...fields }).select().single()
    if (error) return notify(errMsg(error))
    onSaved(data); onClose()
  }

  return (
    <Sheet open onClose={onClose} title={expense ? 'Modifier la dépense' : 'Nouvelle dépense'}>
      <div className="inline-form">
        <LimitedInput max={60} placeholder="Quoi ? (ex. : Courses)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="amount-input" inputMode="decimal" placeholder="0,00 €" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Montant" />
      </div>
      <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Date et heure" />
      <div className="sheet-section">Payé par</div>
      <div className="chip-row">
        {people.map((p) => <button key={p.id} className={`chip quick${paidBy === p.id ? ' on' : ''}`} onClick={() => setPaidBy(p.id)}>{p.name}</button>)}
      </div>
      <div className="sheet-section">Pour qui {value > 0 && forWhom.length > 0 && <span className="muted">· {euro(value / forWhom.length)} chacun</span>}</div>
      <div className="chip-row">
        {people.map((p) => <button key={p.id} className={`chip quick${forWhom.includes(p.id) ? ' on' : ''}`} onClick={() => toggle(p.id)}>{p.name}</button>)}
      </div>
      <button className="btn primary wide" disabled={!valid} onClick={save}>{expense ? 'Enregistrer' : 'Ajouter'}</button>
    </Sheet>
  )
}
