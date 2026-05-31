create extension if not exists pgcrypto;
create extension if not exists vector;

create table users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_active_at timestamptz
);

create table user_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  story_id text not null,
  event_type text not null,
  event_value double precision not null default 1,
  feed_session_id uuid not null,
  position integer,
  target_event_id uuid references user_events(id),
  created_at timestamptz not null default now(),
  constraint user_events_type_check check (
    event_type in (
      'impression',
      'swipe_right',
      'swipe_left',
      'click',
      'favorite',
      'read_time',
      'quick_back',
      'undo'
    )
  )
);

create table story_features (
  story_id text primary key,
  category text,
  facets jsonb not null default '[]',
  keywords jsonb not null default '[]',
  sources jsonb not null default '[]',
  title_vector vector(1536),
  summary_vector vector(1536),
  importance_score double precision not null default 1,
  freshness_score double precision not null default 1,
  popularity_prior double precision not null default 1,
  updated_at timestamptz not null default now()
);

create table story_metrics (
  story_id text primary key,
  impressions integer not null default 0,
  swipe_right_count integer not null default 0,
  swipe_left_count integer not null default 0,
  click_count integer not null default 0,
  favorite_count integer not null default 0,
  right_swipe_rate double precision not null default 0,
  click_rate double precision not null default 0,
  popularity_score double precision not null default 1,
  updated_at timestamptz not null default now()
);

create table model_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  model_type text not null,
  version text not null,
  parameters jsonb not null default '{}',
  trained_at timestamptz not null default now()
);

create table user_interest_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  preferred_facets jsonb not null default '{}',
  preferred_sources jsonb not null default '{}',
  preferred_keywords jsonb not null default '{}',
  interest_vector vector(1536),
  model_version_id uuid references model_versions(id),
  updated_at timestamptz not null default now()
);

create table recommendation_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  story_id text not null references story_features(story_id) on delete cascade,
  user_interest_score double precision not null,
  popularity_score double precision not null,
  importance_score double precision not null,
  freshness_score double precision not null,
  diversity_score double precision not null,
  final_score double precision not null,
  model_version_id uuid references model_versions(id),
  calculated_at timestamptz not null default now(),
  unique (user_id, story_id, model_version_id)
);

create index user_events_user_created_idx on user_events (user_id, created_at desc);
create index user_events_story_type_idx on user_events (story_id, event_type);
create index recommendation_scores_user_final_idx on recommendation_scores (user_id, final_score desc);
create index story_features_title_vector_idx on story_features using ivfflat (title_vector vector_cosine_ops);
create index story_features_summary_vector_idx on story_features using ivfflat (summary_vector vector_cosine_ops);
