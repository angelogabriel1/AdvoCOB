-- Schema relacional principal do COB Advogados.
-- O servidor nao usa mais app_state quando DATABASE_URL esta configurado.
drop table if exists app_state;

create table if not exists lawyers (
  id text primary key,
  name text not null,
  room text not null,
  specialty text,
  username text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('admin', 'recepcao', 'advogado', 'contadora', 'gerente')),
  job_title text,
  lawyer_id text references lawyers(id) on delete set null,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users add column if not exists job_title text;
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin', 'recepcao', 'advogado', 'contadora', 'gerente'));

create table if not exists appointments (
  id text primary key,
  client_name text not null,
  client_phone text,
  notes text,
  lawyer_id text,
  lawyer_name text,
  lawyer_room text,
  scheduled_date date,
  scheduled_time text,
  status text not null default 'aguardando',
  reception_requests jsonb,
  updated_by jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  called_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  cancelled_at timestamptz
);

create table if not exists appointment_history (
  id text primary key,
  appointment_id text,
  type text not null,
  created_at timestamptz not null,
  actor jsonb,
  appointment jsonb,
  details jsonb
);

create table if not exists payment_requests (
  id text primary key,
  process_number text not null,
  client_name text,
  notes text,
  status text not null default 'solicitada',
  lawyer_id text,
  lawyer_name text,
  requested_by jsonb,
  requested_at timestamptz not null,
  guide_text text,
  guide_link text,
  guide_file_path text,
  guide_file_name text,
  guide_file_type text,
  guide_file_size integer,
  guide_amount text,
  guide_due_date date,
  guide_generated_by jsonb,
  guide_generated_at timestamptz,
  payment_receipt_text text,
  payment_receipt_link text,
  payment_receipt_file_path text,
  payment_receipt_file_name text,
  payment_receipt_file_type text,
  payment_receipt_file_size integer,
  paid_by jsonb,
  paid_at timestamptz,
  updated_at timestamptz
);

alter table payment_requests add column if not exists guide_file_path text;
alter table payment_requests add column if not exists guide_file_name text;
alter table payment_requests add column if not exists guide_file_type text;
alter table payment_requests add column if not exists guide_file_size integer;
alter table payment_requests add column if not exists payment_receipt_file_path text;
alter table payment_requests add column if not exists payment_receipt_file_name text;
alter table payment_requests add column if not exists payment_receipt_file_type text;
alter table payment_requests add column if not exists payment_receipt_file_size integer;

create table if not exists audit_logs (
  id text primary key,
  action text not null,
  created_at timestamptz not null,
  actor jsonb,
  details jsonb,
  request jsonb
);

create index if not exists appointments_lawyer_date_idx on appointments (lawyer_id, scheduled_date, scheduled_time);
create index if not exists appointments_status_idx on appointments (status);
create index if not exists appointment_history_created_idx on appointment_history (created_at desc);
create index if not exists payment_requests_status_idx on payment_requests (status, requested_at desc);
create index if not exists payment_requests_lawyer_idx on payment_requests (lawyer_id, requested_at desc);
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);

create unique index if not exists appointments_no_double_booking_idx
on appointments (lawyer_id, scheduled_date, scheduled_time)
where status <> 'cancelado' and lawyer_id is not null and scheduled_date is not null and scheduled_time is not null;
