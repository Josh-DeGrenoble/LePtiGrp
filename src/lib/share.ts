/** Partage natif (ou copie du lien) ; un seul à la fois : les appuis répétés pendant que la fenêtre est ouverte sont ignorés */
let busy = false
export async function shareLink(d: { title?: string; text?: string; url: string }): Promise<'shared' | 'copied' | 'busy' | 'cancelled'> {
  if (busy) return 'busy'
  busy = true
  try {
    if (navigator.share) {
      try { await navigator.share({ title: d.title ?? 'LePtiGrp', text: d.text, url: d.url }); return 'shared' } catch { return 'cancelled' }
    }
    await navigator.clipboard.writeText(d.url)
    return 'copied'
  } finally {
    // laisse le temps à la fenêtre de se fermer avant d'accepter un nouvel appui
    setTimeout(() => { busy = false }, 600)
  }
}
