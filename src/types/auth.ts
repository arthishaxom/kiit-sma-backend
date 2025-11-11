import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthUser = {
	id: string;
	role: string;
	email: string;
	full_name: string;
	roll_no: string | null;
	avatar_url: string | null;
};

export type Variables = {
	supabase: SupabaseClient;
	user: AuthUser;
};
