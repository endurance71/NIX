import type { ReportReason } from '../../services/safetyService';

export const CHAT_PEER_REPORT_REASONS = [
  'harassment',
  'hate',
  'sexual_content',
  'child_safety',
  'violence',
  'self_harm',
  'impersonation',
  'spam',
  'privacy',
  'illegal_content',
  'other',
] as const satisfies readonly ReportReason[];
