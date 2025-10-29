import type { AuthUser, SupabaseClient } from "@supabase/supabase-js";

export type Variables = {
	supabase: SupabaseClient;
	user: AuthUser;
};
