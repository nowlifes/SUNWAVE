-- Garde-fou contre les réponses fabriquées : une empreinte de l'adresse IP de
-- l'auteur, calculée par api/live.ts (SHA-256 de « IP|jour UTC », tronquée). Le
-- sel du jour fait qu'elle ne suit personne d'un jour à l'autre, et l'adresse
-- elle-même n'est jamais stockée. Nul = pas d'IP lisible (développement local).
alter table live_reports add column if not exists ip_hash text check (char_length(ip_hash) <= 64);
create index if not exists live_reports_ip on live_reports (ip_hash, reported_at desc) where ip_hash is not null
