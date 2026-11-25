import { ask, notify } from '../components/Dialog'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg, type Member, type Role } from '../lib/supabase'
import { useMe } from '../lib/auth'
import { useConversation } from '../lib/conversation'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { FriendPicker } from '../components/FriendPicker'
import { IconBack, IconDown, IconImages, IconPencil, IconLeave, IconPin, IconPlus, IconStar, IconUserMinus } from '../components/Icons'
import { Sheet, SheetButton } from '../components/Sheet'

const ROLE_LABEL: Record<Role, string> = { super_admin: 'Super admin', admin: 'Admin', member: 'Membre' }

export default function GroupSettings() {
  const { id = '' } = useParams()
  const me = useMe()
  const nav = useNavigate()
  const c = useConversation(id, me)
  const [roleFor, setRoleFor] = useState<Member | null>(null)
  const [adding, setAdding] = useState(false)
  const [toAdd, setToAdd] = useState<string[]>([])
  const [renaming, setRenaming] = useState(false)

  if (!c.conv || !c.mine) return null
  const conv = c.conv
  const isSuper = c.role === 'super_admin'

  const call = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(fn, args)
    if (error) notify(errMsg(error))
    c.reload()
    return !error
  }

  const updateGroup = (patch: Partial<typeof conv>) => {
    const next = { ...conv, ...patch }
    call('update_group', {
      conv: id, group_name: next.name, p_everyone_admin: next.everyone_admin,
      p_admins_manage_pins: next.admins_manage_pins, p_admins_manage_members: next.admins_manage_members,
    })
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

  const effectiveRole = (m: Member): Role => (m.role === 'member' && conv.everyone_admin ? 'admin' : m.role)

  return (
    <Screen header={<>
      <button className="icon-btn" onClick={() => nav(`/c/${id}`)} aria-label="Retour"><IconBack /></button>
      <div className="chat-title">
        <Avatar name={c.title} url={conv.is_group ? conv.avatar_url : c.other?.avatar_url} size={34} group={conv.is_group} />
        {renaming ? (
          <input className="title-input" defaultValue={conv.name ?? ''} maxLength={40} autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false) }}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== conv.name) updateGroup({ name: v }); setRenaming(false) }} />
        ) : conv.is_group && isSuper ? (
          <button className="title-edit" onClick={() => setRenaming(true)} aria-label="Renommer le groupe">
            <span>{c.title}</span><IconPencil />
          </button>
        ) : <span>{c.title}</span>}
      </div>
      <button className="icon-btn" disabled aria-label="Bientôt"><IconDown /></button>
      <button className="icon-btn star" onClick={toggleFav} aria-label="Favori"><IconStar size={24} filled={c.mine.is_favorite} /></button>
    </>}>
      <div className="settings-row disabled"><span>Médias</span><IconImages /></div>

      <div className="settings-block">
        <div className="section-title">Amis dans le groupe ({c.members.length})</div>
        {c.members.map((m) => {
          const r = effectiveRole(m)
          return (
            <div key={m.user_id} className="member-row">
              <Avatar name={m.profiles?.display_name ?? '?'} url={m.profiles?.avatar_url} size={38} />
              <button className="member-name" disabled={!isSuper || m.user_id === me || !conv.is_group} onClick={() => setRoleFor(m)}>
                {m.profiles?.display_name}{m.user_id === me && ' (moi)'}
                {conv.is_group && r !== 'member' && <span className="role-star" title={ROLE_LABEL[r]}><IconStar size={18} filled={r === 'super_admin'} /></span>}
              </button>
              {c.canManageMembers && m.user_id !== me && (m.role !== 'super_admin' || isSuper) && (
                <button className="icon-btn" onClick={() => kick(m)} aria-label="Exclure"><IconUserMinus /></button>
              )}
            </div>
          )
        })}
        {c.canManageMembers && <button className="icon-btn add-member" onClick={() => setAdding(true)} aria-label="Ajouter des membres"><IconPlus /></button>}
      </div>

      {conv.is_group && (
        <div className="settings-block">
          <Check label="Tout le monde admin ?" checked={conv.everyone_admin} disabled={!isSuper} onChange={(v) => updateGroup({ everyone_admin: v })} />
          <Check label="Les admins peuvent gérer les msg importants" checked={conv.admins_manage_pins} disabled={!isSuper} onChange={(v) => updateGroup({ admins_manage_pins: v })} />
          <Check label="Les admins peuvent exclure/inviter des membres" checked={conv.admins_manage_members} disabled={!isSuper} onChange={(v) => updateGroup({ admins_manage_members: v })} />
          {!isSuper && <p className="muted small">Seul un super admin peut modifier ces options.</p>}
        </div>
      )}

      {c.canPin && (
        <button className="settings-row" onClick={async () => (await ask('Désépingler tous les messages ?')) && call('unpin_all', { conv: id })}>
          <IconPin filled /><span>Désépingler tous les messages</span>
        </button>
      )}
      <button className="settings-row danger" onClick={leave}>
        <IconLeave /><span>{conv.is_group ? 'Quitter la conversation' : 'Supprimer la conversation'}</span>
      </button>

      <Sheet open={!!roleFor} onClose={() => setRoleFor(null)} title={`Rôle de ${roleFor?.profiles?.display_name ?? ''}`}>
        {roleFor && (['super_admin', 'admin', 'member'] as Role[]).map((r) => (
          <SheetButton key={r} onClick={async () => { await call('set_member_role', { conv: id, member: roleFor.user_id, new_role: r }); setRoleFor(null) }}>
            {roleFor.role === r ? '✓ ' : ''}{ROLE_LABEL[r]}
          </SheetButton>
        ))}
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
