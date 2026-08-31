import { assertEquals } from 'jsr:@std/assert@1';
import {
  ignoredContentTargetIds,
  readAdminAction,
  readReportId,
  statusForRemoveRpcError,
} from './contract.ts';

Deno.test('remove is a valid admin action', () => {
  assertEquals(readAdminAction({ action: 'remove' }), 'remove');
  assertEquals(readAdminAction({ action: 'list' }), 'list');
  assertEquals(readAdminAction({ action: 'wipe' }), null);
});

Deno.test('remove uses only reportId and ignores content UUIDs from the client', () => {
  const body = {
    action: 'remove',
    reportId: 'd5000000-0000-4000-8000-000000000001',
    nixId: 'should-be-ignored',
    textMessageId: 'also-ignored',
  };
  assertEquals(readReportId(body), 'd5000000-0000-4000-8000-000000000001');
  assertEquals(ignoredContentTargetIds(body), ['nixId', 'textMessageId']);
});

Deno.test('remove without reportId is rejected', () => {
  assertEquals(readReportId({ action: 'remove', nixId: 'foreign-nix' }), null);
  assertEquals(readReportId({ action: 'remove', reportId: '   ' }), null);
});

Deno.test('remove RPC not-found maps to 404 and other errors to 400', () => {
  assertEquals(statusForRemoveRpcError('Report not found'), 404);
  assertEquals(statusForRemoveRpcError('invalid input syntax'), 400);
});
