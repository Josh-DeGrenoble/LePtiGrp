import { useEffect, useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { circleLink } from '../lib/friends'
import { shareLink } from '../lib/share'
import { SGroup, SRow } from './SettingsRow'
import { Sheet, SheetButton } from './Sheet'
import { LimitedInput } from './LimitedInput'
import { ask, notify } from './Dialog'
import { QrCode } from './Qr'
import { IconPlus, IconUsers, IconClose } from './Icons'
import { Avatar } from './Avatar'
import { norm } from '../lib/format'

type Person = { id: string; display_name: string; avatar_url: string | null; in_circle: boolean }
export type Circle = { id: string; token: string; name: string; active: boolean; created_at: string; members: number }

/** Mes cercles d'amis (tous pour l'admin) */
export function useCircles() {
  const [circles, setCircles] = useState<Circle[] | null>(null)
  const load = () => supabase.rpc('list_circles').then(({ data, error }) => { if (!error) setCircles(data as Circle[]) })
  useEffect(() => { load() }, [])
  return { circles, load }
}

/**
 * Fenêtres d'un cercle : son QR et son lien, ses membres (ajouter / retirer), désactiver, supprimer ; et la création.
 * Créateur et membres peuvent tout faire : une modif vaut pour tout le monde.
 */
export function CircleSheets({ open, setOpen, creating, setCreating, reload }: {
  open: Circle | null; setOpen: (c: Circle | null) => void; creating: boolean; setCreating: (v: boolean) => void; reload: () => void
}) {
  const load = reload
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


  const run = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(fn, args)
    if (error) notify(errMsg(error))
    setOpen(null); load()
  }
  const create = async () => {
    const { data, error } = await supabase.rpc('create_circle', { circle_name: name.trim() })
    if (error) return notify(errMsg(error))
    setCreating(false); setName(''); await load()
    setOpen({ ...(data as Circle), members: 1 })
  }
  const share = async (c: Circle) => {
    const r = await shareLink({ text: `Rejoins « ${c.name} » sur LePtiGrp : tu seras ami avec tout le groupe !`, url: circleLink(c.token) })
    if (r === 'copied') { setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }
  const rename = async (c: Circle) => {
    const v = window.prompt('Nouveau nom du cercle', c.name)?.trim()
    if (!v || v === c.name) return
    const { error } = await supabase.rpc('rename_circle', { circle: c.id, circle_name: v })
    if (error) return notify(errMsg(error))
    setOpen({ ...c, name: v }); load()
  }

  return <>

    <Sheet open={creating} onClose={() => setCreating(false)} title="Nouveau cercle d'amis">
      <LimitedInput max={40} placeholder="Nom (ex. : Soirée ski)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <p className="muted small">Chaque personne qui ouvre son lien devient amie avec toutes celles du cercle. Tu en fais partie d'office.</p>
      <button className="btn primary wide" disabled={!name.trim()} onClick={create}>Créer le cercle</button>
    </Sheet>

    <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name}>
      {open && <div className="qr-sheet">
        {open.active ? <QrCode text={circleLink(open.token)} /> : <p className="muted small center">Lien désactivé : plus personne ne peut le rejoindre.</p>}
        <p className="muted small center">{open.members} personne{open.members > 1 ? 's' : ''} dans ce cercle</p>
      </div>}
      {open && <SheetButton onClick={() => manage(open)}>Gérer les membres</SheetButton>}
      {open && <SheetButton onClick={() => rename(open)}>Renommer</SheetButton>}
      {open?.active && <SheetButton onClick={() => share(open)}>{copied ? 'Lien copié ✓' : 'Partager le lien'}</SheetButton>}
      {open && <SheetButton onClick={() => run('set_circle_active', { circle: open.id, on_: !open.active })}>{open.active ? 'Désactiver le lien' : 'Réactiver le lien'}</SheetButton>}
      {open && <SheetButton danger onClick={async () => (await ask(`Supprimer le cercle « ${open.name} » pour tout le monde ? Les amitiés déjà créées restent.`)) && run('delete_circle', { circle: open.id })}>Supprimer le cercle</SheetButton>}
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
          <input type="search" placeholder="Ajouter un ami…" value={search} onChange={(e) => setSearch(e.target.value)} />
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

/** Espace admin : tous les cercles */
export function AdminCircles() {
  const { circles, load } = useCircles()
  const [open, setOpen] = useState<Circle | null>(null)
  const [creating, setCreating] = useState(false)
  if (!circles) return null
  return <>
    <SGroup title="Cercles d'amis (tous)" note="Chaque personne qui ouvre un de ces liens devient amie avec toutes celles du cercle.">
      {circles.map((c) => <CircleRow key={c.id} c={c} onClick={() => setOpen(c)} />)}
      <SRow icon={<IconPlus size={18} />} label="Créer un cercle" chevron={false} onClick={() => setCreating(true)} />
    </SGroup>
    <CircleSheets open={open} setOpen={setOpen} creating={creating} setCreating={setCreating} reload={load} />
  </>
}

export const CircleRow = ({ c, onClick }: { c: Circle; onClick: () => void }) => (
  <SRow icon={<IconUsers size={18} />} label={c.name} onClick={onClick}
    sub={`${c.members} personne${c.members > 1 ? 's' : ''}${c.active ? '' : ' · lien désactivé'}`} />
)
