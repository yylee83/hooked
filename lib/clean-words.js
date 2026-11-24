// Hooked keeps reviews, replies, send notes and list titles clean. The list of words, and the check itself, live in
// the database (banned_words, supabase/migrations/20261124180000_banned_words.sql), so nothing can skip it. This turns
// its refusal into a short note for the person writing.

import { supabase } from "./supabase/client";

export const CLEAN_CODE = "HKW01";

/** The note to show for a save the database refused over a word, or null for any other error. */
export function cleanWordsMessage(error) {
  if (error?.code !== CLEAN_CODE) return null;
  return error.details ? `Please edit out “${error.details}”. Hooked keeps it clean.` : "Please edit that. Hooked keeps it clean.";
}

/** Checks text before it's kept on a signed-out browser (it goes to the account later). Throws the same note. */
export async function checkCleanWords(text, context = "") {
  if (!text?.trim()) return;
  const db = supabase();
  if (!db) return;
  const { data } = await db.rpc("banned_word_in", { txt: text, context }).then((r) => r, () => ({}));
  if (data) throw cleanError(data);
}

function cleanError(word) {
  const e = new Error(`Please edit out “${word}”. Hooked keeps it clean.`);
  e.code = CLEAN_CODE;
  e.details = word;
  return e;
}
