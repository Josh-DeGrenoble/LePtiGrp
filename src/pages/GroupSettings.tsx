import { HeaderMenu } from '../components/HeaderMenu'
import { BackButton } from '../components/BackButton'
import { LimitedInput } from '../components/LimitedInput'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg, type Member, type Role } from '../lib/supabase'
import { useMe } from '../lib/auth'
import { useConversation } from '../lib/conversation'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { FriendPicker } from '../components/FriendPicker'
import { IconImages, IconPencil, IconLeave, IconPin, IconPlus, IconStar, IconTrash, IconUserMinus, IconCalendar, IconUserPlus } from '../components/Icons'
import { SGroup, SRow } from '../components/SettingsRow'
import { DatePicker } from '../components/DatePicker'
import { eventLabel } from '../lib/format'
import { Sheet, SheetButton } from '../components/Sheet'
import { ask, notify } from '../components/Dialog'
import { AvatarChooser } from '../components/AvatarChooser'
import { NotifToggles, ActivityToggles, type NotifPrefs, type ActivityPrefs } from '../components/NotifToggles'
import { cachedFriends, loadFriends } from '../lib/friends'
import { LinkedTools } from '../components/LinkedTools'
import { PERMISSIONS, LEVEL_LABEL, levelOf, type Level } from '../lib/permissions'

const ROLE_LABEL: Record<Role, string> = { super_admin: 'Super admin', admin: 'Admin', member: 'Membre' }

