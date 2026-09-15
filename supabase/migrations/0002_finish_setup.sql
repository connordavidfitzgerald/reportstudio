-- Idempotent. Safe to run as many times as you like.
--
-- Closes two gaps in 0001: an implicit reliance on Supabase's default table
-- privileges, and a storage bucket that may not have been created if only part
-- of that file was run.

-- 1. Grant explicitly rather than depending on default privileges.
grant select, insert, update, delete on public.decks to authenticated;
revoke all on public.decks from anon;

-- 2. The bucket, if it isn't there.
insert into storage.buckets (id, name, public)
values ('deck-images', 'deck-images', false)
on conflict (id) do nothing;

-- 3. Storage policies, re-created so a half-applied 0001 can't leave a gap.
drop policy if exists deck_images_select on storage.objects;
drop policy if exists deck_images_insert on storage.objects;
drop policy if exists deck_images_delete on storage.objects;

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

-- 4. Say what the state actually is.
select 'bucket' as thing,
       coalesce((select id from storage.buckets where id = 'deck-images'), 'MISSING') as value
union all
select 'deck policies',
       (select count(*)::text from pg_policies
         where tablename = 'decks' and schemaname = 'public')
union all
select 'image policies',
       (select count(*)::text from pg_policies
         where tablename = 'objects' and policyname like 'deck_images_%')
union all
select 'rls on decks',
       (select relrowsecurity::text from pg_class where relname = 'decks');
