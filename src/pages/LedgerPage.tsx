import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { BackButton, goBack, toolBack } from '../components/BackButton'
import { HeaderMenu } from '../components/HeaderMenu'
import { LimitedInput } from '../components/LimitedInput'
import { Sheet } from '../components/Sheet'
import { Avatar } from '../components/Avatar'
import { ask, notify } from '../components/Dialog'
import { IconClose, IconTrash } from '../components/Icons'
import { supabase, errMsg, type Expense, type Ledger } from '../lib/supabase'
import { readCache, writeCache, useOnResume, useOnline } from '../lib/network'
import { dbWrite, flushWrites, tempId } from '../lib/offlineDb'
import { useMe } from '../lib/auth'
import { OfflineLocked } from '../components/OfflineLocked'
import { isShared } from '../lib/tools'
import { cachedTools, euro, useGhosts, usePeople, forgetTool } from '../lib/tools'

/** Dates où une dépense a eu lieu jusqu'à maintenant (une seule, ou chaque semaine / mois / an jusqu'à son arrêt) */
export function occurrences(e: Expense): Date[] {
  const start = new Date(e.spent_at ?? e.created_at)
  if (!e.repeat) return [start]
  const end = Math.min(Date.now(), e.repeat_until ? Date.parse(e.repeat_until) : Infinity)
  const out: Date[] = []
  for (let k = 0; k < 600; k++) {
    const d = new Date(start)
    if (e.repeat === 'week') d.setDate(d.getDate() + 7 * k)
    else {
      // 31 janv. + 1 mois = 28/29 févr. (pas 3 mars) ; 29 févr. + 1 an = 28 févr.
      const months = e.repeat === 'month' ? k : 12 * k
      d.setDate(1); d.setMonth(d.getMonth() + months)
      d.setDate(Math.min(start.getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
    }
    if (+d > end) break
    out.push(d)
  }
  return out
}

/** Soldes en centimes : ce que chacun a payé moins sa part (une dépense récurrente compte autant de fois qu'elle a eu lieu) */
function balances(expenses: Expense[]) {
  const b = new Map<string, number>()
  const add = (id: string, c: number) => b.set(id, (b.get(id) ?? 0) + c)
  for (const e of expenses) {
    const times = occurrences(e).length
    const cents = Math.round(Number(e.amount) * 100)
    add(e.paid_by, cents * times)
    const part = Math.floor(cents / e.split.length)
    e.split.forEach((id, i) => add(id, -(part + (i < cents % e.split.length ? 1 : 0)) * times))
  }
  return b
}

const REPEAT_LABEL = { week: 'chaque semaine', month: 'chaque mois', year: 'chaque année' } as const
type Period = 'all' | 'month' | 'last' | 'year'
const PERIODS: [Period, string][] = [['all', 'Tout'], ['month', 'Ce mois-ci'], ['last', 'Le mois dernier'], ['year', 'Cette année']]
function inPeriod(d: Date, p: Period) {
  const n = new Date()
  if (p === 'all') return true
  if (p === 'year') return d.getFullYear() === n.getFullYear()
  const m = p === 'month' ? n : new Date(n.getFullYear(), n.getMonth() - 1, 1)
  return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth()
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
  const from = (useLocation().state as { from?: string } | null)?.from
  const [ledger, setLedger] = useState<Ledger | null>(() => {
    const c = cachedTools('accounts').find((l) => l.id === id)
    return c ? { ...c, name: c.title } : null
  })
  const backTo = toolBack(from, ledger?.conversation_id)
  const [expenses, setExpenses] = useState<Expense[]>(() => readCache<Expense[]>(`expenses:${id}`, []))
  const [missing, setMissing] = useState(false)
  const online = useOnline()
  // dépense ouverte dans la fenêtre : 'new' pour en ajouter une
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [filter, setFilter] = useState<{ period: Period; payer: string | null; concerned: string | null }>({ period: 'all', payer: null, concerned: null })
  const [filtering, setFiltering] = useState(false)
  const people = usePeople(ledger)
  const ghosts = useGhosts(people, expenses.flatMap((e) => [e.paid_by, ...e.split]))
  const everyone = [...people, ...ghosts]
  const nameOf = (uid: string) => (uid === me ? 'Moi' : everyone.find((p) => p.id === uid)?.display_name ?? '?')

  const load = async () => {
    await flushWrites()
    const [{ data: l }, { data: ex }] = await Promise.all([
      supabase.from('ledgers').select('*').eq('id', id).maybeSingle(),
      supabase.from('expenses').select('*').eq('ledger_id', id).order('spent_at', { ascending: false }),
    ])
    if (!l) { if (navigator.onLine) setMissing(true); return }
    setLedger(l); setExpenses(ex ?? []); writeCache(`expenses:${id}`, ex ?? [])
  }
  useOnResume(load)
  useEffect(() => { writeCache(`expenses:${id}`, expenses) }, [id, expenses])
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
    const { error } = await dbWrite({ table: 'expenses', op: 'delete', match: { id: e.id } })
    if (error) { notify(errMsg(error)); load() }
  }
  const destroy = async () => {
    if (!ledger || !(await ask(`Supprimer les comptes « ${ledger.name} » et toutes leurs dépenses ?`))) return
    const { error } = await dbWrite({ table: 'ledgers', op: 'delete', match: { id } })
    if (error) return notify(errMsg(error))
    forgetTool('accounts', id)
    goBack(nav, backTo)
  }

  if (!online && ledger && isShared(ledger)) return <Screen header={<><BackButton to={backTo} /><h1>Comptes</h1><span className="icon-btn" /></>}><OfflineLocked /></Screen>
  if (missing) return <Screen header={<><BackButton to={backTo} /><h1>Introuvable</h1><span className="icon-btn" /></>}>
    <p className="empty">Ces comptes n'existent plus ou tu n'y as plus accès.</p>
  </Screen>

  const bal = balances(expenses)
  const transfers = settle(bal)
  const total = expenses.reduce((s, e) => s + Number(e.amount) * occurrences(e).length, 0)
  // filtre de la liste des dépenses (les soldes restent ceux de tout le compte)
  const filtered = filter.period === 'all' && !filter.payer && !filter.concerned
  const shown = expenses.map((e) => ({ e, n: occurrences(e).filter((d) => inPeriod(d, filter.period)).length }))
    .filter(({ e, n }) => n > 0 && (!filter.payer || e.paid_by === filter.payer) && (!filter.concerned || e.split.includes(filter.concerned)))
  const shownTotal = shown.reduce((s, { e, n }) => s + Number(e.amount) * n, 0)
  // moi en premier dans les choix du filtre
  const choices = [...everyone].sort((a, b) => Number(b.id === me) - Number(a.id === me))

  return (
    <Screen header={<><BackButton to={backTo} /><h1>{ledger?.name ?? '…'}</h1><HeaderMenu convId={ledger?.conversation_id ?? undefined} /></>}
      footer={<div className="footer-bar"><button className="btn primary wide" onClick={() => setEditing('new')} disabled={!people.length}>Ajouter une dépense</button></div>}>
      <div className="card ledger-summary">
        <div className="ledger-total"><small>Total</small><b>{euro(total)}</b></div>
        {everyone.map((p) => {
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
        <div className="section-title expenses-head">
          <span>Dépenses{!filtered && ` · ${shown.length} · ${euro(shownTotal)}`}</span>
          <button className={`link-btn${filtered ? '' : ' on'}`} onClick={() => setFiltering(true)}>{filtered ? 'Filtrer' : 'Filtre actif'}</button>
        </div>
        {!filtered && shown.length === 0 && <p className="muted small share-hint">Aucune dépense pour ce filtre.</p>}
        <div className="list-card">
          {shown.map(({ e }) => (
            <div key={e.id} className="settings-row expense">
              <div className="expense-main" onClick={() => setEditing(e)}>
                <div className="expense-label">{e.label}</div>
                <small>{nameOf(e.paid_by)} a payé · {e.split.length === people.length && people.every((p) => e.split.includes(p.id)) ? 'pour tous' : `pour ${e.split.map(nameOf).join(', ')}`} · {when(e.spent_at ?? e.created_at)}
                  {e.repeat && ` · 🔁 ${REPEAT_LABEL[e.repeat]}${e.repeat_until ? ' (arrêtée)' : ''} · ${occurrences(e).length} fois`}</small>
              </div>
              <b>{euro(Number(e.amount))}</b>
              <button className="icon-btn" onClick={() => remove(e)} aria-label="Supprimer"><IconClose /></button>
            </div>
          ))}
        </div>
      </>}
      {ledger && <button className="settings-row danger note-delete" onClick={destroy}><IconTrash /><span>Supprimer les comptes</span></button>}

      <Sheet open={filtering} onClose={() => setFiltering(false)} title="Filtrer les dépenses">
        <div className="sheet-section">Quand</div>
        <div className="chip-row">{PERIODS.map(([k, l]) => <button key={k} className={`chip quick${filter.period === k ? ' on' : ''}`} onClick={() => setFilter({ ...filter, period: k })}>{l}</button>)}</div>
        <div className="sheet-section">Payé par</div>
        <div className="chip-row">
          <button className={`chip quick${!filter.payer ? ' on' : ''}`} onClick={() => setFilter({ ...filter, payer: null })}>Tout le monde</button>
          {choices.map((p) => <button key={p.id} className={`chip quick${filter.payer === p.id ? ' on' : ''}`} onClick={() => setFilter({ ...filter, payer: p.id })}>{nameOf(p.id)}</button>)}
        </div>
        <div className="sheet-section">Qui est concerné</div>
        <div className="chip-row">
          <button className={`chip quick${!filter.concerned ? ' on' : ''}`} onClick={() => setFilter({ ...filter, concerned: null })}>Tout le monde</button>
          {choices.map((p) => <button key={p.id} className={`chip quick${filter.concerned === p.id ? ' on' : ''}`} onClick={() => setFilter({ ...filter, concerned: p.id })}>{nameOf(p.id)}</button>)}
        </div>
        <div className="inline-form">
          <button className="btn" onClick={() => { setFilter({ period: 'all', payer: null, concerned: null }); setFiltering(false) }}>Effacer</button>
          <button className="btn primary wide" onClick={() => setFiltering(false)}>Voir {shown.length} dépense{shown.length > 1 ? 's' : ''}</button>
        </div>
      </Sheet>

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
export function ExpenseSheet({ expense, onClose, ledgerId, people, me, onSaved, defaultLabel = '' }: {
  expense: Expense | null; onClose: () => void; ledgerId: string; people: { id: string; name: string }[]; me: string; onSaved: (e: Expense) => void
  defaultLabel?: string
}) {
  const [label, setLabel] = useState(expense?.label ?? defaultLabel)
  const [amount, setAmount] = useState(expense ? String(expense.amount).replace('.', ',') : '')
  const [paidBy, setPaidBy] = useState(expense?.paid_by ?? me)
  const [split, setSplit] = useState<string[] | null>(expense?.split ?? null)  // null = tout le monde
  const [at, setAt] = useState(() => localInput(expense ? new Date(expense.spent_at ?? expense.created_at) : new Date()))
  const [repeat, setRepeat] = useState<Expense['repeat']>(expense?.repeat ?? null)
  const forWhom = split ?? people.map((p) => p.id)
  const value = Number(amount.replace(',', '.'))
  const valid = !!label.trim() && value > 0 && forWhom.length > 0 && !!at

  const toggle = (id: string) => setSplit(forWhom.includes(id) ? forWhom.filter((x) => x !== id) : [...forWhom, id])
  const save = async () => {
    const fields = { label: label.trim(), amount: Math.round(value * 100) / 100, paid_by: paidBy, split: forWhom, spent_at: new Date(at).toISOString(),
      ...((repeat || expense?.repeat) && { repeat: repeat ?? null, repeat_until: repeat ? expense?.repeat_until ?? null : null }) }
    const temp = tempId()
    const { data, error } = expense
      ? await dbWrite({ table: 'expenses', op: 'update', values: fields, match: { id: expense.id } })
      : await dbWrite({ table: 'expenses', op: 'insert', values: { ledger_id: ledgerId, ...fields }, temp })
    if (error) return notify(errMsg(error))
    // hors ligne : on affiche tout de suite la version locale
    onSaved((expense ? { ...expense, ...fields } : data ?? { id: temp, ledger_id: ledgerId, created_at: new Date().toISOString(), ...fields }) as Expense); onClose()
  }

  return (
    <Sheet open onClose={onClose} title={expense ? 'Modifier la dépense' : 'Nouvelle dépense'} form autoFocus={!expense}>
      <div className="inline-form">
        <LimitedInput max={60} placeholder="Quoi ? (ex. : Courses)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="amount-input" inputMode="decimal" placeholder="0,00 €" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Montant" />
      </div>
      <div className="inline-form">
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Date et heure" />
        <select className="repeat-select" value={repeat ?? ''} onChange={(e) => setRepeat((e.target.value || null) as Expense['repeat'])} aria-label="Récurrence">
          <option value="">Une fois</option><option value="week">Par semaine</option><option value="month">Par mois</option><option value="year">Par an</option>
        </select>
      </div>
      {expense?.repeat && !expense.repeat_until && <button className="link-btn" onClick={async () => {
        const repeat_until = new Date().toISOString()
        const { error } = await dbWrite({ table: 'expenses', op: 'update', values: { repeat_until }, match: { id: expense.id } })
        if (error) return notify(errMsg(error))
        onSaved({ ...expense, repeat_until }); onClose()
      }}>Arrêter la récurrence (garder ce qui a déjà eu lieu)</button>}
      <div className="sheet-section">Payé par</div>
      <div className="chip-row">
        {people.map((p) => <button key={p.id} className={`chip quick${paidBy === p.id ? ' on' : ''}`} onClick={() => setPaidBy(p.id)}>{p.name}</button>)}
      </div>
      <div className="sheet-section">Pour qui {value > 0 && forWhom.length > 0 && <span className="muted">· {euro(value / forWhom.length)} chacun</span>}</div>
      <div className="chip-row">
        <button className={`chip quick all${forWhom.length === people.length ? ' on' : ''}`}
          onClick={() => setSplit(forWhom.length === people.length ? [] : people.map((p) => p.id))}>Tous</button>
        {people.map((p) => <button key={p.id} className={`chip quick${forWhom.includes(p.id) ? ' on' : ''}`} onClick={() => toggle(p.id)}>{p.name}</button>)}
      </div>
      <button className="btn primary wide" disabled={!valid} onClick={save}>{expense ? 'Enregistrer' : 'Ajouter'}</button>
    </Sheet>
  )
}
