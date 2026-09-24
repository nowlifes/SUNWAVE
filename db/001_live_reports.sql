-- « Il reste des places au soleil ? » — les réponses de ceux qui sont sur place.
--
-- live_venues : coordonnées de chaque lieu, pour que le serveur vérifie lui-même
--   que l'auteur est sur place (le client ne peut pas être cru sur parole).
-- live_reports : une ligne par (lieu, appareil) — répondre deux fois remplace.
--   Une réponse vaut 45 min ; les lignes de plus de 3 h sont supprimées à l'écriture.

create table if not exists live_venues (
  id  text primary key,
  lat double precision not null,
  lng double precision not null
);

create table if not exists live_reports (
  venue_id    text not null references live_venues(id) on delete cascade,
  device_id   text not null,
  answer      text not null check (answer in ('plenty', 'few', 'none')),
  reported_at timestamptz not null default now(),
  primary key (venue_id, device_id)
);

create index if not exists live_reports_recent on live_reports (reported_at desc);
