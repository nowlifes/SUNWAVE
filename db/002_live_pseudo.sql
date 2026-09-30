-- Le pseudo de l'auteur, affiché chez les autres (« confirmé par Léa »).
-- Nul = réponse non signée. La forme exacte est contrôlée par api/live.ts ;
-- la base ne garde que la borne de longueur.
alter table live_reports add column if not exists pseudo text check (char_length(pseudo) <= 20);
