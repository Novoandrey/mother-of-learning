-- Migration 145: the first functional room dialogue (spec-067).
--
-- A room belongs to one campaign. Its explicitly listed character speakers
-- are the allowed character voices; the DM/environment voice is derived from
-- campaign membership and is intentionally not a fake character node.

begin;

create table public.scene_rooms (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index scene_rooms_one_active_per_campaign
  on public.scene_rooms(campaign_id) where is_active;
create index scene_rooms_campaign_updated on public.scene_rooms(campaign_id, updated_at desc);

create table public.scene_room_speakers (
  room_id uuid not null references public.scene_rooms(id) on delete cascade,
  character_node_id uuid not null references public.nodes(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (room_id, character_node_id)
);

create index scene_room_speakers_character on public.scene_room_speakers(character_node_id);

create or replace function public.assert_scene_speaker_campaign()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.scene_rooms r
    join public.nodes n on n.id = new.character_node_id
    where r.id = new.room_id and n.campaign_id = r.campaign_id
  ) then
    raise exception 'scene speaker must belong to the room campaign';
  end if;
  return new;
end;
$$;

create trigger trg_scene_speaker_campaign
  before insert or update on public.scene_room_speakers
  for each row execute function public.assert_scene_speaker_campaign();

create table public.scene_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.scene_rooms(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  speaker_kind text not null check (speaker_kind in ('character', 'dm')),
  speaker_character_id uuid references public.nodes(id) on delete set null,
  message_kind text not null default 'speech' check (message_kind in ('speech', 'description')),
  body text not null check (char_length(btrim(body)) between 1 and 8000),
  created_at timestamptz not null default now(),
  check (
    (speaker_kind = 'character' and speaker_character_id is not null)
    or (speaker_kind = 'dm' and speaker_character_id is null)
  )
);

create index scene_messages_room_created on public.scene_messages(room_id, created_at asc, id asc);

-- Tables are readable by campaign members. Writes use membership-gated server
-- actions, which additionally validate permitted speaker and DM role.
alter table public.scene_rooms enable row level security;
alter table public.scene_room_speakers enable row level security;
alter table public.scene_messages enable row level security;

create policy scene_rooms_select on public.scene_rooms
  for select to authenticated using (public.is_member(campaign_id));

create policy scene_room_speakers_select on public.scene_room_speakers
  for select to authenticated using (
    exists (
      select 1 from public.scene_rooms r
      where r.id = scene_room_speakers.room_id
        and public.is_member(r.campaign_id)
    )
  );

create policy scene_messages_select on public.scene_messages
  for select to authenticated using (
    exists (
      select 1 from public.scene_rooms r
      where r.id = scene_messages.room_id
        and public.is_member(r.campaign_id)
    )
  );

-- Same established private campaign channel as ledger. Consumers re-read under
-- RLS; the broadcast contains no prose.
create or replace function public.broadcast_scene_message_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  room_campaign_id uuid;
begin
  select campaign_id into room_campaign_id from public.scene_rooms where id = new.room_id;
  if room_campaign_id is not null then
    perform realtime.send(
      jsonb_build_object('room_id', new.room_id, 'message_id', new.id),
      'scene_message_insert',
      'campaign:' || room_campaign_id::text,
      true
    );
  end if;
  return new;
end;
$$;

create trigger trg_broadcast_scene_message_insert
  after insert on public.scene_messages
  for each row execute function public.broadcast_scene_message_insert();

commit;
