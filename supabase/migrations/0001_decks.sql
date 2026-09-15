-- Accounts and cloud-saved reports.
--
-- Before this, a report lived in the browser that made it: decks in IndexedDB,
-- photographs in a second IndexedDB, and nothing tying either to a person. This
-- migration moves both onto the server so that work belongs to an account.
--
-- Two things are load-bearing here and are easy to undo by accident:
--
--   * `stored` keeps exactly the shape the client already serialises —
--     `{ v, deck, leafIndex }` — so `src/store/migrations.ts` keeps working
--     unchanged. Rows written by an older build sit in Postgres exactly as they
--     sat in IndexedDB, and `migrate()` still carries them forward on read.
--
--   * Row-level security is the *only* thing separating one account's reports
--     from another's. The anon key ships in the JavaScript bundle and is public
--     by design; there is no server-side code path to fall back on. Every
--     policy below is scoped to `auth.uid()`, and any table added later needs
--     the same treatment in the same migration that creates it.

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------

create table public.decks (
  id uuid primary key,

  -- Defaulted rather than sent by the client, so the client cannot get it
  -- wrong. `on delete cascade` means deleting an account takes its reports.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- Denormalised off `stored` so the documents list never has to read a deck.
  -- The client keeps these in step; they are display data, not the truth.
  name  text not null default 'Untitled report',
  pages int  not null default 0,

  -- The serialised document: { v, deck, leafIndex }.
  stored jsonb not null,

  -- Derived, never written by hand. A migration that needs to find every row
  -- predating some schema version can index this instead of deserialising
  -- every deck; deriving it means it can't drift from `stored.v` the first
  -- time somebody writes a row from a script.
  v smallint generated always as ((stored ->> 'v')::smallint) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A runaway document should fail loudly here rather than be accepted and
  -- then take ten seconds to save on every keystroke. Decks are text — images
  -- are references, not bytes — so a real one is comfortably under a megabyte.
  constraint decks_stored_size check (octet_length(stored::text) < 8 * 1024 * 1024)
);

-- Serves the documents list, which is always "mine, newest first".
create index decks_user_updated_idx on public.decks (user_id, updated_at desc);

-- `updated_at` comes from the server. The client used to stamp `Date.now()`,
-- which was fine when the clock and the storage were the same machine and is
-- not once two devices share an account.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger decks_touch_updated_at
  before update on public.decks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Who can see a report
-- ---------------------------------------------------------------------------

alter table public.decks enable row level security;

-- The anon role has no policy at all, so an unauthenticated client sees
-- nothing rather than relying on a policy evaluating to false.
revoke all on public.decks from anon;

-- Granted explicitly rather than left to Supabase's default privileges for new
-- tables in `public`. Those defaults do currently cover `authenticated`, so
-- this changes nothing today — but row-level security only ever *narrows* what
-- a role can reach. It never grants. A project whose defaults had been
-- tightened would apply every policy below and still refuse every query, which
-- is a confusing way to find out about an implicit dependency.
grant select, insert, update, delete on public.decks to authenticated;

create policy decks_select on public.decks
  for select to authenticated
  using (auth.uid() = user_id);

create policy decks_insert on public.decks
  for insert to authenticated
  with check (auth.uid() = user_id);

-- `with check` matters as much as `using` here: without it a user could update
-- a row's `user_id` and hand their report to somebody else's account.
create policy decks_update on public.decks
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy decks_delete on public.decks
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Uploaded photographs
-- ---------------------------------------------------------------------------

-- Private. Objects are read through the user's own JWT, never a public URL.
insert into storage.buckets (id, name, public)
values ('deck-images', 'deck-images', false)
on conflict (id) do nothing;

-- Objects live at `<uid>/<imageId>`. That first path segment *is* the access
-- boundary, which is also why image ids only have to be unique per user.
create policy deck_images_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'deck-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy deck_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'deck-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy deck_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'deck-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
