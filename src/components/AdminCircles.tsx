import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { useMe } from '../lib/auth'
import { circleLink } from '../lib/friends'
import { SGroup, SRow } from './SettingsRow'
import { Sheet, SheetButton } from './Sheet'
import { LimitedInput } from './LimitedInput'
import { ask, notify } from './Dialog'
import { QrCode } from './Qr'
import { IconPlus, IconUsers, IconClose } from './Icons'
import { Avatar } from './Avatar'
import { norm } from '../lib/format'

type Person = { id: string; display_name: string; avatar_url: string | null; in_circle: boolean }
type Circle = { id: string; token: string; name: string; active: boolean; created_at: string; members: number }

/** Réglages, admin seulement : liens « cercle d'amis » (chacun qui ouvre le lien devient ami avec tous les autres) */
export function AdminCircles() {
  const me = useMe()
  const [circles, setCircles] = useState<Circle[] | null>(null)
  const [open, setOpen] = useState<Circle | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const [managing, setManaging] = useState<Circle | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [search, setSearch] = useState('')

  const loadPeople = (c: Circle) => supabase.rpc('circle_people', { circle: c.id }).then(({ data, error }) => {
    if (error) notify(errMsg(error)); else setPeople(data as Person[])
  })
  const manage = (c: Circle) => { setOpen(null); setSearch(''); setPeople([]); setManaging(c); loadPeople(c) }
  const add = async (p: Person) => {
    const { data, error } = await supabase.rpc('circle_add', { circle: managing!.id, who: p.id })
    if (error) return notify(errMsg(error))
    setPeople((xs) => xs.map((x) => x.id === p.id ? { ...x, in_circle: true } : x))
    notify(`${p.display_name} ajouté${data ? ` : ${data} nouvel${data > 1 ? 'les' : 'le'} amitié${data > 1 ? 's' : ''}` : ''}`)
    load()
  }
  const removePerson = async (p: Person) => {
    if (!(await ask(`Retirer ${p.display_name} du cercle ? Ses amitiés déjà créées restent.`))) return
    const { error } = await supabase.rpc('circle_remove', { circle: managing!.id, who: p.id })
    if (error) return notify(errMsg(error))
    setPeople((xs) => xs.map((x) => x.id === p.id ? { ...x, in_circle: false } : x))
    load()
  }

  const load = () => supabase.rpc('list_circles').then(({ data, error }) => { if (!error) setCircles(data as Circle[]) })
  useEffect(() => {
    supabase.from('app_admins').select('user_id').eq('user_id', me).maybeSingle().then(({ data }) => { if (data) load() })
  }, [me]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(fn, args)
    if (error) notify(errMsg(error))
    setOpen(null); load()
  }
  const create = async () => {
    const { data, error } = await supabase.rpc('create_circle', { circle_name: name.trim() })
    if (error) return notify(errMsg(error))
    setCreating(false); setName(''); await load()
    setOpen({ ...(data as Circle), members: 0 })
  }
  const share = async (c: Circle) => {
    const url = circleLink(c.token)
    if (navigator.share) { try { await navigator.share({ title: 'LePtiGrp', text: `Rejoins « ${c.name} » sur LePtiGrp : tu seras ami avec tout le groupe !`, url }) } catch { /* annulé */ } }
    else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  if (!circles) return null
  return <>
    <SGroup title="Cercles d'amis" note="Chaque personne qui ouvre un de ces liens devient amie avec toutes celles qui l'ont ouvert (et celles d'après). Ouvre-le toi aussi pour en faire partie.">
      {circles.map((c) => (
        <SRow key={c.id} icon={<IconUsers size={18} />} label={c.name} onClick={() => setOpen(c)}
          sub={`${c.members} personne${c.members > 1 ? 's' : ''}${c.active ? '' : ' · désactivé'}`} />
      ))}
      <SRow icon={<IconPlus size={18} />} label="Créer un lien" chevron={false} onClick={() => setCreating(true)} />
    </SGroup>

    <Sheet open={creating} onClose={() => setCreating(false)} title="Nouveau cercle d'amis">
      <LimitedInput max={40} placeholder="Nom (ex. : Soirée ski)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <button className="btn primary wide" disabled={!name.trim()} onClick={create}>Créer le lien</button>
    </Sheet>

    <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name}>
      {open && <div className="qr-sheet">
        {open.active ? <QrCode text={circleLink(open.token)} /> : <p className="muted small center">Lien désactivé : plus personne ne peut le rejoindre.</p>}
        <p className="muted small center">{open.members} personne{open.members > 1 ? 's' : ''} dans ce cercle</p>
      </div>}
      {open && <SheetButton onClick={() => manage(open)}>Gérer les membres</SheetButton>}
      {open?.active && <SheetButton onClick={() => share(open)}>{copied ? 'Lien copié ✓' : 'Partager le lien'}</SheetButton>}
      {open && <SheetButton onClick={() => run('set_circle_active', { circle: open.id, on_: !open.active })}>{open.active ? 'Désactiver le lien' : 'Réactiver le lien'}</SheetButton>}
      {open && <SheetButton danger onClick={async () => (await ask(`Supprimer le lien « ${open.name} » ? Les amitiés déjà créées restent.`)) && run('delete_circle', { circle: open.id })}>Supprimer le lien</SheetButton>}
    </Sheet>

    <Sheet open={!!managing} onClose={() => setManaging(null)} title={managing ? `Membres · ${managing.name}` : ''}>
      {managing && (() => {
        const inside = people.filter((p) => p.in_circle)
        const q = norm(search.trim())
        const outside = q ? people.filter((p) => !p.in_circle && norm(p.display_name).includes(q)) : []
        return <div className="circle-people">
          {inside.length === 0 && <p className="muted small">Personne pour l'instant.</p>}
          {inside.map((p) => (
            <div key={p.id} className="circle-person">
              <Avatar name={p.display_name} url={p.avatar_url} size={32} />
              <span>{p.display_name}</span>
              <button className="icon-btn" onClick={() => removePerson(p)} aria-label="Retirer"><IconClose /></button>
            </div>
          ))}
          <input type="search" placeholder="Ajouter quelqu'un de l'appli…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {outside.map((p) => (
            <button key={p.id} className="circle-person add" onClick={() => add(p)}>
              <Avatar name={p.display_name} url={p.avatar_url} size={32} />
              <span>{p.display_name}</span>
              <IconPlus size={18} />
            </button>
          ))}
          {q && outside.length === 0 && <p className="muted small">Aucun compte trouvé.</p>}
        </div>
      })()}
    </Sheet>
  </>
}
