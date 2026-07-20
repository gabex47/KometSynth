-- Owner account requested for username-based SynthNet authentication.
-- The PIN is stored only as a bcrypt cost-12 hash.
insert into public.accounts (
  id,
  username,
  pin_hash,
  account_type,
  notes,
  disabled,
  login_attempts,
  locked_until
)
values (
  '202f8aff-fc1a-4bc0-be5c-e5b72e1c9fc7'::uuid,
  'kidrian',
  '$2b$12$GKGXmJybXaL95.4DwSN7eOGzOZ2lghCsaUIUoFsLOwC/737NdfJzO',
  'owner',
  'Owner account',
  false,
  0,
  null
)
on conflict (username) do update
set pin_hash = excluded.pin_hash,
    account_type = 'owner',
    disabled = false,
    login_attempts = 0,
    locked_until = null,
    notes = excluded.notes;
