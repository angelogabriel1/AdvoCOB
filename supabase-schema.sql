create table if not exists app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into app_state (key, value)
values ('main', '{"lawyers":[],"users":[],"appointments":[]}'::jsonb)
on conflict (key) do nothing;
