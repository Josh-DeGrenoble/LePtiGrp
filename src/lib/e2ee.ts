/** Chiffrement de bout en bout : liaison avec Supabase (clés publiques, sauvegarde des clés, epochs, messages) */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import {
  ready, b64, deriveIdentity, randomEntropy, passwordKeys, sealBackup, openBackup, makeEpoch, epochSigOk, openEpoch,
  sealMessage, openMessage, sigOk, local, type Identity, type EpochRow, type Pins, type Backup, type PhotoRef, type ReplyRef,
} from './crypto/core'

export { parsePhrase, safetyCode } from './crypto/core'
export type { ReplyRef } from './crypto/core'

// ---------- État partagé ----------

/** password : il faut le mot de passe pour déverrouiller · reset : mot de passe réinitialisé, sauvegarde illisible
 *  restore : ancien compte à phrase de 12 mots, sans sauvegarde */
export type E2EEState = 'loading' | 'password' | 'create' | 'reset' | 'restore' | 'offline' | 'ready'
let me: Identity | null = null
let state: E2EEState = 'loading'
let pins: Pins = {}
let kekRoot: Uint8Array | null = null   // tiré du mot de passe à la connexion, gardé en mémoire seulement
let version = 0
const listeners = new Set<() => void>()
const emit = () => { version++; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export const useE2EE = () => { useSyncExternalStore(subscribe, () => version); return { state, me } }
/** Se met à jour quand les clés connues changent (alerte, vérification) */
export const usePins = () => { useSyncExternalStore(subscribe, () => version); return pins }
export const identity = () => me

export type KeyRow = { user_id: string; sign_pk: string; box_pk: string; created_at: string }

// ---------- Connexion : le vrai mot de passe ne quitte jamais le téléphone ----------

const isBadLogin = (e: { message?: string } | null) => !!e && /invalid login credentials/i.test(e.message ?? '')

/** Laisse le navigateur afficher « Connexion sécurisée… » avant le calcul Argon2id (il bloque l'écran 1 à 5 s) */
const paint = () => new Promise((r) => setTimeout(r, 60))
async function keysOf(password: string) { await ready(); await paint(); return passwordKeys(password) }

/** Une seule opération sur les clés à la fois (double clic, écran relancé…) : sinon deux jeux de clés
 *  peuvent être créés en même temps et la sauvegarde ne correspond plus à la clé publiée */
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => {})
  return run
}
/** Connexion / inscription en cours : un 2e appel identique attend le 1er au lieu d'en relancer un */
let pending: { key: string; p: Promise<unknown> } | null = null
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (pending?.key === key) return pending.p as Promise<T>
  const p = fn().finally(() => { if (pending?.p === p) pending = null })
  pending = { key, p }
  return p
}

/** Connexion avec le mot de passe ; convertit au passage les comptes créés avant le chiffrement */
export function signIn(email: string, password: string) {
  return once(`in:${email}`, () => doSignIn(email, password))
}
async function doSignIn(email: string, password: string) {
  const k = await keysOf(password)
  kekRoot = k.kekRoot
  let { error } = await supabase.auth.signInWithPassword({ email, password: k.authPassword })
  if (isBadLogin(error)) {
    const legacy = await supabase.auth.signInWithPassword({ email, password })
    if (!legacy.error) { error = (await supabase.auth.updateUser({ password: k.authPassword })).error }
  }
  if (error) { kekRoot = null; throw isBadLogin(error) ? new Error('Email ou mot de passe incorrect') : error }
}

export function signUp(email: string, password: string, displayName: string) {
  return once(`up:${email}`, () => doSignUp(email, password, displayName))
}
async function doSignUp(email: string, password: string, displayName: string) {
  const k = await keysOf(password)
  kekRoot = k.kekRoot
  const { data, error } = await supabase.auth.signUp({ email, password: k.authPassword, options: { data: { display_name: displayName }, emailRedirectTo: `${window.location.origin}/confirmed` } })
  if (error) { kekRoot = null; throw error }
  return !!data.session
}