export default function GroupSettings() {
  const { id = '' } = useParams()
  const backTo = (useLocation().state as { from?: string } | null)?.from ?? `/c/${id}`
  const me = useMe()
  const nav = useNavigate()
  const c = useConversation(id, me)
  const [roleFor, setRoleFor] = useState<Member | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [word, setWord] = useState('')
  const [adding, setAdding] = useState(false)
  const [toAdd, setToAdd] = useState<string[]>([])
  const [renaming, setRenaming] = useState(false)
  const [pickDate, setPickDate] = useState(false)
  const [editPhoto, setEditPhoto] = useState(false)
  const [friendIds, setFriendIds] = useState(() => cachedFriends().friends.map((f) => f.id))
  const [copied, setCopied] = useState(false)
  useEffect(() => { loadFriends().then((d) => setFriendIds(d.friends.map((f) => f.id))).catch(() => {}) }, [])

  if (!c.conv || !c.mine) return null
  const conv = c.conv
  const isSuper = c.role === 'super_admin'

  const call = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(fn, args)
    if (error) notify(errMsg(error))
    c.reload()
    return !error
  }

  const updateInfo = (patch: { name?: string; avatar_url?: string | null }) =>
    call('update_group_info', { conv: id, group_name: patch.name ?? conv.name, group_avatar: 'avatar_url' in patch ? patch.avatar_url : conv.avatar_url })

  const setEventDate = (d: Date | null) => call('set_group_event', { conv: id,
    day: d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null })

  const updateSettings = (everyoneAdmin: boolean, permissions = conv.permissions) =>
    call('update_group_settings', { conv: id, p_everyone_admin: everyoneAdmin, p_permissions: permissions })

  const setNotif = async (patch: Partial<NotifPrefs> & ActivityPrefs) => {
    const { error } = await supabase.from('members').update(patch).eq('conversation_id', id).eq('user_id', me)
    if (error) notify(errMsg(error))
    c.reload()
  }

  const toggleFav = async () => {
    await supabase.from('members').update({ is_favorite: !c.mine!.is_favorite }).eq('conversation_id', id).eq('user_id', me)
    c.reload()
  }

  const kick = async (m: Member) => (await ask(`Exclure ${m.profiles?.display_name} ?`)) && call('remove_member', { conv: id, member: m.user_id })

  const leave = async () => {
    if (conv.is_group) {
      if ((await ask('Quitter le groupe ?')) && (await call('leave_conversation', { conv: id }))) nav('/', { replace: true })
    } else if (await ask('Supprimer la conversation ? Elle disparaît de ta liste. Si l\'autre la supprime aussi, elle est effacée pour de bon, photos comprises.')) {
      await supabase.from('members').update({ hidden_at: new Date().toISOString() }).eq('conversation_id', id).eq('user_id', me)
      nav('/', { replace: true })
    }
  }

  const other = c.other
  const isFriend = !!other && friendIds.includes(other.id)
  const copyCode = async () => {
    if (!other) return
    await navigator.clipboard?.writeText(other.friend_code)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  const unfriend = async () => {
    if (!other || !(await ask(`Retirer ${other.display_name} de tes amis ?`))) return
    const { error } = await supabase.rpc('remove_friend', { friend: other.id })
    if (error) return notify(errMsg(error))
    setFriendIds((ids) => ids.filter((x) => x !== other.id))
    loadFriends().catch(() => {})
  }

  const effectiveRole = (m: Member): Role => (m.role === 'member' && conv.everyone_admin ? 'admin' : m.role)
  // Super admin : tout le monde sauf soi ; sinon (droit "manage_admins") : pas les super admins
  const canSetRole = (m: Member) => conv.is_group && m.user_id !== me && c.can('manage_admins') && (isSuper || m.role !== 'super_admin')

  return (
    <Screen header={<>
      <BackButton to={backTo} />
      <div className="chat-title">
        <button className="avatar-btn" disabled={!conv.is_group || !c.can('edit_info')} onClick={() => setEditPhoto(true)} aria-label="Changer la photo">
          <Avatar name={c.title} url={conv.is_group ? conv.avatar_url : c.other?.avatar_url} size={34} group={c.members.length > 2} />
        </button>
        <div className="title-stack">
        {renaming ? (
          <LimitedInput className="title-input" defaultValue={conv.name ?? ''} max={40} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false) }}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== conv.name) updateInfo({ name: v }); setRenaming(false) }} />
        ) : conv.is_group && c.can('edit_info') ? (
          <button className="title-edit" onClick={() => setRenaming(true)} aria-label="Renommer le groupe">
            <span>{c.title}</span><IconPencil />
          </button>
        ) : <span>{c.title}</span>}
        {conv.is_group && (conv.event_date || c.can('edit_info')) && (
          <button className={`event-chip${conv.event_date ? ' set' : ''}`} disabled={!c.can('edit_info')} onClick={() => setPickDate(true)}
            aria-label="Date de l'événement">
            <IconCalendar size={15} />{conv.event_date ? eventLabel(conv.event_date) : 'Date'}
          </button>
        )}
        </div>
      </div>
      <HeaderMenu convId={id} />
      <button className="icon-btn star" onClick={toggleFav} aria-label="Favori"><IconStar size={24} filled={c.mine.is_favorite} /></button>
    </>}>
      <Sheet open={pickDate} onClose={() => setPickDate(false)} title="Date de l'événement">
        <DatePicker single max={1} value={conv.event_date ? [new Date(conv.event_date + 'T12:00')] : []}
          onChange={(ds) => { setEventDate(ds[0] ?? null); setPickDate(false) }} />
        {conv.event_date && <SheetButton danger onClick={() => { setEventDate(null); setPickDate(false) }}>Retirer la date</SheetButton>}
      </Sheet>
      <div className="settings-page">
      <SGroup>
        <SRow icon={<IconImages size={20} />} label="Médias" sub="Toutes les photos de la conversation" onClick={() => nav(`/c/${id}/media`)} />
        {other && <SRow icon={<IconUserPlus size={18} />} label="Code ami" onClick={copyCode} chevron={false}
          right={<span className="friend-code">{copied ? 'Copié !' : other.friend_code}</span>} />}
      </SGroup>

      <LinkedTools convId={id} />

      <SGroup title={conv.is_group ? `Membres (${c.members.length})` : 'Membres'}>
        {c.members.map((m) => {
          const r = effectiveRole(m)
          return (
            <div key={m.user_id} className="member-row srow">
              <Avatar name={m.profiles?.display_name ?? '?'} url={m.profiles?.avatar_url} size={36} />
              <button className="member-name" disabled={!canSetRole(m)} onClick={() => setRoleFor(m)}>
                {m.profiles?.display_name}{m.user_id === me && ' (moi)'}
                {conv.is_group && r !== 'member' && <span className="role-star" title={ROLE_LABEL[r]}><IconStar size={18} filled={r === 'super_admin'} /></span>}
              </button>
              {c.can('kick') && m.user_id !== me && (m.role === 'member' || isSuper) && (
                <button className="icon-btn" onClick={() => kick(m)} aria-label="Exclure"><IconUserMinus /></button>
              )}
            </div>
          )
        })}
        {c.can('invite') && <SRow icon={<IconPlus size={20} />} label="Ajouter des membres" onClick={() => setAdding(true)} chevron={false} />}
      </SGroup>

      <SGroup title="Mes notifications">
        <NotifToggles prefs={c.mine} onChange={setNotif} />
      </SGroup>
      <SGroup title="Modifs des outils" note="Afficher dans le chat et/ou être notifié des modifs des outils de cette conversation.">
        <ActivityToggles prefs={c.mine} onChange={setNotif} />
      </SGroup>

      {conv.is_group && (
        <SGroup title="Droits" note={`« Gérer » un outil : le créer, le modifier, le supprimer. Cocher, voter et répondre restent ouverts à tous.${!isSuper ? ' Seul un super admin peut modifier les droits.' : ''}`}>
          <Check label="Tout le monde admin" checked={conv.everyone_admin} disabled={!isSuper} onChange={(v) => updateSettings(v)} />
          {PERMISSIONS.map((p) => (
            <div key={p.action} className={`perm-row${isSuper ? '' : ' disabled'}`}>
              <span>{p.label}</span>
              <div className="segmented">
                {(['all', 'admins', 'super'] as Level[]).map((l) => (
                  <button key={l} className={levelOf(conv, p.action) === l ? 'on' : ''} disabled={!isSuper}
                    onClick={() => updateSettings(conv.everyone_admin, { ...conv.permissions, [p.action]: l })}>{LEVEL_LABEL[l]}</button>
                ))}
              </div>
            </div>
          ))}
        </SGroup>
      )}

      <SGroup>
        {c.can('pin') && <SRow icon={<IconPin size={18} />} label="Désépingler tous les messages" chevron={false}
          onClick={async () => (await ask('Désépingler tous les messages ?')) && call('unpin_all', { conv: id })} />}
        {isFriend && <SRow icon={<IconUserMinus size={18} />} label="Retirer des amis" danger chevron={false} onClick={unfriend} />}
        <SRow icon={conv.is_group ? <IconLeave size={18} /> : <IconTrash size={18} />} danger chevron={false} onClick={leave}
          label={conv.is_group ? 'Quitter le groupe' : 'Supprimer la conversation'}
          sub={conv.is_group ? undefined : "Effacée pour de bon quand vous l'avez supprimée tous les deux"} />
        {conv.is_group && isSuper && <SRow icon={<IconTrash size={18} />} danger chevron={false} label="Supprimer le groupe pour tout le monde"
          sub="Messages, photos, pense-bêtes, comptes et sondages" onClick={() => { setWord(''); setDeleting(true) }} />}
      </SGroup>
      </div>

      <Sheet open={deleting} onClose={() => setDeleting(false)} title="Supprimer le groupe">
        <p className="small">C'est <b>définitif</b> : le groupe « {conv.name} » disparaît pour tous ses membres, avec tous ses messages,
          ses photos, pense-bêtes, comptes, sondages et rappels.</p>
        <p className="small">Tape <b>SUPPRIMER</b> pour confirmer :</p>
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="SUPPRIMER" autoCapitalize="characters" autoComplete="off" />
        <div className="inline-form">
          <button className="btn" onClick={() => setDeleting(false)}>Annuler</button>
          <button className="btn danger-btn wide" disabled={word.trim().toUpperCase() !== 'SUPPRIMER'}
            onClick={async () => { if (await call('delete_group', { conv: id })) nav('/', { replace: true }) }}>Supprimer</button>
        </div>
      </Sheet>

      <Sheet open={!!roleFor} onClose={() => setRoleFor(null)} title={`Rôle de ${roleFor?.profiles?.display_name ?? ''}`}>
        {roleFor && (['super_admin', 'admin', 'member'] as Role[]).filter((r) => isSuper || r !== 'super_admin').map((r) => (
          <SheetButton key={r} onClick={async () => { await call('set_member_role', { conv: id, member: roleFor.user_id, new_role: r }); setRoleFor(null) }}>
            {roleFor.role === r ? '✓ ' : ''}{ROLE_LABEL[r]}
          </SheetButton>
        ))}
      </Sheet>

      <Sheet open={editPhoto} onClose={() => setEditPhoto(false)} title="Photo du groupe">
        <AvatarChooser name={c.title} value={conv.avatar_url} group onChange={async (url) => { await updateInfo({ avatar_url: url }); setEditPhoto(false) }} />
      </Sheet>

      <Sheet open={adding} onClose={() => { setAdding(false); setToAdd([]) }} title="Ajouter des membres">
        <FriendPicker selected={toAdd} onChange={setToAdd} exclude={c.members.map((m) => m.user_id)} />
        <button className="btn primary wide" disabled={!toAdd.length}
          onClick={async () => { await call('add_members', { conv: id, member_ids: toAdd }); setAdding(false); setToAdd([]) }}>
          Ajouter ({toAdd.length})
        </button>
      </Sheet>
    </Screen>
  )
}

function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`check-row${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
