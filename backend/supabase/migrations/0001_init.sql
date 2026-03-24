create extension if not exists "uuid-ossp";

create table if not exists stores (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  products text[] not null default '{}',
  phone text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists store_reports (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text not null,
  lat double precision,
  lng double precision,
  note text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists store_edit_requests (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references stores(id) on delete cascade,
  requested_changes text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table stores enable row level security;
alter table store_reports enable row level security;
alter table store_edit_requests enable row level security;

drop policy if exists "Public read stores" on stores;
create policy "Public read stores"
on stores for select
to anon, authenticated
using (true);

drop policy if exists "Public insert reports" on store_reports;
create policy "Public insert reports"
on store_reports for insert
to anon, authenticated
with check (true);

drop policy if exists "Public insert edit requests" on store_edit_requests;
create policy "Public insert edit requests"
on store_edit_requests for insert
to anon, authenticated
with check (true);