/** Changement de mot de passe : la sauvegarde des clés est rechiffrée avec le nouveau */
export async function changePassword(email: string, current: string, next: string) {
  const cur = await keysOf(current)
  const check = await supabase.auth.signInWithPassword({ email, password: cur.authPassword })
  if (check.error) throw new Error('Mot de passe actuel incorrect')
  const k = await keysOf(next)
  const { error } = await supabase.auth.updateUser({ password: k.authPassword })
  if (error) throw error
  kekRoot = k.kekRoot
  if (me) await saveBackup(me)
}

/** Écran de déverrouillage : le mot de passe est bon s'il ouvre la sauvegarde des clés */
export async function unlock(uid: string, password: string) {
  const root = (await keysOf(password)).kekRoot
  const { data, error } = await supabase.from('key_backups').select('salt, nonce, box').eq('user_id', uid).maybeSingle()
  if (error) throw error
  if (!data || !openBackup(data as Backup, root)) throw new Error('Mot de passe incorrect')
  kekRoot = root
  await initE2EE(uid)
}

/** Premières clés d'un compte sans mot de passe en mémoire (connexion Google, ou session rouverte).
 *  `email` : compte à mot de passe, qu'on vérifie auprès de Supabase avant de s'en servir. */
export async function createKeys(uid: string, password: string, email?: string) {
  await ready()
  if (email) await signIn(email, password)
  else kekRoot = (await keysOf(password)).kekRoot
  await initE2EE(uid)
}

/** Mot de passe de chiffrement oublié : nouvelles clés protégées par un nouveau mot de passe (historique perdu) */
export async function forgotKeys(uid: string, newPassword: string) {
  kekRoot = (await keysOf(newPassword)).kekRoot
  await newKeys(uid)
}

/** Compte Google : changement du mot de passe de chiffrement (rien à changer côté Supabase) */
export async function changeSecret(uid: string, current: string, next: string) {
  const cur = (await keysOf(current)).kekRoot
  const { data } = await supabase.from('key_backups').select('salt, nonce, box').eq('user_id', uid).maybeSingle()
  if (!data || !openBackup(data as Backup, cur)) throw new Error('Mot de passe de chiffrement actuel incorrect')
  kekRoot = (await keysOf(next)).kekRoot
  if (me) await saveBackup(me)
}

// ---------- Clés du compte ----------

async function saveBackup(id: Identity) {
  if (!kekRoot) return
  const { error } = await supabase.from('key_backups').upsert({ user_id: id.uid, ...sealBackup(id.entropy, kekRoot), updated_at: new Date().toISOString() })
  if (error) throw error
}

/** Au lancement : clé locale valable ? sinon on la récupère depuis la sauvegarde avec le mot de passe */
export function initE2EE(uid: string) {
  return serial(async () => {
    try { await doInit(uid) }
    catch (e) {  // réseau coupé en plein milieu, etc. : écran « Réessayer » plutôt qu'un chargement infini
      console.warn('initE2EE', e)
      if (state === 'loading') { state = me ? 'ready' : 'offline'; emit() }
    }
  })
}
async function doInit(uid: string) {
  await ready()
  state = 'loading'; emit()
  let id = await local.identity()
  if (id && id.uid !== uid) { await local.clear(); id = null }
  pins = await local.pins()
  const [keys, bak] = await Promise.all([
    supabase.from('user_keys').select('*').eq('user_id', uid).order('created_at'),
    supabase.from('key_backups').select('salt, nonce, box').eq('user_id', uid).maybeSingle(),
  ])
  if (keys.error || bak.error) { me = id; state = id ? 'ready' : 'offline'; emit(); return }
  const rows = keys.data as KeyRow[]
  const latest = rows.at(-1)
  const backup = bak.data as Backup | null
  const current = (x: Identity) => !latest || latest.sign_pk === b64(x.signPk)

  if (id && current(id)) {
    if (!latest) await publish(id)
    // Sauvegarde absente ou faite avec un ancien mot de passe : on la refait
    if (kekRoot && (!backup || !openBackup(backup, kekRoot))) await saveBackup(id).catch(() => {})
    return done(id, rows)
  }
  if (backup) {
    if (!kekRoot) { state = 'password'; me = null; return emit() }
    const e = openBackup(backup, kekRoot)
    const fromBackup = e && deriveIdentity(uid, e)
    if (!fromBackup || !current(fromBackup)) { state = 'reset'; me = null; return emit() }
    await local.saveIdentity(fromBackup)
    return done(fromBackup, rows)
  }
  if (latest) { state = 'restore'; me = null; return emit() }  // ancien compte à phrase, jamais sauvegardé
  if (!kekRoot) { state = 'create'; me = null; return emit() }
  return makeKeys(uid)
}

