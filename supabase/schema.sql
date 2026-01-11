-- D&D Campaign Manager Database Schema
-- Run this in your Supabase SQL editor

-- Enable the vector extension for embeddings
create extension if not exists vector;

-- Profiles table (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users primary key,
  username text unique not null,
  display_name text,
  created_at timestamptz default now()
);

-- Enable RLS on profiles
alter table profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on profiles for select
  using (true);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- Campaigns table
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table campaigns enable row level security;

-- Campaign members table
create table campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text check (role in ('dm', 'player', 'viewer')),
  unique(campaign_id, user_id)
);

alter table campaign_members enable row level security;

-- Notes table
create table notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  author_id uuid references profiles(id),
  title text not null,
  slug text not null,
  content text default '',
  note_type text check (note_type in ('session', 'npc', 'location', 'item', 'lore', 'quest', 'faction', 'player_character', 'freeform')),
  tags text[] default '{}',
  is_dm_only boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(campaign_id, slug)
);

alter table notes enable row level security;

-- Note links table (for wikilinks)
create table note_links (
  id uuid primary key default gen_random_uuid(),
  source_note_id uuid references notes(id) on delete cascade,
  target_note_id uuid references notes(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  unique(source_note_id, target_note_id)
);

alter table note_links enable row level security;

-- Note versions table (for version history)
create table note_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade,
  title text not null,
  content text not null,
  edited_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table note_versions enable row level security;

-- Note embeddings table (for RAG)
create table note_embeddings (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  chunk_index integer not null,
  chunk_text text not null,
  embedding vector(1536)
);

alter table note_embeddings enable row level security;

-- Create an index for faster vector searches
create index on note_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RLS Policies

-- Campaigns: viewable by members
create policy "Campaign members can view campaigns"
  on campaigns for select
  using (
    auth.uid() = owner_id
    or exists (
      select 1 from campaign_members
      where campaign_members.campaign_id = campaigns.id
      and campaign_members.user_id = auth.uid()
    )
  );

create policy "Campaign owners can update campaigns"
  on campaigns for update
  using (auth.uid() = owner_id);

create policy "Campaign owners can delete campaigns"
  on campaigns for delete
  using (auth.uid() = owner_id);

create policy "Authenticated users can create campaigns"
  on campaigns for insert
  with check (auth.uid() = owner_id);

-- Campaign members policies
create policy "Campaign members can view membership"
  on campaign_members for select
  using (
    exists (
      select 1 from campaigns
      where campaigns.id = campaign_members.campaign_id
      and (
        campaigns.owner_id = auth.uid()
        or exists (
          select 1 from campaign_members cm
          where cm.campaign_id = campaign_members.campaign_id
          and cm.user_id = auth.uid()
        )
      )
    )
  );

create policy "Campaign owners can manage members"
  on campaign_members for all
  using (
    exists (
      select 1 from campaigns
      where campaigns.id = campaign_members.campaign_id
      and campaigns.owner_id = auth.uid()
    )
  );

-- Notes policies
create policy "Campaign members can view non-dm notes"
  on notes for select
  using (
    exists (
      select 1 from campaign_members
      where campaign_members.campaign_id = notes.campaign_id
      and campaign_members.user_id = auth.uid()
    )
    and (
      not notes.is_dm_only
      or exists (
        select 1 from campaign_members
        where campaign_members.campaign_id = notes.campaign_id
        and campaign_members.user_id = auth.uid()
        and campaign_members.role = 'dm'
      )
      or exists (
        select 1 from campaigns
        where campaigns.id = notes.campaign_id
        and campaigns.owner_id = auth.uid()
      )
    )
  );

create policy "DMs and owners can manage notes"
  on notes for all
  using (
    exists (
      select 1 from campaigns
      where campaigns.id = notes.campaign_id
      and campaigns.owner_id = auth.uid()
    )
    or exists (
      select 1 from campaign_members
      where campaign_members.campaign_id = notes.campaign_id
      and campaign_members.user_id = auth.uid()
      and campaign_members.role = 'dm'
    )
  );

create policy "Players can create freeform notes"
  on notes for insert
  with check (
    exists (
      select 1 from campaign_members
      where campaign_members.campaign_id = notes.campaign_id
      and campaign_members.user_id = auth.uid()
      and campaign_members.role = 'player'
    )
    and notes.note_type = 'freeform'
    and notes.is_dm_only = false
  );

-- Note links policies
create policy "Members can view note links"
  on note_links for select
  using (
    exists (
      select 1 from campaign_members
      where campaign_members.campaign_id = note_links.campaign_id
      and campaign_members.user_id = auth.uid()
    )
  );

create policy "DMs can manage note links"
  on note_links for all
  using (
    exists (
      select 1 from campaigns
      where campaigns.id = note_links.campaign_id
      and campaigns.owner_id = auth.uid()
    )
    or exists (
      select 1 from campaign_members
      where campaign_members.campaign_id = note_links.campaign_id
      and campaign_members.user_id = auth.uid()
      and campaign_members.role = 'dm'
    )
  );

-- Note versions policies
create policy "Members can view note versions"
  on note_versions for select
  using (
    exists (
      select 1 from notes
      join campaign_members on campaign_members.campaign_id = notes.campaign_id
      where notes.id = note_versions.note_id
      and campaign_members.user_id = auth.uid()
    )
  );

create policy "DMs can create note versions"
  on note_versions for insert
  with check (
    exists (
      select 1 from notes
      join campaigns on campaigns.id = notes.campaign_id
      where notes.id = note_versions.note_id
      and (
        campaigns.owner_id = auth.uid()
        or exists (
          select 1 from campaign_members
          where campaign_members.campaign_id = notes.campaign_id
          and campaign_members.user_id = auth.uid()
          and campaign_members.role = 'dm'
        )
      )
    )
  );

-- Note embeddings policies
create policy "Members can view embeddings"
  on note_embeddings for select
  using (
    exists (
      select 1 from campaign_members
      where campaign_members.campaign_id = note_embeddings.campaign_id
      and campaign_members.user_id = auth.uid()
    )
  );

create policy "System can manage embeddings"
  on note_embeddings for all
  using (true);

-- Vector search function
create or replace function search_embeddings(
  query_embedding vector(1536),
  match_campaign_id uuid,
  match_threshold float,
  match_count int,
  exclude_dm_only boolean default false
) returns table (
  note_id uuid,
  note_title text,
  note_slug text,
  note_type text,
  chunk_text text,
  similarity float
)
language plpgsql as $$
begin
  return query
  select
    n.id,
    n.title,
    n.slug,
    n.note_type,
    e.chunk_text,
    1 - (e.embedding <=> query_embedding) as similarity
  from note_embeddings e
  join notes n on n.id = e.note_id
  where e.campaign_id = match_campaign_id
    and (not exclude_dm_only or n.is_dm_only = false)
    and 1 - (e.embedding <=> query_embedding) > match_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Helper function to auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'display_name'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to auto-create profile
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
create trigger update_campaigns_updated_at
  before update on campaigns
  for each row execute procedure update_updated_at_column();

create trigger update_notes_updated_at
  before update on notes
  for each row execute procedure update_updated_at_column();
