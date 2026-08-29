export type AdminAction = 'list' | 'decide' | 'appeal' | 'remove';

export function readAdminAction(body: Record<string, unknown>): AdminAction | null {
  const action = body.action;
  if (action === 'list' || action === 'decide' || action === 'appeal' || action === 'remove') {
    return action;
  }
  return null;
}

export function readReportId(body: Record<string, unknown>): string | null {
  const value = body.reportId;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

/** Content UUIDs from the operator payload are untrusted and unused. */
export function ignoredContentTargetIds(body: Record<string, unknown>): string[] {
  const ignored: string[] = [];
  for (const key of ['nixId', 'nix_id', 'textMessageId', 'text_message_id']) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) ignored.push(key);
  }
  return ignored;
}

export function statusForRemoveRpcError(message: string): number {
  if (message.includes('not found')) return 404;
  return 400;
}
