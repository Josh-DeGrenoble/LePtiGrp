/** Photos chiffrées de bout en bout : compression, chiffrement, envoi dans Supabase Storage, lecture */
import { supabase } from './supabase'
import { ready, sealFile, openFile, type PhotoRef } from './crypto/core'

export type { PhotoRef }
const BUCKET = 'media'
const MAX = 1600       // côté le plus long, en pixels
const QUALITY = 0.8

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image illisible'))), 'image/jpeg', q))

export async function loadImage(src: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(src)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000) }
}

/** Taille d'export : côté le plus long ramené à 1600 px */
export function fitSize(w: number, h: number, max = MAX) {
  const s = Math.min(1, max / Math.max(w, h))
  return { w: Math.round(w * s), h: Math.round(h * s) }
}

/** Petite miniature floue (≈ 1 Ko), stockée chiffrée dans le message : s'affiche avant la photo */
function thumbnail(src: CanvasImageSource, w: number, h: number) {
  const t = fitSize(w, h, 24)
  const c = document.createElement('canvas')
  c.width = t.w; c.height = t.h
  c.getContext('2d')!.drawImage(src, 0, 0, t.w, t.h)
  return c.toDataURL('image/jpeg', 0.5)
}

/** Chiffre la photo (canvas déjà à la bonne taille) et l'envoie ; renvoie la référence à mettre dans le message */
export async function uploadPhoto(conv: string, clientId: string, canvas: HTMLCanvasElement): Promise<PhotoRef> {
  if (!navigator.onLine) throw new Error('Il faut du réseau pour envoyer une photo.')
  await ready()
  const jpeg = new Uint8Array(await (await toBlob(canvas, QUALITY)).arrayBuffer())
  const { key, data } = sealFile(jpeg)
  const path = `${conv}/${clientId}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, new Blob([data as BlobPart]), { contentType: 'application/octet-stream', upsert: true })
  if (error) throw error
  const ref = { path, k: key, w: canvas.width, h: canvas.height, th: thumbnail(canvas, canvas.width, canvas.height) }
  urls.set(path, URL.createObjectURL(new Blob([jpeg as BlobPart], { type: 'image/jpeg' })))  // déjà en clair ici : pas besoin de la retélécharger
  return ref
}

// Photos déjà déchiffrées pendant la session (adresse locale blob:)
const urls = new Map<string, string>()
const loading = new Map<string, Promise<string | null>>()

export const cachedPhoto = (ref: PhotoRef) => urls.get(ref.path)

/** Télécharge et déchiffre une photo (une seule fois par session) */
export function photoUrl(ref: PhotoRef): Promise<string | null> {
  const hit = urls.get(ref.path)
  if (hit) return Promise.resolve(hit)
  let p = loading.get(ref.path)
  if (!p) {
    p = (async () => {
      await ready()
      const { data, error } = await supabase.storage.from(BUCKET).download(ref.path)
      if (error || !data) return null
      const plain = openFile(new Uint8Array(await data.arrayBuffer()), ref.k)
      if (!plain) return null
      const url = URL.createObjectURL(new Blob([plain as BlobPart], { type: 'image/jpeg' }))
      urls.set(ref.path, url)
      return url
    })().finally(() => loading.delete(ref.path))
    loading.set(ref.path, p)
  }
  return p
}
