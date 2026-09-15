-- A thumbnail for the documents list.
--
-- `listDocuments` deliberately never reads a deck: the list is "mine, newest
-- first" and pulling a megabyte of blocks per row to print a name and a date
-- would be absurd. That is also why the list could only ever be a list — there
-- was nothing to draw a page from.
--
-- So the first leaf is denormalised out of `stored`, exactly as `name` and
-- `pages` already are, and for the same reason: it is display data, not the
-- truth. The client keeps it in step on every save. A row written before this
-- column existed has `cover` null and shows a blank page until its next save,
-- which is the right failure — nothing is lost and nothing is wrong.
--
-- Deliberately not generated. `stored -> 'deck' -> 'leaves' -> 0` would be
-- exact and would also mean every save rewrote a generated column over the
-- whole document; the client already has the leaf in hand.
--
-- No policy changes: row-level security on `decks` is per row, so a new column
-- is covered by the four policies in 0001 without doing anything.

alter table public.decks add column if not exists cover jsonb;

comment on column public.decks.cover is
  'The document''s first leaf, for the documents-list thumbnail. Display data, denormalised from stored; null on rows written before this column existed.';
