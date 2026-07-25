import { supabase } from '../lib/supabase';

export async function reportCaptureAttempt(nixId: string): Promise<void> {
  const { error } = await supabase.rpc('report_capture_attempt', { p_nix_id: nixId });
  if (error) {
    console.warn('Failed to report capture attempt:', error.message);
  }
}
