/** Page ouverte par le lien de confirmation reçu par mail : un simple message, pas l'appli */
export default function Confirmed() {
  return (
    <div className="confirmed">
      <img src="/icon-v3-192.png" alt="" width={72} height={72} />
      <h1>Email confirmé ✓</h1>
      <p>Ton compte est prêt. Tu peux fermer cette page et retourner dans l'appli LePtiGrp pour te connecter.</p>
    </div>
  )
}
