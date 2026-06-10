-- Schema cho bot nối từ PhoBo (Supabase / Postgres)
-- Chạy 1 lần trong Supabase SQL Editor.
-- Dùng SUPABASE_KEY = service_role ở server-side nên không cần RLS policies.

create table if not exists words (
    word text primary key
);

create table if not exists report_words (
    word text primary key
);

create table if not exists guild_config (
    guild_id   text primary key,
    channel_id text
);

create table if not exists game_state (
    channel_id          text primary key,
    running             boolean not null default false,
    current_player_id   text,
    current_player_name text,
    words               jsonb not null default '[]'::jsonb
);

create table if not exists rankings (
    guild_id   text not null,
    user_id    text not null,
    win        integer not null default 0,
    total      integer not null default 0,
    true_count integer not null default 0,
    name       text,
    avatar     text,
    primary key (guild_id, user_id)
);

create index if not exists rankings_guild_idx on rankings (guild_id);

create table if not exists global_stats (
    key   text primary key,
    value bigint not null default 0
);

insert into global_stats (key, value) values
    ('query', 0),
    ('word_played', 0),
    ('round_played', 0)
on conflict (key) do nothing;

create table if not exists premium_guilds (
    guild_id text primary key
);
