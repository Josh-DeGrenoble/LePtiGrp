import { notify } from '../components/Dialog'
import { useCallback, useEffect, useState } from 'react'
import { supabase, type Conversation, type Member, type Role } from './supabase'
import { canDo, type Action } from './permissions'
import { readCache, writeCache } from './network'

/** Conversation + membres (avec profils), rechargés en temps réel */
export function useConversation(id: string, me: string) {
  const cached = readCache<{ conv: Conversation | null; members: Member[] }>(`conv:${id}`, { conv: null, members: [] })
  const [conv, setConv] = useState<Conversation | null>(cached.conv)
  const [members, setMembers] = useState<Member[]>(cached.members)
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(async () => {
    const [c, m] = await Promise.all([
      supabase.from('conversations').select('*').eq('id', id).maybeSingle(),
      supabase.from('members').select('*, profiles(*)').eq('conversation_id', id).order('joined_at'),
    ])
    if (c.error) { notify(`Erreur : ${c.error.message}`); return }
    if (!c.data) { setNotFound(true); return }
    setConv(c.data as Conversation)
    setMembers((m.data ?? []) as Member[])
    writeCache(`conv:${id}`, { conv: c.data, members: m.data ?? [] })
  }, [id])

  useEffect(() => {
    load()
    const ch = supabase.channel(`conv-meta-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members', filter: `conversation_id=eq.${id}` }, load)
      // DELETE ne se filtre pas côté serveur : on ne garde que ceux de cette conv
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'members' },
        (p) => { if ((p.old as Partial<Member>).conversation_id === id) load() })
      // UPDATE (lecture, favoris, notifs, rôle) : fusion sur place, sans requête
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'members', filter: `conversation_id=eq.${id}` },
        (p) => setMembers((ms) => ms.map((m) => (m.user_id === (p.new as Member).user_id ? { ...m, ...(p.new as Member), profiles: m.profiles } : m))))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `id=eq.${id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, load])

  const mine = members.find((m) => m.user_id === me)
  const role: Role | null = !mine ? null : mine.role === 'member' && conv?.everyone_admin ? 'admin' : mine.role
  const can = (action: Action) => canDo(conv, role, action)
  const other = conv && !conv.is_group ? members.find((m) => m.user_id !== me)?.profiles : undefined
  const title = conv?.is_group ? conv.name ?? 'Groupe' : other?.display_name ?? 'Discussion'

  return { conv, members, mine, role, can, title, other, notFound, reload: load }
}
