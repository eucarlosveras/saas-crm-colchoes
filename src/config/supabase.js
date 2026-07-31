// Cliente Supabase
import { supabase } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants.js';

export const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export { supabase };
