import { Fragment, useEffect, useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { circleLink } from '../lib/friends'
import { shareLink } from '../lib/share'
import { SGroup, SRow } from './SettingsRow'
import { Sheet } from './Sheet'
import { LimitedInput } from './LimitedInput'
import { ask, notify } from './Dialog'
import { QrCode } from './Qr'
import { IconPlus, IconUsers, IconShare, IconPencil, IconLock, IconLink, IconTrash, IconCheck, IconSearch } from './Icons'
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

  const [busy, setBusy] = useState<string | null>(null)
  const [initIn, setInitIn] = useState(0)
  // ordre figé au chargement (membres d'abord) : cocher / décocher ne fait pas sauter les lignes
  const loadPeople = (c: Circle) => supabase.rpc('circle_people', { circle: c.id }).then(({ data, error }) => {
    if (error) return notify(errMsg(error))
    setInitIn((data as Person[]).filter((p) => p.in_circle).length)
    setPeople([...(data as Person[])].sort((a, b) => Number(b.in_circle) - Number(a.in_circle) || a.display_name.localeCompare(b.display_name)))
  })
  const manage = (c: Circle) => { setOpen(null); setSearch(''); setPeople([]); setManaging(c); loadPeople(c) }
  // une touche = ajouter ou retirer (les amitiés déjà créées restent)
  const toggle = async (p: Person) => {
    setBusy(p.id)
    const { data, error } = await supabase.rpc(p.in_circle ? 'circle_remove' : 'circle_add', { circle: managing!.id, who: p.id })
    setBusy(null)
    if (error) return notify(errMsg(error))
    setPeople((xs) => xs.map((x) => x.id === p.id ? { ...x, in_circle: !p.in_circle } : x))
    if (!p.in_circle && typeof data === 'number' && data > 0) notify(`${p.display_name} ajouté : ${data} nouvel${data > 1 ? 'les' : 'le'} amitié${data > 1 ? 's' : ''}`)
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
      {open && <div className="sgroup-card circle-actions">
        <SRow icon={<IconUsers size={20} />} label="Gérer les membres" onClick={() => manage(open)} />
        {open.active && <SRow icon={<IconShare size={20} />} label={copied ? 'Lien copié ✓' : 'Partager le lien'} chevron={false} onClick={() => share(open)} />}
        <SRow icon={<IconPencil size={20} />} label="Renommer" chevron={false} onClick={() => rename(open)} />
        <SRow icon={open.active ? <IconLock size={20} /> : <IconLink size={20} />} label={open.active ? 'Désactiver le lien' : 'Réactiver le lien'} chevron={false}
          onClick={() => run('set_circle_active', { circle: open.id, on_: !open.active })} />
        <SRow icon={<span className="danger"><IconTrash size={20} /></span>} label="Supprimer le cercle" danger chevron={false}
          onClick={async () => { if (await ask(`Supprimer le cercle « ${open.name} » pour tout le monde ? Les amitiés déjà créées restent.`)) run('delete_circle', { circle: open.id }) }} />
      </div>}
    </Sheet>

    <Sheet open={!!managing} onClose={() => { const c = managing!; setManaging(null); setOpen(people.length ? { ...c, members: people.filter((p) => p.in_circle).length } : c) }} title={managing ? `Membres · ${managing.name}` : ''} tall>
      {managing && (() => {
        const q = norm(search.trim())
        const list = q ? people.filter((p) => norm(p.display_name).includes(q)) : people
        const n = people.filter((p) => p.in_circle).length
        return <>
          <p className="muted small circle-count">{n} personne{n > 1 ? 's' : ''} dans le cercle · touche pour ajouter ou retirer</p>
          {people.length > 6 && <label className="circle-search"><IconSearch />
            <input type="search" placeholder="Chercher un ami…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>}
          <div className="circle-people">
            {list.map((p, i) => <Fragment key={p.id}>
              {!q && i === initIn && i > 0 && <div className="circle-sep">Autres amis</div>}
              <button className={`circle-person${p.in_circle ? ' in' : ''}${busy === p.id ? ' busy' : ''}`} onClick={() => toggle(p)} aria-pressed={p.in_circle}>
                <Avatar name={p.display_name} url={p.avatar_url} size={36} />
                <span>{p.display_name}</span>
                <span className="check">{p.in_circle && <IconCheck size={16} />}</span>
              </button>
            </Fragment>)}
            {list.length === 0 && <p className="muted small">{q ? 'Aucun ami trouvé.' : 'Chargement…'}</p>}
          </div>
        </>
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
