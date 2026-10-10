import { assertEquals } from 'jsr:@std/assert@1';
import {
  DATA_EXPORT_ANALYTICS_PREFERENCE_COLUMNS,
  DATA_EXPORT_REAUTH_MAX_AGE_SECONDS,
  isExportReadyForDownload,
  isRecentAuthentication,
  latestAuthenticationTime,
  partitionExportNixes,
  blockedPeerIdsFor,
} from './data-export.ts';

Deno.test('data export schema uses the consent fields present in the roadmap migration', () => {
  assertEquals(
    DATA_EXPORT_ANALYTICS_PREFERENCE_COLUMNS,
    'enabled,policy_version,updated_at'
  );
  assertEquals(DATA_EXPORT_ANALYTICS_PREFERENCE_COLUMNS.includes('consented_at'), false);
});

Deno.test('data export download requires authentication from the last ten minutes', () => {
  const now = 2_000_000;
  assertEquals(isRecentAuthentication(now - DATA_EXPORT_REAUTH_MAX_AGE_SECONDS, now), true);
  assertEquals(isRecentAuthentication(now - DATA_EXPORT_REAUTH_MAX_AGE_SECONDS - 1, now), false);
  assertEquals(isRecentAuthentication(now + 1, now), false);
  assertEquals(isRecentAuthentication(null, now), false);
});

Deno.test('data export download rejects missing, failed and expired jobs', () => {
  const now = Date.parse('2026-07-29T12:00:00.000Z');
  assertEquals(isExportReadyForDownload(null, now), false);
  assertEquals(
    isExportReadyForDownload({
      status: 'failed',
      storage_path: 'user/export.zip',
      expires_at: '2026-07-30T12:00:00.000Z',
    }, now),
    false
  );
  assertEquals(
    isExportReadyForDownload({
      status: 'ready',
      storage_path: 'user/export.zip',
      expires_at: '2026-07-29T12:00:00.000Z',
    }, now),
    false
  );
  assertEquals(
    isExportReadyForDownload({
      status: 'ready',
      storage_path: 'user/export.zip',
      expires_at: '2026-07-30T12:00:00.000Z',
    }, now),
    true
  );
});

Deno.test('reauthentication time comes from amr, not the refreshable iat', () => {
  assertEquals(latestAuthenticationTime({ iat: 2_000_000 }), null);
  assertEquals(
    latestAuthenticationTime({
      iat: 2_000_000,
      amr: [{ method: 'password', timestamp: 1_000 }, { method: 'oauth', timestamp: 1_500 }],
    }),
    1_500,
  );
  assertEquals(latestAuthenticationTime({ amr: 'password' }), null);
});

Deno.test('export keeps unviewed received media as metadata and skips blocked peers', () => {
  const rows = [
    { id: 'sent', sender_id: 'me', receiver_id: 'friend' },
    { id: 'received', sender_id: 'friend', receiver_id: 'me' },
    { id: 'blocked', sender_id: 'blocked', receiver_id: 'me' },
  ];
  const blocked = blockedPeerIdsFor('me', [{ blocker_id: 'blocked', blocked_id: 'me' }]);
  const { withMedia, metadataOnly } = partitionExportNixes(rows, 'me', blocked);
  assertEquals(withMedia.map((row) => row.id), ['sent']);
  assertEquals(metadataOnly.map((row) => row.id), ['received']);
});
