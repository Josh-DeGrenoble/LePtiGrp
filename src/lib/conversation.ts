import { useCallback, useEffect, useState } from 'react'
import { supabase, type Conversation, type Member, type Role } from './supabase'

/** Conversation + membres (avec profils), rechargés en temps réel */
export function useConversation(id: string, me: string) {
  const [conv, setConv] = useState<Conversation | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(async () => {
    const [c, m] = await Promise.all([
      supabase.from('conversations').select('*').eq('id', id).maybeSingle(),
      supabase.from('members').select('*, profiles(*)').eq('conversation_id', id).order('joined_at'),
    ])
    if (c.error) { alert(`Erreur : ${c.error.message}`); return }
    if (!c.data) { setNotFound(true); return }
    setConv(c.data as Conversation)
    setMembers((m.data ?? []) as Member[])
  }, [id])

  useEffect(() => {
    load()
    const ch = supabase.channel(`conv-meta-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `conversation_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `id=eq.${id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, load])

  const mine = members.find((m) => m.user_id === me)
  const role: Role | null = !mine ? null : mine.role === 'member' && conv?.everyone_admin ? 'admin' : mine.role
  const canPin = !!conv && (!conv.is_group || role === 'super_admin' || (role === 'admin' && conv.admins_manage_pins))
  const canManageMembers = !!conv && conv.is_group && (role === 'super_admin' || (role === 'admin' && conv.admins_manage_members))
  const isAdmin = role === 'admin' || role === 'super_admin'
  const other = conv && !conv.is_group ? members.find((m) => m.user_id !== me)?.profiles : undefined
  const title = conv?.is_group ? conv.name ?? 'Groupe' : other?.display_name ?? 'Discussion'

  return { conv, members, mine, role, canPin, canManageMembers, isAdmin, title, other, notFound, reload: load }
}
