import { checkinRowSchema, missedOfferRowSchema, coachSettingsRowSchema } from '../validation'

// Chad's weekly check-in rows, read through the user's own client. RLS lets a user select only
// their own rows and nothing else; every write goes through /api/checkin (see src/lib/checkin.js).
//
// Unlike most repositories these return null on a failed read, never an empty list: after a 503 the
// app has to tell "nothing there" from "could not look", or it would show a made-up result.

const CHECKIN_COLUMNS = 'id, review_week, target_week, status, recap, changes, result, expires_at, decided_at, created_at'
const OFFER_COLUMNS = 'id, week, from_day, to_day, status, expires_at, created_at'

function parseRows(schema, rows, label) {
  const out = []
  for (const row of rows || []) {
    const parsed = schema.safeParse(row)
    if (parsed.success) out.push(parsed.data)
    else console.error(`Skipping a malformed ${label} row:`, parsed.error.issues[0]?.message)
  }
  return out
}

export function createCheckinsRepo(supabase) {
  /** The newest check-ins, newest first. null when the read failed. */
  const getRecentCheckins = async (userId, limit = 5) => {
    if (!supabase || !userId) return null
    const { data, error } = await supabase
      .from('chad_checkins')
      .select(CHECKIN_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('Error fetching check-ins:', error)
      return null
    }
    return parseRows(checkinRowSchema, data, 'check-in')
  }

  /** The newest missed-day offers, newest first. null when the read failed. */
  const getRecentMissedOffers = async (userId, limit = 5) => {
    if (!supabase || !userId) return null
    const { data, error } = await supabase
      .from('chad_missed_offers')
      .select(OFFER_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.error('Error fetching missed-day offers:', error)
      return null
    }
    return parseRows(missedOfferRowSchema, data, 'missed-day offer')
  }

  /** The user's own switch: true, false, or null when the read failed. No row means off. */
  const getWeeklyCheckinSetting = async (userId) => {
    if (!supabase || !userId) return null
    const { data, error } = await supabase
      .from('chad_coach_settings')
      .select('weekly_checkin')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.error('Error fetching check-in setting:', error)
      return null
    }
    if (!data) return false
    const parsed = coachSettingsRowSchema.safeParse(data)
    return parsed.success ? parsed.data.weekly_checkin : null
  }

  return { getRecentCheckins, getRecentMissedOffers, getWeeklyCheckinSetting }
}
