import { AGE_POLICY_VERSION } from '../lib/ageGate';
import { supabase } from '../lib/supabase';

export type ReportReason =
  | 'harassment'
  | 'hate'
  | 'sexual_content'
  | 'violence'
  | 'self_harm'
  | 'impersonation'
  | 'spam'
  | 'privacy'
  | 'illegal_content'
  | 'other';

export type BlockedUser = {
  blocked_user_id: string;
  username: string | null;
  avatar_storage_path: string | null;
  avatar_emoji: string | null;
  blocked_at: string;
};

export type MyContentReport = {
  id: string;
  reported_user_id: string | null;
  reported_username: string | null;
  reason: ReportReason;
  status: 'open' | 'in_review' | 'escalated' | 'actioned' | 'dismissed' | 'evidence_failed';
  priority: 'critical' | 'normal';
  created_at: string;
  resolved_at: string | null;
};

export async function hasCurrentAgeAttestation(): Promise<boolean> {
  const { data, error } = await supabase
    .from('age_attestations')
    .select('policy_version')
    .eq('policy_version', AGE_POLICY_VERSION)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function recordCurrentAgeAttestation(): Promise<void> {
  const { error } = await supabase.rpc('record_age_attestation', { p_policy_version: AGE_POLICY_VERSION });
  if (error) throw error;
}

async function invokeSafetyFunction(name: 'report-content' | 'block-user', body: Record<string, string | undefined>) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export async function reportNix(nixId: string, reason: ReportReason, details?: string): Promise<string> {
  const data = await invokeSafetyFunction('report-content', { nixId, reason, details });
  return String(data.reportId);
}

export async function blockUser(userId: string): Promise<void> {
  await invokeSafetyFunction('block-user', { blockedUserId: userId });
}

export async function unblockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', { p_blocked_user_id: userId });
  if (error) throw error;
}

export async function listBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc('list_blocked_users');
  if (error) throw error;
  return (data ?? []) as BlockedUser[];
}

export async function listMyContentReports(): Promise<MyContentReport[]> {
  const { data, error } = await supabase.rpc('list_my_content_reports');
  if (error) throw error;
  return (data ?? []) as MyContentReport[];
}
