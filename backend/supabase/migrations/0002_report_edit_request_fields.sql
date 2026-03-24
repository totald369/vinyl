alter table store_reports
  add column if not exists items text[] not null default '{}';

alter table store_edit_requests
  add column if not exists request_type text not null default 'other';
