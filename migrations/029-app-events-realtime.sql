-- Phase 3.2: Publish app_events to Supabase realtime so web/mobile clients
-- can subscribe to live events instead of polling. Onboarding uses this to
-- fill week-progress dots as `program.saved` events arrive.

ALTER PUBLICATION supabase_realtime ADD TABLE app_events;
