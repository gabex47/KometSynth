-- Initial owner. This source contains only a bcrypt cost-12 hash; the PIN is never
-- stored in plaintext. Rotate the PIN immediately after first production sign-in.
insert into public.accounts (
  id,
  username,
  pin_hash,
  account_type,
  notes
)
values (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'lordsynth7000',
  '$2b$12$7sdj1TqOWBnmVLxgzFd64OCc3X42TNfJvIgdAGqfq8dE9kflaXcOm',
  'owner',
  'Initial SynthNet owner. Rotate PIN after deployment.'
)
on conflict (username) do update
set account_type = 'owner',
    disabled = false;
