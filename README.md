# LePtiGrp

Appli de chat de groupe (V1 : chat uniquement). PWA installable sur iPhone et Android depuis un simple lien.

**Stack** : React + TypeScript + Vite (PWA) · Supabase (Postgres, auth, temps réel).

## Mise en route (une seule fois)

1. **Base de données** : Supabase > *SQL Editor* > *New query* > colle le contenu de [`supabase/schema.sql`](supabase/schema.sql) > *Run*.
   Pour avoir des amis et des convs de test : crée ton compte dans l'appli, puis lance [`supabase/seed.sql`](supabase/seed.sql) de la même façon.
2. **Photos et droits** : lance ensuite, dans l'ordre, [`supabase/avatars.sql`](supabase/avatars.sql) puis [`supabase/permissions.sql`](supabase/permissions.sql).
3. **Auth** : Supabase > *Authentication* > *Sign In / Providers* > Email.
   Pour tester vite, tu peux désactiver *Confirm email* (sinon chaque inscrit doit cliquer un lien reçu par mail).
4. **URL du site** : une fois l'appli en ligne, renseigne son adresse dans *Authentication* > *URL Configuration* > *Site URL*.

Les clés Supabase (publiques) sont dans `.env`.

## Notifications push

1. SQL Editor : lancer [`supabase/push.sql`](supabase/push.sql).
2. SQL Editor : créer le secret `push_secret` dans le Vault (`select vault.create_secret('<secret>', 'push_secret');`).
3. Edge Functions > *Deploy a new function* > *Via Editor* : nom `push`, coller [`supabase/functions/push/index.ts`](supabase/functions/push/index.ts), *Deploy*, puis désactiver *Verify JWT* dans ses réglages.
4. Edge Functions > *Secrets* : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_SECRET` (même valeur que l'étape 2).
5. Dans l'appli : Paramètres > Notifications > Activer (sur iPhone, depuis l'appli installée sur l'écran d'accueil).

## Avatars de groupe et retours

SQL Editor : lancer [`supabase/extras.sql`](supabase/extras.sql). Pour voir les retours (bugs, idées) dans ses réglages, s'ajouter comme admin :
`insert into public.app_admins select id from auth.users where email = '<ton email>';`

## Remplissage du serveur (admin)

SQL Editor : lancer [`supabase/usage.sql`](supabase/usage.sql), puis redéployer la fonction `push`. Limites du plan modifiables dans `usage_limits()`.

## Suppression de compte

SQL Editor : lancer [`supabase/account.sql`](supabase/account.sql) (après `tools.sql`).

## Outils du menu ▽ (pense-bêtes, comptes, sondages, rappels)

1. Database > *Extensions* : activer `pg_cron`.
2. SQL Editor : lancer [`supabase/tools.sql`](supabase/tools.sql) (relançable sans risque).
3. Redéployer la fonction `push` (Edge Functions > `push` > *Code* > coller la nouvelle version > *Deploy*).

La clé VAPID publique est aussi dans `.env` (`VITE_VAPID_PUBLIC_KEY`).

## Chiffrement de bout en bout

1. SQL Editor : lancer [`supabase/e2ee.sql`](supabase/e2ee.sql) (relançable sans risque).
2. Redéployer la fonction `push` (notifications sans texte en clair côté serveur).

Rien à faire pour les utilisateurs : les clés sont liées au compte.
- À la connexion, un calcul Argon2id sur le téléphone transforme le mot de passe en deux moitiés : l'une est envoyée
  à Supabase comme mot de passe (le vrai ne quitte jamais le téléphone), l'autre déverrouille la sauvegarde des clés (`key_backups`).
- Clés du compte (libsodium : X25519 + Ed25519), une clé aléatoire par conversation (renouvelée à chaque arrivée ou départ),
  scellée pour chaque membre ; messages chiffrés en XChaCha20-Poly1305 et signés.
- Les comptes créés avant sont convertis automatiquement à leur prochaine connexion.
- Mot de passe réinitialisé (oubli) = historique chiffré perdu. Le changement de mot de passe dans Paramètres, lui, garde tout.
- Les anciens messages restent en clair, marqués « non chiffré ». Les outils du menu ▽ ne sont pas encore chiffrés.

## Hors-ligne

L'appli s'ouvre sans réseau (dernières convs et messages en cache). Un message écrit hors-ligne est mis en attente
et part automatiquement au retour du réseau, sans doublon (`messages.client_id`). Les convs se rechargent au retour du réseau.

## Développement

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # version de prod dans dist/
```

## Mise en ligne (gratuit)

**Vercel** (recommandé) : vercel.com > *Add New Project* > importe le dépôt GitHub > *Deploy*. Chaque push sur `main` redéploie.
Alternatives : Netlify ou Cloudflare Pages (même principe, `npm run build`, dossier `dist`).

## Installer l'appli sur un téléphone

- **iPhone** : ouvre le lien dans Safari > bouton Partager > *Sur l'écran d'accueil*.
- **Android** : ouvre le lien dans Chrome > menu ⋮ > *Installer l'application*.

## Fonctionnalités V1

- Compte email + mot de passe
- Amis : code perso fixe à 5 chiffres ou lien `/add/12345`, ajout instantané, tags privés
- Page tags : création, couleur, cocher/décocher les amis qui ont le tag
- Discussions : privées (toucher un ami) ou groupes (bouton +), favoris en haut
- Appui long sur une conv : favori, notifications, supprimer (masquer), quitter
- Discussion : mentions `@prénom` / `@tous`, épinglage (durée ou date), filtre des épinglés, suppression
- Paramètres de groupe : rôles (★ super admin, ☆ admin), inviter/exclure, options, désépingler tout, quitter

Pas encore actifs : bouton réglages, flèche ▽, onglets Dépenses et Courses, médias, notifications push.

## Rôles et droits des groupes

Rôles : ★ super admin, ☆ admin, membre. Le super admin peut tout faire et règle les droits.
Chaque droit se règle sur **Tous**, **Admins** ou **Super** (défaut entre parenthèses) :

- Écrire des messages (Tous) · Mentionner @tous (Tous) · Épingler (Admins)
- Supprimer les messages des autres (Admins) · Modifier nom et photo (Admins)
- Inviter (Admins) · Exclure (Super) · Nommer/retirer des admins (Super)

« Tout le monde admin » fait passer tous les membres au rang d'admin.
Les règles sont appliquées dans la base (`public.can()`), l'appli ne fait que les refléter (`src/lib/permissions.ts`).
