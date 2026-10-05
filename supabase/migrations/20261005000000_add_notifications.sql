create table if not exists public."Notifications" (
    id text primary key,
    "userId" text not null,
    message text,
    "messageEn" text,
    read boolean not null default false,
    "createdAt" timestamp with time zone not null default now(),
    raw_data jsonb
);

create index if not exists notifications_user_created_idx
    on public."Notifications" ("userId", "createdAt" desc);
