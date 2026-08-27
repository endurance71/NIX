import { assertEquals } from 'jsr:@std/assert@1';
import {
  TEXT_REPORTS_ENABLED,
  statusForRpcError,
  validateReportPayload,
} from './contract.ts';

Deno.test('rejects empty, conflicting and oversized report payloads', () => {
  assertEquals(validateReportPayload({}).ok, false);
  assertEquals(validateReportPayload({ reason: 'not-a-reason', reportedUserId: 'u' }).ok, false);
  assertEquals(
    validateReportPayload({
      reason: 'spam',
      nixId: 'nix-1',
      textMessageId: 'text-1',
    }),
    { ok: false, status: 400, error: 'A report can target only one item' }
  );
  assertEquals(
    validateReportPayload({
      reason: 'spam',
      nixId: 'nix-1',
      reportedUserId: 'user-1',
    }),
    { ok: false, status: 400, error: 'A report can target only one item' }
  );
  assertEquals(
    validateReportPayload({
      reason: 'spam',
      reportedUserId: 'user-1',
      details: 'x'.repeat(501),
    }),
    { ok: false, status: 400, error: 'Details are too long' }
  );
});

Deno.test('accepts a text report without treating reportedUserId as a second target', () => {
  assertEquals(
    validateReportPayload({
      reason: 'harassment',
      textMessageId: 'text-1',
      reportedUserId: 'sender-1',
    }),
    {
      ok: true,
      value: {
        reason: 'harassment',
        nixId: null,
        textMessageId: 'text-1',
        reportedUserId: 'sender-1',
        details: null,
      },
    }
  );
});

Deno.test('maps RPC errors to closed HTTP statuses', () => {
  assertEquals(statusForRpcError('Authentication required'), 401);
  assertEquals(statusForRpcError('Report rate limit exceeded'), 429);
  assertEquals(statusForRpcError('Message is not reportable'), 403);
  assertEquals(statusForRpcError('User is not reportable'), 403);
  assertEquals(statusForRpcError('Invalid legacy reported user'), 400);
  assertEquals(statusForRpcError('Invalid report target'), 400);
  assertEquals(TEXT_REPORTS_ENABLED, true);
  assertEquals(
    validateReportPayload({ reason: 'spam', textMessageId: 'text-1' }, { textReportsEnabled: false }),
    { ok: false, status: 503, error: 'Text reports are temporarily unavailable' }
  );
  assertEquals(
    validateReportPayload({ reason: 'spam', reportedUserId: 'user-1' }, { textReportsEnabled: false }).ok,
    true
  );
});
