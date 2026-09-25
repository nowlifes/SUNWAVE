-- Notification « Golden hour dans 20 min » — les abonnements Web Push.
--
-- À APPLIQUER d'abord sur la branche Neon `dev`, puis sur `production`
-- (node scripts/db-live.mjs sait rejouer 001 ; ce fichier-ci s'applique de la
-- même façon : un `sql` par instruction, tout est « if not exists »).
--
-- Une ligne par navigateur abonné (l'endpoint Web Push est unique par navigateur).
--   device_id     : identifiant d'appareil de l'app (d_…), pour que seul son
--                   propriétaire puisse se désabonner.
--   p256dh, auth  : clés de chiffrement du push, fournies par le navigateur.
--   pick_*        : le lieu que l'appareil a calculé pour aujourd'hui (le serveur
--                   ne peut pas rejouer la reco : elle dépend des bâtiments de
--                   l'app). Périmé (pick_day ≠ aujourd'hui) → message sans lieu.
--   last_sent_day : jour de Lisbonne du dernier envoi — une notification par jour.

create table if not exists push_subscriptions (
  endpoint      text primary key,
  device_id     text not null,
  p256dh        text not null,
  auth          text not null,
  pick_day      text,
  pick_name     text,
  pick_walk_min integer,
  pick_until    text,
  last_sent_day text,
  created_at    timestamptz not null default now()
);

create index if not exists push_subscriptions_device on push_subscriptions (device_id);
