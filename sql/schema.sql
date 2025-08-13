create table if not exists intakes (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  store text not null,
  session_id text not null,
  brief jsonb not null,
  sinopsis text,
  primera_pagina text,
  status text default 'received'
);
create table if not exists book_jobs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  intake_id bigint references intakes(id) on delete cascade,
  status text not null,
  output_url text,
  logs text
);
