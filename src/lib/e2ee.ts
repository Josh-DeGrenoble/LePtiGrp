/** Chiffrement de bout en bout : liaison avec Supabase (clés publiques, epochs, messages) */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import {
  ready, b64, deriveIdentity, newEntropy, makeEpoch, epochSigOk, openEpoch, sealMessage, openMessage, sigOk, local,
  type Identity, type EpochRow, type Pins,
} from './crypto/core'

export { parsePhrase, phraseOf, safetyCode, newEntropy } from './crypto/core'

// ---------- État partagé ----------

export type E2EEState = 'loading' | 'setup' | 'restore' | 'changed' | 'offline' | 'ready'
let me: Identity | null = null
let state: E2EEState = 'loading'
let pins: Pins = {}
let version = 0
const listeners = new Set<() => void>()
const emit = () => { version++; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export const useE2EE = () => { useSyncExternalStore(subscribe, () => version); return { state, me } }
/** Se met à jour quand les clés connues changent (alerte, vérification) */
export const usePins = () => { useSyncExternalStore(subscribe, () => version); return pins }
export const identity = () => me

export type KeyRow = { user_id: string; sign_pk: string; box_pk: string; created_at: string }

/** Au lancement : clé locale présente et toujours valable ? */
export async function initE2EE(uid: string) {
  await ready()
  state = 'loading'; emit()
  let id = await local.identity()
  if (id && id.uid !== uid) { await local.clear(); id = null }
  pins = await local.pins()
  const { data, error } = await supabase.from('user_keys').select('*').eq('user_id', uid).order('created_at')
  if (error) { me = id; state = id ? 'ready' : 'offline'; emit(); return }
  const rows = data as KeyRow[]
  const latest = rows.at(-1)
  if (!id) state = latest ? 'restore' : 'setup'
  else if (!latest) { await publish(id); state = 'ready' }          // activation interrompue : on termine
  else if (latest.sign_pk !== b64(id.signPk)) state = 'changed'     // phrase refaite sur un autre appareil
  else state = 'ready'
  me = state === 'ready' ? id : null
  if (me) pinMine(rows)
  emit()
}

async function publish(id: Identity) {
  const { error } = await supabase.from('user_keys').upsert({ user_id: id.uid, sign_pk: b64(id.signPk), box_pk: b64(id.boxPk) }, { onConflict: 'user_id,sign_pk', ignoreDuplicates: true })
  if (error) throw error
}

function pinMine(rows: KeyRow[]) {
  if (!me) return
  pins[me.uid] = { signs: [...new Set([...(pins[me.uid]?.signs ?? []), ...rows.map((r) => r.sign_pk)])], verified: true }
  local.savePins(pins)
}

/** Première activation, ou nouvelle phrase après une perte (`entropy` = phrase notée par l'utilisateur) */
export async function activate(uid: string, entropy: Uint8Array) {
  await ready()
  const id = deriveIdentity(uid, entropy)
  await publish(id)
  await local.saveIdentity(id)
  me = id; state = 'ready'
  pinMine([{ user_id: uid, sign_pk: b64(id.signPk), box_pk: b64(id.boxPk), created_at: '' }])
  emit()
}

/** Nouvel appareil : la phrase doit correspondre à la clé actuelle du compte */
export async function restore(uid: string, entropy: Uint8Array) {
  await ready()
  const id = deriveIdentity(uid, entropy)
  const { data, error } = await supabase.from('user_keys').select('*').eq('user_id', uid).order('created_at')
  if (error) throw error
  const latest = (data as KeyRow[]).at(-1)
  if (!latest || latest.sign_pk !== b64(id.signPk)) throw new Error('Ce n\'est pas la bonne phrase pour ce compte.')
  await local.saveIdentity(id)
  me = id; state = 'ready'
  pinMine(data as KeyRow[])
  emit()
}

export const startOver = () => { state = 'setup'; emit() }
export const genEntropy = newEntropy

/** Déconnexion : on efface la clé de ce téléphone (il faudra ressaisir la phrase) */
export async function forgetDevice() {
  me = null; pins = {}; state = 'loading'; epochs.clear(); plainCache.clear(); keyCache.clear()
  await local.clear(); emit()
}

// ---------- Clés publiques des autres (confiance au premier contact) ----------

const keyCache = new Map<string, KeyRow[]>()

export async function fetchKeys(uids: string[], refresh = false) {
  const missing = refresh ? uids : uids.filter((u) => !keyCache.has(u))
  if (missing.length) {
    const { data, error } = await supabase.from('user_keys').select('*').in('user_id', [...new Set(missing)]).order('created_at')
    if (error) throw error
    for (const u of missing) keyCache.set(u, [])
    for (const r of data as KeyRow[]) keyCache.get(r.user_id)!.push(r)
    checkPins(missing)
  }
  return keyCache
}
export const latestKey = (uid: string) => keyCache.get(uid)?.at(-1)

/** Nouvelle clé jamais vue pour un compte déjà connu = alerte, à accepter à la main */
function checkPins(uids: string[]) {
  let dirty = false
  for (const u of uids) {
    const rows = keyCache.get(u) ?? []
    if (!rows.length) continue
    const p = pins[u]
    if (!p) { pins[u] = { signs: rows.map((r) => r.sign_pk) }; dirty = true; continue }
    const fresh = rows.filter((r) => !p.signs.includes(r.sign_pk))
    if (fresh.length && JSON.stringify(fresh.map((r) => r.sign_pk)) !== JSON.stringify(p.pending?.map((r) => r.sign_pk))) {
      pins[u] = { ...p, pending: fresh.map(({ sign_pk, box_pk }) => ({ sign_pk, box_pk })), verified: false }; dirty = true
    }
  }
  if (dirty) { local.savePins(pins); emit() }
}

export const keyChanged = (uid: string) => !!pins[uid]?.pending?.length
const trusted = (uid: string, signPk: string) => !!pins[uid]?.signs.includes(signPk)

export function acceptKey(uid: string) {
  const p = pins[uid]
  if (!p?.pending) return
  pins[uid] = { signs: [...p.signs, ...p.pending.map((r) => r.sign_pk)] }
  local.savePins(pins); plainCache.clear(); emit()
}
export function setVerified(uid: string, verified: boolean) {
  pins[uid] = { ...(pins[uid] ?? { signs: [] }), verified }
  local.savePins(pins); emit()
}

// ---------- Clés de conversation ----------

type Epoch = { key: Uint8Array; row: EpochRow }
const epochs = new Map<string, Epoch>()  // `${conv}:${epoch}`
const ek = (conv: string, epoch: number) => `${conv}:${epoch}`

async function loadEpochs(convs: string[]) {
  if (!me || !convs.length) return []
  const { data, error } = await supabase.from('conv_epochs').select('*').in('conversation_id', [...new Set(convs)]).order('epoch')
  if (error) throw error
  const rows = data as EpochRow[]
  for (const r of rows) {
    if (epochs.has(ek(r.conversation_id, r.epoch)) || !epochSigOk(r)) continue
    const key = openEpoch(me, r)
    if (!key) continue
    epochs.set(ek(r.conversation_id, r.epoch), { key, row: r })
    local.saveEpochKey(r.conversation_id, r.epoch, key)  // pour les notifications et le hors-ligne
  }
  return rows
}

export class KeyChangedError extends Error {
  uids: string[]
  constructor(uids: string[]) { super('La clé de sécurité d\'un membre a changé : vérifie-la dans les réglages de la conversation avant d\'écrire.'); this.uids = uids }
}

/** Clé d'envoi à jour pour la conv ; en crée une nouvelle si les membres (ou leurs clés) ont changé */
async function sendEpoch(conv: string): Promise<{ epoch: number; key: Uint8Array }> {
  if (!me) throw new Error('Chiffrement pas encore activé sur cet appareil.')
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: mem, error } = await supabase.from('members').select('user_id').eq('conversation_id', conv)
    if (error) throw error
    const uids = (mem as { user_id: string }[]).map((m) => m.user_id)
    await fetchKeys(uids, true)
    const changed = uids.filter(keyChanged)
    if (changed.length) throw new KeyChangedError(changed)
    const want: Record<string, string> = {}
    for (const u of uids) { const k = latestKey(u); if (k) want[u] = k.box_pk }
    if (!want[me.uid]) throw new Error('Ta clé n\'est pas publiée.')

    const rows = await loadEpochs([conv])
    const last = rows.at(-1)
    const cur = last && epochs.get(ek(conv, last.epoch))
    const same = (keys: EpochRow['keys']) => Object.keys(keys).length === Object.keys(want).length && Object.entries(want).every(([u, pk]) => keys[u]?.pk === pk)
    // On réutilise la dernière clé seulement si elle est signée par une clé de confiance et couvre exactement les membres actuels
    if (cur && trusted(cur.row.created_by, cur.row.signer_pk) && same(cur.row.keys)) return { epoch: cur.row.epoch, key: cur.key }

    const next = (last?.epoch ?? 0) + 1
    const { row, key } = makeEpoch(me, conv, next, want)
    const { error: insErr } = await supabase.from('conv_epochs').insert(row)
    if (!insErr) {
      epochs.set(ek(conv, next), { key, row }); local.saveEpochKey(conv, next, key)
      return { epoch: next, key }
    }
    if (insErr.code !== '23505') throw insErr  // 23505 : quelqu'un d'autre a créé cette epoch en même temps, on recommence
  }
  throw new Error('Impossible de préparer la clé de la conversation, réessaie.')
}

