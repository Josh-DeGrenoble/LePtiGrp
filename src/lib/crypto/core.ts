/**
 * Chiffrement de bout en bout : primitives libsodium (auditées), sans dépendance à Supabase
 * (ce fichier est aussi utilisé par le service worker pour déchiffrer les notifications).
 *
 * - Secret du compte : 128 bits d'aléa, sauvegardé sur le serveur chiffré par une clé tirée du mot de passe
 *   (Argon2id). Le serveur ne reçoit jamais le mot de passe : seulement une autre moitié du calcul (voir passwordKeys).
 * - (Ancien mode) phrase de récupération : 12 mots BIP39 (liste française) codant ce même secret.
 * - Clés du compte dérivées de la phrase : X25519 (réception des clés de conv) + Ed25519 (signature).
 * - Clé de conversation (« epoch ») : 32 octets aléatoires, scellée pour chaque membre (crypto_box_seal).
 * - Message : XChaCha20-Poly1305 avec la clé de l'epoch, signé Ed25519 par son auteur.
 */
import sodium from 'libsodium-wrappers-sumo'
import { generateMnemonic, entropyToMnemonic, mnemonicToEntropy } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/french.js'
import { createStore, get, set, del, clear } from 'idb-keyval'

export const ready = () => sodium.ready
export const b64 = (u: Uint8Array) => sodium.to_base64(u)
export const unb64 = (s: string) => sodium.from_base64(s)
const utf8 = (s: string) => sodium.from_string(s)

// ---------- Phrase de récupération ----------

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const byStripped = new Map(wordlist.map((w) => [strip(w), w]))
const byPrefix = new Map(wordlist.map((w) => [strip(w).slice(0, 4), w]))

export const newEntropy = () => mnemonicToEntropy(generateMnemonic(wordlist, 128), wordlist)
export const phraseOf = (entropy: Uint8Array) => entropyToMnemonic(entropy, wordlist).split(' ')

/** Lit une phrase saisie à la main : accents, majuscules et ponctuation facultatifs, 4 premières lettres suffisent */
export function parsePhrase(input: string): { entropy?: Uint8Array; error?: string } {
  const raw = strip(input).split(/[^a-z]+/).filter(Boolean)
  if (raw.length !== 12) return { error: `Il faut 12 mots (${raw.length} saisis).` }
  const words: string[] = []
  for (const [i, r] of raw.entries()) {
    const w = byStripped.get(r) ?? (r.length >= 4 ? byPrefix.get(r.slice(0, 4)) : undefined)
    if (!w) return { error: `Mot n° ${i + 1} inconnu : « ${r} ».` }
    words.push(w)
  }
  try { return { entropy: mnemonicToEntropy(words.join(' '), wordlist) } }
  catch { return { error: 'Phrase invalide : vérifie l\'ordre et l\'orthographe des mots.' } }
}

// ---------- Mot de passe ----------

/**
 * Un seul calcul Argon2id (lent exprès) donne 64 octets :
 * - les 32 premiers deviennent le « mot de passe » envoyé à Supabase (le vrai n'en sort jamais) ;
 * - les 32 suivants servent de base à la clé qui déverrouille la sauvegarde des clés.
 * Le serveur ne connaît que la première moitié : pour lire la sauvegarde, il devrait retrouver le mot de passe.
 */
export function passwordKeys(password: string) {
  const out = sodium.crypto_pwhash(64, utf8(password), sodium.crypto_generichash(16, utf8('LePtiGrp-password-v1'), null),
    3, 64 * 1024 * 1024, sodium.crypto_pwhash_ALG_ARGON2ID13)
  return { authPassword: b64(out.slice(0, 32)), kekRoot: out.slice(32) }
}

export type Backup = { salt: string; nonce: string; box: string }
const kekOf = (kekRoot: Uint8Array, salt: Uint8Array) => sodium.crypto_generichash(32, salt, kekRoot)

/** Chiffre le secret du compte pour la sauvegarde serveur */
export function sealBackup(entropy: Uint8Array, kekRoot: Uint8Array): Backup {
  const salt = sodium.randombytes_buf(16)
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  return { salt: b64(salt), nonce: b64(nonce), box: b64(sodium.crypto_secretbox_easy(entropy, nonce, kekOf(kekRoot, salt))) }
}
export function openBackup(b: Backup, kekRoot: Uint8Array): Uint8Array | null {
  try { return sodium.crypto_secretbox_open_easy(unb64(b.box), unb64(b.nonce), kekOf(kekRoot, unb64(b.salt))) } catch { return null }
}
export const randomEntropy = () => sodium.randombytes_buf(16)

// ---------- Clés du compte ----------

export type Identity = { uid: string; entropy: Uint8Array; signPk: Uint8Array; signSk: Uint8Array; boxPk: Uint8Array; boxSk: Uint8Array }

export function deriveIdentity(uid: string, entropy: Uint8Array): Identity {
  const master = sodium.crypto_generichash(32, entropy, utf8('LePtiGrp e2ee v1'))
  const sign = sodium.crypto_sign_seed_keypair(sodium.crypto_kdf_derive_from_key(32, 1, 'LPGsign1', master))
  const box = sodium.crypto_box_seed_keypair(sodium.crypto_kdf_derive_from_key(32, 2, 'LPGboxk1', master))
  return { uid, entropy, signPk: sign.publicKey, signSk: sign.privateKey, boxPk: box.publicKey, boxSk: box.privateKey }
}

