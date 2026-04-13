-- Run this in your Supabase SQL Editor
-- Creates the trader_profiles table for persistent companion memory

create table if not exists trader_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  
  -- Core identity
  name text,
  experience_level text default 'intermediate', -- 'beginner' | 'intermediate' | 'experienced' | 'professional'
  trading_style text,                            -- e.g. "aggressive scalper", "patient swing"
  
  -- Psychological profile (built over time by AI)
  strengths text[] default '{}',                 -- e.g. ["reads flow well", "patient on entries"]
  weaknesses text[] default '{}',                -- e.g. ["chases breakouts", "cuts winners early"]
  emotional_triggers text[] default '{}',        -- e.g. ["loses discipline after 2 losses", "FOMO on gap plays"]
  best_conditions text,                          -- when they trade best (e.g. "high VIX trending days")
  worst_conditions text,                         -- when they struggle (e.g. "choppy low-volume days")
  
  -- Relationship memory (chronological, AI-extracted after each session)
  memory_log text[] default '{}',               -- last 100 entries, dated
  
  -- Stats context
  session_count integer default 0,
  last_session_at timestamptz,
  total_trading_days integer default 0,
  
  -- Companion personality adaptation
  companion_tone text default 'direct',          -- 'direct' | 'coaching' | 'analytical' | 'tough-love'
  nickname text,                                 -- what the companion calls them
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table trader_profiles enable row level security;
create policy "users can manage own profile" on trader_profiles
  for all using (user_id = auth.uid()::text);
  
-- Index for fast lookups
create index if not exists trader_profiles_user_id_idx on trader_profiles(user_id);

-- Add OPENAI_API_KEY reminder comment
-- IMPORTANT: Make sure OPENAI_API_KEY is set in your Vercel environment variables
-- Settings → Environment Variables → Add OPENAI_API_KEY
