import { createClient } from "@supabase/supabase-js";

// CodeTrack stores indexed Base Builder Code transaction stats in Supabase.
// These are public read keys (the same anon/publishable key the CodeTrack
// frontend ships), so reading them here is safe — the data is already public.
const CODETRACK_SUPABASE_URL = process.env.CODETRACK_SUPABASE_URL;
const CODETRACK_SUPABASE_ANON_KEY = process.env.CODETRACK_SUPABASE_ANON_KEY;

if (!CODETRACK_SUPABASE_URL || !CODETRACK_SUPABASE_ANON_KEY) {
  console.warn(
    "[warn] CODETRACK_SUPABASE_URL / CODETRACK_SUPABASE_ANON_KEY are not set. /leaderboard will fail until you set them in .env",
  );
}

const supabase = createClient(
  CODETRACK_SUPABASE_URL,
  CODETRACK_SUPABASE_ANON_KEY,
);

/**
 * Fetch the top Base Builder Codes by transaction count.
 *
 * Calls the `get_top_builders` Postgres RPC (the same one the CodeTrack
 * frontend uses) and normalizes the rows into a clean
 * `[{ code, tx_count }]` shape.
 *
 * @param {number} limit How many builders to return.
 * @returns {Promise<Array<{ code: string, tx_count: number }>>}
 */
export async function getTopBuilders(limit) {
  const { data, error } = await supabase.rpc("get_top_builders", {
    limit_count: limit,
  });

  if (error) {
    throw new Error(`Supabase get_top_builders failed: ${error.message}`);
  }

  return (data || []).map((row) => ({
    code: row.code,
    tx_count: Number(row.tx_count),
  }));
}
