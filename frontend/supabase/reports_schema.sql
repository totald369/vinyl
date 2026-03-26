-- reports: 사용자 제보/수정요청 저장 (승인 전용)
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('new_store', 'edit_request')),
  store_id text null,
  name text not null,
  road_address text not null,
  detail_address text not null default '',
  lat double precision null,
  lng double precision null,
  has_trash_bag boolean not null default false,
  has_special_bag boolean not null default false,
  has_large_waste_sticker boolean not null default false,
  message text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists reports_status_created_at_idx on public.reports (status, created_at desc);
create index if not exists reports_type_created_at_idx on public.reports (report_type, created_at desc);

-- 권장 RLS (프로젝트 정책에 맞게 조정)
alter table public.reports enable row level security;

-- 읽기 제한: 사용자에게 reports 노출 금지 (관리자만 조회)
drop policy if exists "reports_select_none" on public.reports;
create policy "reports_select_none"
  on public.reports
  for select
  using (false);

-- API 서버(서비스 키) 경유 삽입 권장. anon 직접 insert 필요 시 별도 policy를 명시적으로 추가하세요.
