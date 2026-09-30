-- L'avatar de l'auteur (« b62 » : coiffure, couvre-chef, lunettes), pour la
-- pile « confirmé par ». Nul = pas d'avatar. Même forme que api/live.ts.
alter table live_reports add column if not exists avatar text check (avatar ~ '^[0-9ab][0-6][0-5]$')
