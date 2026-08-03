// MonoLift — Supabase client
// The publishable key is safe to expose in client-side code by design.
const SUPABASE_URL = "https://oqajekhazitovcjlosxj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_H4_nr-Zn_EOManvs156_nw_ayd-vbns";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
