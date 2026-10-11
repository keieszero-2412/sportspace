import { supabase } from '../supabase';
import { createMatchFeed } from './matchFeed.js';

export const publicMatchFeed = createMatchFeed(supabase);