export async function encryptMessage(p: { conversation_id: string; client_id: string; content: string; mentions: string[]; mention_all: boolean }) {
  if (p.content.length > 4000) throw new Error('Message trop long (4000 caractères max).')
  await ready()
  const { epoch, key } = await sendEpoch(p.conversation_id)
  return { epoch, ciphertext: sealMessage(me!, key, p.conversation_id, epoch, p.client_id, { t: p.content, m: p.mentions, a: p.mention_all }) }
}

// ---------- Déchiffrement ----------

/** ok : chiffré et signé par une clé de confiance · unverified : signature valide mais clé non confirmée
 *  legacy : ancien message en clair · locked : clé indisponible · invalid : altéré ou signature fausse */
export type Plain = { status: 'ok' | 'unverified' | 'legacy' | 'locked' | 'invalid'; text: string; mentions: string[]; mention_all: boolean }
export type CipherRow = {
  conversation_id: string; author_id: string | null; content: string | null
  ciphertext?: string | null; epoch?: number | null; client_id?: string | null; mentions?: string[]; mention_all?: boolean
}

const plainCache = new Map<string, Plain>()
const cacheKey = (r: CipherRow) => `${r.conversation_id}:${r.client_id}:${r.epoch}`

export function cachedPlain(r: CipherRow): Plain | undefined {
  if (!r.ciphertext) return { status: 'legacy', text: r.content ?? '', mentions: r.mentions ?? [], mention_all: !!r.mention_all }
  return plainCache.get(cacheKey(r))
}

