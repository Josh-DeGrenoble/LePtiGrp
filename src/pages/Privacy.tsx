/** Règles de confidentialité : page publique (/confidentialite), lisible sans compte (exigée par Google pour la connexion) */
const CONTACT = import.meta.env.VITE_CONTACT_EMAIL as string | undefined

export default function Privacy() {
  return (
    <div className="legal">
      <a href="/" className="legal-logo"><img src="/icon-v3-192.png" alt="" width={48} height={48} /> LePtiGrp</a>
      <h1>Règles de confidentialité</h1>
      <p className="muted small">Dernière mise à jour : 26 novembre 2026</p>

      <p>LePtiGrp est une appli de discussion entre amis (messages, pense-bêtes, comptes partagés, sondages). Cette page explique simplement quelles données elle utilise et pourquoi.</p>

      <h2>Données collectées</h2>
      <ul>
        <li><b>Compte</b> : ton adresse email, ton pseudo et, si tu en choisis une, ta photo de profil.</li>
        <li><b>Messages</b> : ils sont chiffrés de bout en bout sur ton téléphone. Le serveur les stocke sous forme chiffrée et <b>ne peut pas les lire</b>.</li>
        <li><b>Métadonnées</b> : qui est dans quelle conversation, la date des messages, les mentions, et le contenu des outils (pense-bêtes, comptes, sondages, rappels).</li>
        <li><b>Notifications</b> : un identifiant technique d'abonnement aux notifications de ton appareil, si tu les actives.</li>
      </ul>

      <h2>Connexion avec Google</h2>
      <p>Si tu te connectes avec Google, l'appli reçoit uniquement ton <b>adresse email</b> et ton <b>nom</b> (et ta photo de profil Google si elle existe). Elle n'accède à aucune autre donnée de ton compte Google (contacts, mails, fichiers…).</p>

      <h2>Utilisation</h2>
      <p>Ces données servent <b>uniquement</b> au fonctionnement de l'appli : te connecter, afficher tes conversations, envoyer les notifications. Elles ne sont <b>jamais vendues</b>, ni utilisées pour de la publicité ou du profilage, ni partagées avec des tiers.</p>

      <h2>Hébergement</h2>
      <ul>
        <li><b>Supabase</b> : base de données, comptes et fichiers.</li>
        <li><b>Vercel</b> : hébergement de l'appli web.</li>
      </ul>

      <h2>Durée de conservation et suppression</h2>
      <p>Tes données sont conservées tant que ton compte existe. Tu peux supprimer ton compte à tout moment depuis <b>Paramètres &gt; Supprimer mon compte</b> : ton email, ton pseudo, ta photo, tes amis, tes clés et tes données perso sont effacés. Tes anciens messages restent visibles des autres membres, signés « Compte supprimé ».</p>

      <h2>Tes droits</h2>
      <p>Tu peux demander l'accès, la correction ou la suppression de tes données (RGPD).
        {CONTACT ? <> Contact : <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</> : <> Contact : depuis l'appli, Paramètres &gt; Le dev &gt; Remonter un bug.</>}</p>
    </div>
  )
}