function done(id: Identity, rows: KeyRow[]) {
  me = id; state = 'ready'
  pinMine(rows.length ? rows : [{ user_id: id.uid, sign_pk: b64(id.signPk), box_pk: b64(id.boxPk), created_at: '' }])
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

/** Nouvelles clés (premier lancement, ou après une réinitialisation du mot de passe) */
export function newKeys(uid: string) { return serial(() => makeKeys(uid)) }
async function makeKeys(uid: string) {
  await ready()
  const id = deriveIdentity(uid, randomEntropy())
  await publish(id)
  await saveBackup(id)
  await local.saveIdentity(id)
  done(id, [])
}

/** Ancien compte à phrase de 12 mots : la phrase doit correspondre à la clé actuelle, puis on sauvegarde */
export async function restore(uid: string, entropy: Uint8Array) {
  await ready()
  const id = deriveIdentity(uid, entropy)
  const { data, error } = await supabase.from('user_keys').select('*').eq('user_id', uid).order('created_at')
  if (error) throw error
  const latest = (data as KeyRow[]).at(-1)
  if (!latest || latest.sign_pk !== b64(id.signPk)) throw new Error('Ce n\'est pas la bonne phrase pour ce compte.')
  await local.saveIdentity(id)
  await saveBackup(id).catch(() => {})
  done(id, data as KeyRow[])
}

/** Déconnexion : on efface les clés de ce téléphone (elles reviennent au prochain login) */
export async function forgetDevice() {
  me = null; pins = {}; kekRoot = null; state = 'loading'; epochs.clear(); plainCache.clear(); keyCache.clear()
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
    // Nouvelle clé (nouveau compte Google, mot de passe réinitialisé…) : acceptée d'office, sans rien bloquer
    const fresh = rows.filter((r) => !p.signs.includes(r.sign_pk))
    if (fresh.length) { pins[u] = { signs: [...p.signs, ...fresh.map((r) => r.sign_pk)] }; dirty = true }
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

export async function encryptMessage(p: { conversation_id: string; client_id: string; content: string; mentions: string[]; mention_all: boolean; photo?: PhotoRef; reply?: ReplyRef }) {
  if (p.content.length > 4000) throw new Error('Message trop long (4000 caractères max).')
  await ready()
  const { epoch, key } = await sendEpoch(p.conversation_id)
  // Mon propre message : déjà connu en clair, pas besoin de le déchiffrer à son retour (pas de « Déchiffrement… » qui clignote)
  plainCache.set(cacheKey({ conversation_id: p.conversation_id, client_id: p.client_id, epoch, author_id: null, content: null }),
    { status: 'ok', text: p.content, mentions: p.mentions, mention_all: p.mention_all, photo: p.photo, reply: p.reply })
  return { epoch, ciphertext: sealMessage(me!, key, p.conversation_id, epoch, p.client_id, { t: p.content, m: p.mentions, a: p.mention_all, ...(p.photo ? { p: p.photo } : {}), ...(p.reply ? { r: p.reply } : {}) }) }
}

// ---------- Déchiffrement ----------

/** ok : chiffré et signé par une clé de confiance · unverified : signature valide mais clé non confirmée
 *  legacy : ancien message en clair · locked : clé indisponible · invalid : altéré ou signature fausse */
export type Plain = { status: 'ok' | 'unverified' | 'legacy' | 'locked' | 'invalid'; text: string; mentions: string[]; mention_all: boolean; photo?: PhotoRef; reply?: ReplyRef }
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
    plainCache.set(cacheKey(r), { status, text: opened.body.t, mentions: opened.body.m, mention_all: opened.body.a, photo: opened.body.p, reply: opened.body.r })
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
