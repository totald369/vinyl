-- 구매 여부 피드백 (익명·기기 키 기준 insert, 최근 N일 집계용)
create table if not exists purchase_feedbacks (
  id uuid primary key default uuid_generate_v4(),
  store_id text not null,
  feedback_type text not null check (feedback_type in ('success', 'failure')),
  device_key text,
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_feedbacks_store_created
  on purchase_feedbacks (store_id, created_at desc);

alter table purchase_feedbacks enable row level security;

drop policy if exists "Anon select purchase_feedbacks" on purchase_feedbacks;
create policy "Anon select purchase_feedbacks"
on purchase_feedbacks for select
to anon, authenticated
using (true);

drop policy if exists "Anon insert purchase_feedbacks" on purchase_feedbacks;
create policy "Anon insert purchase_feedbacks"
on purchase_feedbacks for insert
to anon, authenticated
with check (feedback_type in ('success', 'failure'));

-- update/delete: 정책 미부여 → anon 에게는 거부