/** Code de sécurité d'un compte (6 groupes de 5 chiffres), à comparer de vive voix ou en face à face */
export function safetyCode(signPk: string, boxPk: string) {
  const h = sodium.crypto_generichash(30, utf8(`LPG-code-v1|${signPk}|${boxPk}`), null)
  const groups: string[] = []
  for (let i = 0; i < 30; i += 5) {
    let n = 0
    for (let j = 0; j < 5; j++) n = n * 256 + h[i + j]
    groups.push(String(n % 100000).padStart(5, '0'))
  }
  return groups.join(' ')
}

// ---------- Clés de conversation ----------

export type EpochKeys = Record<string, { pk: string; k: string }>
export type EpochRow = { conversation_id: string; epoch: number; created_by: string; signer_pk: string; keys: EpochKeys; sig: string }

const epochText = (r: Omit<EpochRow, 'sig'>) =>
  `LPG-epoch-v1|${r.conversation_id}|${r.epoch}|${r.created_by}|${r.signer_pk}|` +
  Object.keys(r.keys).sort().map((u) => `${u}:${r.keys[u].pk}:${r.keys[u].k}`).join(',')

export function makeEpoch(me: Identity, conv: string, epoch: number, members: Record<string, string>): { row: EpochRow; key: Uint8Array } {
  const key = sodium.randombytes_buf(32)
  const keys: EpochKeys = {}
  for (const [uid, pk] of Object.entries(members)) keys[uid] = { pk, k: b64(sodium.crypto_box_seal(key, unb64(pk))) }
  const base = { conversation_id: conv, epoch, created_by: me.uid, signer_pk: b64(me.signPk), keys }
  return { row: { ...base, sig: b64(sodium.crypto_sign_detached(utf8(epochText(base)), me.signSk)) }, key }
}

/** Signature de l'epoch valide (par la clé annoncée) ? */
export function epochSigOk(r: EpochRow) {
  try { return sodium.crypto_sign_verify_detached(unb64(r.sig), utf8(epochText(r)), unb64(r.signer_pk)) } catch { return false }
}

export function openEpoch(me: Identity, r: EpochRow): Uint8Array | null {
  const mine = r.keys[me.uid]
  if (!mine || mine.pk !== b64(me.boxPk)) return null
  try { return sodium.crypto_box_seal_open(unb64(mine.k), me.boxPk, me.boxSk) } catch { return null }
}

// ---------- Messages ----------

export type Body = { u: string; t: string; m: string[]; a: boolean }
type Sealed = { b: string; s: string }
const msgAd = (conv: string, epoch: number, clientId: string) => `LPG-msg-v1|${conv}|${epoch}|${clientId}`

export function sealMessage(me: Identity, key: Uint8Array, conv: string, epoch: number, clientId: string, body: Omit<Body, 'u'>) {
  const ad = msgAd(conv, epoch, clientId)
  const b = JSON.stringify({ ...body, u: me.uid } satisfies Body)
  const s = b64(sodium.crypto_sign_detached(utf8(`${ad}|${b}`), me.signSk))
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(utf8(JSON.stringify({ b, s } satisfies Sealed)), utf8(ad), null, nonce, key)
  const out = new Uint8Array(nonce.length + ct.length)
  out.set(nonce); out.set(ct, nonce.length)
  return b64(out)
}

/** Déchiffre ; null si la clé ne correspond pas ou si le message a été modifié */
export function openMessage(key: Uint8Array, conv: string, epoch: number, clientId: string, ciphertext: string): { body: Body; sig: string; signed: string } | null {
  try {
    const raw = unb64(ciphertext)
    const n = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    const ad = msgAd(conv, epoch, clientId)
    const pt = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, raw.slice(n), utf8(ad), raw.slice(0, n), key)
    const { b, s } = JSON.parse(sodium.to_string(pt)) as Sealed
    const body = JSON.parse(b) as Body
    if (typeof body.t !== 'string' || typeof body.u !== 'string') return null
    return { body: { ...body, m: Array.isArray(body.m) ? body.m : [], a: !!body.a }, sig: s, signed: `${ad}|${b}` }
  } catch { return null }
}

export function sigOk(sig: string, signed: string, signPk: string) {
  try { return sodium.crypto_sign_verify_detached(unb64(sig), utf8(signed), unb64(signPk)) } catch { return false }
}

// ---------- Stockage local (IndexedDB, partagé avec le service worker) ----------

/** Clés publiques déjà vues pour chaque compte (confiance au premier contact) */
export type Pin = { signs: string[]; pending?: { sign_pk: string; box_pk: string }[]; verified?: boolean }
export type Pins = Record<string, Pin>

const store = createStore('lpg-e2ee', 'kv')
export const local = {
  identity: async () => {
    const v = await get<{ uid: string; entropy: Uint8Array }>('ident', store)
    return v ? deriveIdentity(v.uid, v.entropy) : null
  },
  saveIdentity: (id: Identity) => set('ident', { uid: id.uid, entropy: id.entropy }, store),
  pins: async () => (await get<Pins>('pins', store)) ?? {},
  savePins: (p: Pins) => set('pins', p, store),
  epochKey: (conv: string, epoch: number) => get<Uint8Array>(`ek:${conv}:${epoch}`, store),
  saveEpochKey: (conv: string, epoch: number, key: Uint8Array) => set(`ek:${conv}:${epoch}`, key, store),
  forgetIdentity: () => del('ident', store),
  clear: () => clear(store),
}
