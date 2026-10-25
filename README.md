# Gestion de stock

Application web de gestion de stock et de ventes pour un usage personnel ou une petite
activité : produits, entrées/sorties de stock, clients, ventes, paiements partiels,
créances clients, historique et tableau de bord.

Aucune gestion de factures, fournisseurs ni commandes.

---

## Stack technique

| Domaine | Technologie |
| --- | --- |
| Frontend | React 19 + TypeScript |
| Build / dev | Vite |
| Styles | Tailwind CSS v4 |
| Composants | Composants UI type shadcn/ui + Lucide React |
| Données serveur | TanStack Query |
| Formulaires | React Hook Form + Zod |
| Navigation | React Router |
| Base de données | Supabase (PostgreSQL + Auth + RLS) |
| Tests | Vitest + Testing Library |

---

## Fonctionnalités

- **Tableau de bord** : produits actifs, quantité totale, produits en stock faible, entrées et
  sorties du jour, chiffre d'affaires, encaissements, créances clients, dernières ventes,
  derniers paiements et produits les plus vendus.
- **Produits** : ajout, modification, consultation des détails, archivage, suppression,
  prix de vente, recherche par référence/nom, filtres (catégorie, statut, stock faible),
  tri et pagination.
- **Clients** : fiche client avec code automatique (`CLI-0001`), coordonnées, création,
  modification, archivage/suppression (refusé dès qu'un client a des ventes), solde de créance.
- **Mouvements** : entrées, sorties et ajustements enregistrés par des fonctions SQL
  transactionnelles (`record_stock_entry`, `record_stock_exit`, `record_stock_adjustment`).
  Les pages dédiées sont accessibles depuis la navigation (entrées de stock / sorties de stock).
- **Ventes** : création par lignes (prix unitaire **figé** à la vente), remise éventuelle,
  encaissement immédiat partiel ou total, références automatiques (`VTE-0001`), détails avec
  lignes et paiements, annulation avec réintégration du stock.
- **Paiements** : encaissements enregistrés par RPC (`record_payment`), moyens de paiement,
  historique consultable et annulation tracée (les paiements validés ne sont jamais supprimés).
- **Créances clients** : total à recouvrer, ventes partiellement réglées, encaissement direct
  depuis la fiche de la vente.
- **Historique** : recherche, filtres (type, produit, période, motif), export CSV, quantités
  avant/après, badge entrée (vert) / sortie (rouge) / ajustement (bleu).
- **Paramètres** : nom de l'application, densité d'affichage, changement de mot de passe,
  informations du compte, déconnexion.

La quantité d'un produit ne peut **jamais** être modifiée depuis un formulaire : toute
variation passe par un mouvement.

---

## Installation

```bash
npm install
cp .env.example .env      # puis renseigner les valeurs Supabase
npm run dev
```

### Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement (HMR) |
| `npm run build` | vérification TypeScript + build de production |
| `npm run preview` | prévisualisation du build |
| `npm run lint` | analyse statique (oxlint) |
| `npm test` | tests unitaires (Vitest) |
| `npm run test:watch` | tests en mode watch |

---

## Configuration Supabase

1. Créer un projet sur [supabase.com](https://supabase.com).
2. **Project Settings → API** et récupérer :
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` (ou `publishable`) → `VITE_SUPABASE_ANON_KEY`
3. Créer le fichier `.env` à la racine (cf. `.env.example`).

   ```bash
   VITE_SUPABASE_URL=https://votre-projet.supabase.co
   VITE_SUPABASE_ANON_KEY=votre_cle_anon_publique
   ```

   > La clé `service_role` ne doit **jamais** figurer côté frontend.
4. **SQL Editor** → exécuter les migrations **dans cet ordre strict** :

   | Ordre | Fichier | Contenu |
   | --- | --- | --- |
   | 1 | `supabase/migrations/0001_init_schema.sql` | tables `products` et `stock_movements`, index, colonne générée `stock_status`, triggers `updated_at` et protection de `quantity` |
   | 2 | `supabase/migrations/0002_rls_policies.sql` | politiques Row Level Security |
   | 3 | `supabase/migrations/0003_functions.sql` | fonctions transactionnelles `record_stock_*` |
   | 4 | `supabase/migrations/0004_realtime.sql` | publication temps réel pour la synchronisation entre onglets |
   | 5 | `supabase/migrations/0005_sales_schema.sql` | tables `clients`, `sales`, `sale_items`, `payments`, colonne `sale_price`, compteurs de références, RLS |
   | 6 | `supabase/migrations/0006_sales_functions.sql` | vues `sale_balances` / `client_balances` et RPC `create_sale`, `record_payment`, `cancel_payment`, `cancel_sale`, `sales_overview` |
   | 7 | `supabase/migrations/0007_shared_workspace.sql` | espace de travail partagé : table `workspace_members`, fonction `current_workspace_id()`, RLS et RPC filtrés par espace |
   | 8 | `supabase/migrations/0008_auto_join_workspace.sql` | tout nouveau compte rejoint automatiquement l'espace du premier compte créé |
   | 9 | `supabase/migrations/0009_action_authors.sql` | auteur de chaque action (`created_by`, `cancelled_by`) et RPC `workspace_users()` |

5. Relancer `npm run dev`.

Facultatif : dans **Authentication → Providers**, vous pouvez désactiver l'inscription pour
ne conserver que le compte propriétaire.

---

## Structure du projet

```
supabase/
  migrations/            SQL reproductible (0001 → 0009)
  tests/                 scripts de tests SQL (stock et ventes)
src/
  components/
    layout/              AppLayout, sidebar, navigation mobile, en-têtes de page
    ui/                  boutons, champs, tableaux, modales, toasts, états...
    products/            badges de statut, formulaire et détails produit
    clients/             formulaire client
    sales/               formulaire de vente, paiement, détails et badges de statut
    stock/               badges de mouvement, derniers mouvements
    dashboard/           cartes d'indicateurs, graphe d'activité, alertes de stock
  pages/                 Dashboard, Produits, Clients, Ventes, Mouvements, Historique,
                         Paiements, Créances, Paramètres, Connexion
  hooks/                 useAuth, usePreferences, requêtes TanStack Query
  lib/                   client Supabase, utilitaires, statuts de stock, export CSV
  router/                routes et garde d'authentification
  schemas/               validations Zod
  services/              appels Supabase (aucun accès data dans les composants)
  types/                 types partagés
```

---

## Sécurité et intégrité

- **RLS activée** sur `products` et `stock_movements` : chaque utilisateur ne voit et ne
  modifie que ses propres données.
- **Écriture des mouvements uniquement via RPC** : aucune politique `INSERT/UPDATE/DELETE`
  sur `stock_movements` pour le client.
- **Fonctions `SECURITY DEFINER`** qui vérifient `auth.uid()`, l'appartenance du produit et
  son état actif.
- **Verrou de ligne `SELECT ... FOR UPDATE`** : deux sorties simultanées sont sérialisées,
  le stock ne peut jamais devenir négatif.
- **Trigger `products_guard_quantity`** : toute tentative de modifier `quantity` en dehors
  des fonctions SQL est refusée.
- **Contraintes** : quantités ≥ 0, quantité de mouvement > 0, référence unique par
  utilisateur, suppression impossible dès qu'un mouvement existe (archivage recommandé).
- **Historique figé** : `product_name` et `product_reference` sont enregistrés à chaque
  mouvement, l'historique reste lisible même si le produit change ou est archivé.

---

## Tests

### Tests unitaires (automatiques)

```bash
npm test
```

Couverture : validations Zod (produit sans nom, quantités nulles/négatives/invalide,
motifs non autorisés), statuts de stock (rupture / stock faible / disponible), formatage,
export CSV (échappement, téléchargement), nettoyage des recherches.

### Tests SQL (à exécuter dans Supabase)

Fichier : `supabase/tests/stock_functions_test.sql` (entièrement annulé en fin de script).

Scénarios couverts :

1. création d'un produit (quantité initiale 0, statut calculé)
2. refus d'un produit sans nom
3. refus d'une référence en double pour un même utilisateur — et autorisation d'utiliser la
   même référence pour un autre utilisateur
4. modification des informations sans modification de la quantité
5. entrée de 10 unités : stock de 0 à 10
6. sortie de 3 unités : stock de 10 à 7
7. refus d'une sortie de 8 unités avec un stock de 7
8. refus des quantités nulles, négatives et nulles
9. *(voir ci-dessous)*
10. continuité de l'historique et cohérence stock = dernier `quantity_after`
11. export CSV (testé côté frontend)
12. isolation des données entre utilisateurs (RPC + RLS)
13. historique conservé après archivage + instantané du nom à date du mouvement

### Scénario #9 — deux sorties concurrentes

À réaliser avec deux sessions `psql` (ou deux onglets SQL) sur un produit dont le stock vaut `1` :

```sql
-- Session 1 (ne pas commiter tout de suite)
select public.record_stock_exit('ID_DU_PRODUIT', 1, 'perte');

-- Session 2, en parallèle
select public.record_stock_exit('ID_DU_PRODUIT', 1, 'perte');
```

La session 2 bloque tant que la session 1 détient le verrou, puis repart du stock réel :
elle échoue avec `Stock insuffisant : disponible 0, demandé 1.` Le stock final est `0`, jamais
négatif.

### Vérification manuelle

- Rendu sur mobile, tablette et ordinateur (navigation compacte en bas d'écran).
- Navigation clavier dans les listes déroulantes et les fenêtres modales (Échap, Tab).
- États vides, états de chargement et messages d'erreur réseau.

---

## Vérifications finales

```bash
npx tsc -b      # typage
npm run lint    # lint
npm test        # tests
npm run build   # build de production
```
