create table if not exists app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into app_state (key, value)
values (
  'main',
  jsonb_build_object(
    'lawyers', '[]'::jsonb,
    'users', '[]'::jsonb,
    'appointments', '[]'::jsonb,
    'appointmentHistory', '[]'::jsonb,
    'auditLogs', '[]'::jsonb
  )
)
on conflict (key) do nothing;

-- Estrutura relacional preparada para uma migracao futura do app_state.
-- O servidor atual continua usando app_state para preservar compatibilidade.
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
  role text not null check (role in ('admin', 'recepcao', 'advogado')),
  lawyer_id text references lawyers(id) on delete set null,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists appointments (
  id text primary key,
  client_name text not null,
  client_phone text,
  notes text,
  lawyer_id text references lawyers(id) on delete set null,
  lawyer_name text,
  lawyer_room text,
  scheduled_date date,
  scheduled_time text,
  status text not null default 'aguardando',
  reception_requests jsonb,
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
create index if not exists audit_logs_created_idx on audit_logs (created_at desc);