async function keyFor(conv: string, epoch: number) {
  return epochs.get(ek(conv, epoch))?.key ?? await local.epochKey(conv, epoch)
}

export async function decryptRows(rows: CipherRow[]) {
  await ready()
  const todo = rows.filter((r) => r.ciphertext && !plainCache.has(cacheKey(r)))
  if (!todo.length || !me) return
  // Clés manquantes : un seul aller-retour pour toutes les convs concernées
  const missing: string[] = []
  for (const r of todo) if (!(await keyFor(r.conversation_id, r.epoch!))) missing.push(r.conversation_id)
  if (missing.length && navigator.onLine) await loadEpochs(missing).catch(() => {})
  const authors = [...new Set(todo.map((r) => r.author_id).filter(Boolean) as string[])]
  if (navigator.onLine) await fetchKeys(authors).catch(() => {})

  for (const r of todo) {
    const key = await keyFor(r.conversation_id, r.epoch!)
    const fail = (status: Plain['status']): Plain => ({ status, text: '', mentions: [], mention_all: false })
    if (!key) { if (navigator.onLine) plainCache.set(cacheKey(r), fail('locked')); continue }
    const opened = openMessage(key, r.conversation_id, r.epoch!, r.client_id!, r.ciphertext!)
    if (!opened || (r.author_id && opened.body.u !== r.author_id)) { plainCache.set(cacheKey(r), fail('invalid')); continue }
    const author = opened.body.u
    const known = keyCache.get(author) ?? []
    const signer = known.find((k) => sigOk(opened.sig, opened.signed, k.sign_pk))
      ?? pins[author]?.signs.map((s) => ({ sign_pk: s })).find((k) => sigOk(opened.sig, opened.signed, k.sign_pk))
    if (!signer && (known.length || !navigator.onLine)) {
      if (known.length) plainCache.set(cacheKey(r), fail('invalid'))
      continue
    }
    const status = signer && trusted(author, signer.sign_pk) ? 'ok' : 'unverified'
    plainCache.set(cacheKey(r), { status, text: opened.body.t, mentions: opened.body.m, mention_all: opened.body.a })
  }
}

/** Version déchiffrée des messages ; se met à jour au fur et à mesure */
export function useDecrypted(rows: CipherRow[]) {
  const [, force] = useState(0)
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    let alive = true
    decryptRows(rows).then(() => { if (alive) force((n) => n + 1) }).catch(() => {})
    return () => { alive = false }
  }, [rows])
  return (r: CipherRow) => cachedPlain(r)
}
