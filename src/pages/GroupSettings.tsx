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
import { IconImages, IconPencil, IconLeave, IconPin, IconPlus, IconStar, IconUserMinus } from '../components/Icons'
import { Sheet, SheetButton } from '../components/Sheet'
import { ask, notify } from '../components/Dialog'
import { AvatarChooser } from '../components/AvatarChooser'
import { NotifToggles, type NotifPrefs } from '../components/NotifToggles'
import { cachedFriends, loadFriends } from '../lib/friends'
import { SecurityCodes } from '../components/SecurityCodes'
import { PERMISSIONS, LEVEL_LABEL, levelOf, type Level } from '../lib/permissions'

const ROLE_LABEL: Record<Role, string> = { super_admin: 'Super admin', admin: 'Admin', member: 'Membre' }

export default function GroupSettings() {
  const { id = '' } = useParams()
  const backTo = (useLocation().state as { from?: string } | null)?.from ?? `/c/${id}`
  const me = useMe()
  const nav = useNavigate()
  const c = useConversation(id, me)
  const [roleFor, setRoleFor] = useState<Member | null>(null)
  const [adding, setAdding] = useState(false)
  const [toAdd, setToAdd] = useState<string[]>([])
  const [renaming, setRenaming] = useState(false)
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

  const updateSettings = (everyoneAdmin: boolean, permissions = conv.permissions) =>
    call('update_group_settings', { conv: id, p_everyone_admin: everyoneAdmin, p_permissions: permissions })

  const setNotif = async (patch: Partial<NotifPrefs>) => {
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
      if ((await ask('Quitter la conversation ?')) && (await call('leave_conversation', { conv: id }))) nav('/', { replace: true })
    } else if (await ask('Supprimer la conversation de ta liste ?')) {
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
        {renaming ? (
          <LimitedInput className="title-input" defaultValue={conv.name ?? ''} max={40} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false) }}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== conv.name) updateInfo({ name: v }); setRenaming(false) }} />
        ) : conv.is_group && c.can('edit_info') ? (
          <button className="title-edit" onClick={() => setRenaming(true)} aria-label="Renommer le groupe">
            <span>{c.title}</span><IconPencil />
          </button>
        ) : <span>{c.title}</span>}
      </div>
      <HeaderMenu convId={id} />
      <button className="icon-btn star" onClick={toggleFav} aria-label="Favori"><IconStar size={24} filled={c.mine.is_favorite} /></button>
    </>}>
      <div className="settings-row disabled"><span>Médias</span><IconImages /></div>
      {other && (
        <button className="settings-row" onClick={copyCode}>
          <span>Code ami</span><span className="friend-code">{copied ? 'Copié !' : other.friend_code}</span>
        </button>
      )}

      <div className="settings-block">
        <div className="section-title">Amis dans le groupe ({c.members.length})</div>
        {c.members.map((m) => {
          const r = effectiveRole(m)
          return (
            <div key={m.user_id} className="member-row">
              <Avatar name={m.profiles?.display_name ?? '?'} url={m.profiles?.avatar_url} size={38} />
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
        {c.can('invite') && <button className="icon-btn add-member" onClick={() => setAdding(true)} aria-label="Ajouter des membres"><IconPlus /></button>}
      </div>

      <div className="settings-block">
        <div className="section-title">Mes notifications</div>
        <NotifToggles prefs={c.mine} onChange={setNotif} />
      </div>

      <SecurityCodes members={c.members} me={me} />

      {conv.is_group && (
        <div className="settings-block">
          <div className="section-title">Droits</div>
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
          {!isSuper && <p className="muted small">Seul un super admin peut modifier les droits.</p>}
        </div>
      )}

      {c.can('pin') && (
        <button className="settings-row" onClick={async () => (await ask('Désépingler tous les messages ?')) && call('unpin_all', { conv: id })}>
          <IconPin filled /><span>Désépingler tous les messages</span>
        </button>
      )}
      {isFriend && (
        <button className="settings-row danger" onClick={unfriend}>
          <IconUserMinus /><span>Retirer des amis</span>
        </button>
      )}
      <button className="settings-row danger" onClick={leave}>
        <IconLeave /><span>{conv.is_group ? 'Quitter la conversation' : 'Supprimer la conversation'}</span>
      </button>

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
