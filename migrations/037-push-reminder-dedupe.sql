-- Slice 9.4: one reminder per user per day.
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS last_reminded_on DATE;
