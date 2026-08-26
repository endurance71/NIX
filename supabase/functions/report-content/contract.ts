export const REPORT_REASONS = new Set([
  'sexual_content',
  'violence',
  'self_harm',
  'harassment',
  'hate',
  'impersonation',
  'spam',
  'privacy',
  'illegal_content',
  'other',
]);

/** Fail-closed switch: never restore the pre-auth service_role text fetch. */
export const TEXT_REPORTS_ENABLED = true;

export type ReportPayload = {
  reason?: string;
  nixId?: string;
  textMessageId?: string;
  reportedUserId?: string;
  details?: string;
};

export type ValidatedReportPayload = {
  reason: string;
  nixId: string | null;
  textMessageId: string | null;
  reportedUserId: string | null;
  details: string | null;
};

export type PayloadValidation =
  | { ok: true; value: ValidatedReportPayload }
  | { ok: false; status: 400 | 503; error: string };

function asOptionalId(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function validateReportPayload(
  payload: ReportPayload,
  options: { textReportsEnabled?: boolean } = {}
): PayloadValidation {
  const textReportsEnabled = options.textReportsEnabled ?? TEXT_REPORTS_ENABLED;
  if (!payload.reason || !REPORT_REASONS.has(payload.reason)) {
    return { ok: false, status: 400, error: 'Invalid report reason' };
  }
  if (payload.details && payload.details.length > 500) {
    return { ok: false, status: 400, error: 'Details are too long' };
  }

  const nixId = asOptionalId(payload.nixId);
  const textMessageId = asOptionalId(payload.textMessageId);
  const reportedUserId = asOptionalId(payload.reportedUserId);

  if (!nixId && !textMessageId && !reportedUserId) {
    return { ok: false, status: 400, error: 'A message or user is required' };
  }
  if (nixId && textMessageId) {
    return { ok: false, status: 400, error: 'A report can target only one item' };
  }
  if (nixId && reportedUserId) {
    return { ok: false, status: 400, error: 'A report can target only one item' };
  }
  if (!textReportsEnabled && textMessageId) {
    return { ok: false, status: 503, error: 'Text reports are temporarily unavailable' };
  }

  return {
    ok: true,
    value: {
      reason: payload.reason,
      nixId,
      textMessageId,
      reportedUserId,
      details: payload.details?.trim() || null,
    },
  };
}

export function statusForRpcError(message: string): 400 | 401 | 403 | 429 {
  const normalized = message.toLowerCase();
  if (normalized.includes('authentication required')) return 401;
  if (normalized.includes('rate limit')) return 429;
  if (normalized.includes('not reportable')) return 403;
  return 400;
}
