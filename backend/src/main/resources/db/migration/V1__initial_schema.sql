-- PaperTrail initial schema.
-- Each account is one household. Every owned row carries user_id, and composite foreign keys
-- (child.ref_id, child.user_id) -> parent(id, user_id) make cross-household references impossible
-- at the database level, independent of application checks.

create table users (
    id                          uuid primary key default gen_random_uuid(),
    email                       varchar(254) not null,
    password_hash               varchar(100) not null,
    display_name                varchar(80)  not null,
    currency                    varchar(3)   not null default 'EUR',
    timezone                    varchar(64)  not null default 'UTC',
    default_reminder_lead_days  integer      not null default 3,
    created_at                  timestamptz  not null default now(),
    updated_at                  timestamptz  not null default now(),
    constraint ck_users_currency check (currency ~ '^[A-Z]{3}$'),
    constraint ck_users_reminder_lead check (default_reminder_lead_days between 0 and 60)
);
create unique index uq_users_email on users (lower(email));

-- Opaque refresh tokens (stored as SHA-256 hashes). Rotated on every use; a family groups one login session.
create table refresh_tokens (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid         not null references users (id) on delete cascade,
    token_hash      varchar(64)  not null,
    family_id       uuid         not null,
    expires_at      timestamptz  not null,
    created_at      timestamptz  not null default now(),
    revoked_at      timestamptz,
    revoked_reason  varchar(20),
    user_agent      varchar(255),
    constraint uq_refresh_tokens_hash unique (token_hash),
    constraint ck_refresh_tokens_reason check (revoked_reason in ('ROTATED', 'LOGOUT', 'REUSE_DETECTED', 'PASSWORD_CHANGED'))
);
create index ix_refresh_tokens_user on refresh_tokens (user_id);
create index ix_refresh_tokens_family on refresh_tokens (family_id);

create table categories (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid         not null references users (id) on delete cascade,
    name        varchar(60)  not null,
    created_at  timestamptz  not null default now(),
    updated_at  timestamptz  not null default now(),
    constraint uq_categories_id_user unique (id, user_id)
);
create unique index uq_categories_user_name on categories (user_id, lower(name));

create table providers (
    id                   uuid primary key default gen_random_uuid(),
    user_id              uuid          not null references users (id) on delete cascade,
    name                 varchar(120)  not null,
    default_category_id  uuid,
    created_at           timestamptz   not null default now(),
    updated_at           timestamptz   not null default now(),
    constraint uq_providers_id_user unique (id, user_id),
    constraint fk_providers_default_category foreign key (default_category_id, user_id)
        references categories (id, user_id) on delete set null (default_category_id)
);
create unique index uq_providers_user_name on providers (user_id, lower(name));

