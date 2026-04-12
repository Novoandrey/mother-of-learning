-- 001_initial_schema.sql
-- Мать Учения: Entity Graph Foundation

-- Campaigns
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now()
);

-- Node Types (per campaign)
create table node_types (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  slug text not null,
  label text not null,
  icon text,
  default_fields jsonb default '{}',
  sort_order int default 0,
  created_at timestamptz default now(),
  unique (campaign_id, slug)
);

-- Edge Types (base + per campaign)
create table edge_types (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  slug text not null,
  label text not null,
  is_base boolean default false,
  created_at timestamptz default now()
);

create unique index idx_edge_types_base on edge_types (slug) where is_base = true;
create unique index idx_edge_types_campaign on edge_types (campaign_id, slug) where campaign_id is not null;

-- Nodes
create table nodes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  type_id uuid not null references node_types(id),
  title text not null,
  fields jsonb default '{}',
  search_vector tsvector,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_nodes_campaign on nodes (campaign_id);
create index idx_nodes_type on nodes (campaign_id, type_id);
create index idx_nodes_search on nodes using gin (search_vector);
create index idx_nodes_title on nodes (campaign_id, lower(title));

-- Search vector trigger
create or replace function update_node_search_vector()
returns trigger as $$
begin
  new.search_vector := to_tsvector('russian',
    coalesce(new.title, '') || ' ' ||
    coalesce(new.fields->>'description', '') || ' ' ||
    coalesce(new.fields->>'status', '') || ' ' ||
    coalesce(new.fields->>'player', '')
  );
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_nodes_search_vector
  before insert or update on nodes
  for each row execute function update_node_search_vector();

-- Edges
create table edges (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  source_id uuid not null references nodes(id) on delete cascade,
  target_id uuid not null references nodes(id) on delete cascade,
  type_id uuid not null references edge_types(id),
  label text,
  meta jsonb default '{}',
  created_at timestamptz default now(),
  unique (source_id, target_id, type_id)
);

create index idx_edges_source on edges (source_id);
create index idx_edges_target on edges (target_id);
create index idx_edges_campaign_type on edges (campaign_id, type_id);