create table recurring_bill_schedules (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid           not null references users (id) on delete cascade,
    title               varchar(160)   not null,
    provider_id         uuid           not null,
    category_id         uuid           not null,
    amount              numeric(12, 2) not null,
    currency            varchar(3)     not null,
    frequency           varchar(10)    not null,
    start_date          date           not null,
    billing_day         integer        not null,
    reminder_lead_days  integer        not null default 3,
    active              boolean        not null default true,
    notes               varchar(2000),
    created_at          timestamptz    not null default now(),
    updated_at          timestamptz    not null default now(),
    version             bigint         not null default 0,
    constraint uq_schedules_id_user unique (id, user_id),
    constraint ck_schedules_amount check (amount >= 0),
    constraint ck_schedules_currency check (currency ~ '^[A-Z]{3}$'),
    constraint ck_schedules_frequency check (frequency in ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
    constraint ck_schedules_billing_day check (billing_day between 1 and 31),
    constraint ck_schedules_reminder_lead check (reminder_lead_days between 0 and 60),
    constraint fk_schedules_provider foreign key (provider_id, user_id) references providers (id, user_id),
    constraint fk_schedules_category foreign key (category_id, user_id) references categories (id, user_id)
);
create index ix_schedules_user on recurring_bill_schedules (user_id);
create index ix_schedules_active on recurring_bill_schedules (active) where active;

create table bills (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid           not null references users (id) on delete cascade,
    title               varchar(160)   not null,
    provider_id         uuid           not null,
    category_id         uuid           not null,
    amount              numeric(12, 2) not null,
    currency            varchar(3)     not null,
    due_date            date           not null,
    status              varchar(10)    not null default 'UNPAID',
    paid_date           date,
    reminder_lead_days  integer        not null default 3,
    notes               varchar(2000),
    schedule_id         uuid,
    created_at          timestamptz    not null default now(),
    updated_at          timestamptz    not null default now(),
    version             bigint         not null default 0,
    constraint uq_bills_id_user unique (id, user_id),
    constraint ck_bills_amount check (amount >= 0),
    constraint ck_bills_currency check (currency ~ '^[A-Z]{3}$'),
    constraint ck_bills_status check (status in ('UNPAID', 'PAID')),
    -- OVERDUE is never stored: it is derived from an unpaid bill's due date in the account timezone.
    constraint ck_bills_paid_date check ((status = 'PAID') = (paid_date is not null)),
    constraint ck_bills_reminder_lead check (reminder_lead_days between 0 and 60),
    constraint fk_bills_provider foreign key (provider_id, user_id) references providers (id, user_id),
    constraint fk_bills_category foreign key (category_id, user_id) references categories (id, user_id),
    constraint fk_bills_schedule foreign key (schedule_id, user_id)
        references recurring_bill_schedules (id, user_id) on delete set null (schedule_id)
);
create index ix_bills_user_due on bills (user_id, due_date);
create index ix_bills_user_unpaid_due on bills (user_id, due_date) where status = 'UNPAID';
create index ix_bills_user_paid_date on bills (user_id, paid_date) where status = 'PAID';
create index ix_bills_provider on bills (provider_id);
create index ix_bills_category on bills (category_id);
create index ix_bills_schedule on bills (schedule_id);

-- Generation ledger for recurring schedules. One row per schedule per billing cycle (month).
-- The unique constraint makes repeated or concurrent job runs idempotent, and the ledger row survives
-- if the user deletes the generated bill, so a deleted instance is never silently re-created.
create table schedule_occurrences (
    id               uuid primary key default gen_random_uuid(),
    schedule_id      uuid        not null references recurring_bill_schedules (id) on delete cascade,
    cycle_month      date        not null,
    occurrence_date  date        not null,
    bill_id          uuid        references bills (id) on delete set null,
    generated_at     timestamptz not null default now(),
    constraint uq_schedule_occurrences_cycle unique (schedule_id, cycle_month),
    constraint ck_schedule_occurrences_cycle check (extract(day from cycle_month) = 1)
);
create index ix_schedule_occurrences_bill on schedule_occurrences (bill_id);

-- Every uploaded statement is kept. A replacement upload adds version n+1; nothing is overwritten.
create table bill_document_versions (
    id                 uuid primary key default gen_random_uuid(),
    bill_id            uuid          not null,
    user_id            uuid          not null,
    version_number     integer       not null,
    original_filename  varchar(255)  not null,
    content_type       varchar(100)  not null,
    size_bytes         bigint        not null,
    sha256             varchar(64)   not null,
    storage_key        varchar(512)  not null,
    uploaded_at        timestamptz   not null default now(),
    constraint uq_document_versions_bill_version unique (bill_id, version_number),
    constraint uq_document_versions_storage_key unique (storage_key),
    constraint ck_document_versions_number check (version_number > 0),
    constraint ck_document_versions_size check (size_bytes > 0),
    constraint ck_document_versions_type check (content_type in ('application/pdf', 'image/jpeg', 'image/png')),
    constraint fk_document_versions_bill foreign key (bill_id, user_id) references bills (id, user_id) on delete cascade
);
create index ix_document_versions_user_uploaded on bill_document_versions (user_id, uploaded_at desc);

create table notifications (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid          not null references users (id) on delete cascade,
    bill_id         uuid,
    type            varchar(20)   not null,
    reference_date  date          not null,
    title           varchar(200)  not null,
    body            varchar(500)  not null,
    created_at      timestamptz   not null default now(),
    read_at         timestamptz,
    constraint ck_notifications_type check (type in ('BILL_DUE_SOON', 'BILL_OVERDUE')),
    -- One reminder of each kind per bill per due date: re-running the job never duplicates,
    -- while moving a bill's due date legitimately allows a fresh reminder.
    constraint uq_notifications_dedup unique (bill_id, type, reference_date),
    constraint fk_notifications_bill foreign key (bill_id, user_id) references bills (id, user_id) on delete cascade
);
create index ix_notifications_user_created on notifications (user_id, created_at desc);
create index ix_notifications_user_unread on notifications (user_id) where read_at is null;
