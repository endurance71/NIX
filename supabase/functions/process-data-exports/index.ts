import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.110.5';
import {
  BlobReader,
  TextReader,
  ZipWriter,
} from 'npm:@zip.js/zip.js@2.7.57';
import { json } from '../_shared/http.ts';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';
import { DATA_EXPORT_ANALYTICS_PREFERENCE_COLUMNS } from '../_shared/data-export.ts';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type ExportJob = { id: string; user_id: string };
type ManifestFile = { path: string; bytes: number; sha256: string };

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function digest(bytes: Uint8Array) {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  return hex(await crypto.subtle.digest('SHA-256', buffer));
}

function asJsonBytes(value: JsonValue) {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

async function processJob(
  service: SupabaseClient,
  job: ExportJob
) {
  const startedAt = new Date().toISOString();
  const { data: claimed } = await service
    .from('data_export_jobs')
    .update({ status: 'processing', started_at: startedAt, updated_at: startedAt })
    .eq('id', job.id)
    .eq('status', 'queued')
    .select('id')
    .maybeSingle();
  if (!claimed) return false;

  const userId = job.user_id;
  const archivePath = `${userId}/${job.id}.zip`;
  try {
    const [
      profile,
      friendships,
      invites,
      blocks,
      reports,
      textMessages,
      nixes,
      analyticsPreference,
      notificationPreference,
      activationState,
      installations,
    ] = await Promise.all([
      service.from('profiles')
        .select('id,username,display_name,avatar_storage_path,avatar_emoji,is_private,created_at')
        .eq('id', userId).maybeSingle(),
      service.from('friendships')
        .select('id,user_id,friend_id,status,created_at')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`),
      service.from('friend_invites')
        .select('id,created_by,channel,expires_at,used_at,used_by,created_at')
        .eq('created_by', userId),
      service.from('user_blocks')
        .select('blocked_id,created_at')
        .eq('blocker_id', userId),
      service.from('content_reports')
        .select('id,reported_user_id,nix_id,reason,details,status,priority,created_at,acknowledged_at,resolved_at')
        .eq('reporter_id', userId),
      service.from('text_messages')
        .select('id,sender_id,receiver_id,body,created_at,expires_at,client_message_id')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .gt('expires_at', new Date().toISOString()),
      service.from('nixes')
        .select('id,sender_id,receiver_id,media_path,media_type,created_at,status,view_duration_sec,playback_duration_ms')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .eq('status', 'sent')
        .is('cleaned_at', null),
      service.from('product_analytics_preferences').select(DATA_EXPORT_ANALYTICS_PREFERENCE_COLUMNS).eq('user_id', userId).maybeSingle(),
      service.from('notification_preferences').select('messages_enabled,reactions_enabled,friends_enabled,updated_at').eq('user_id', userId).maybeSingle(),
      service.from('user_activation_state').select('skipped_at,completed_at,dismissed_at,last_shown_at,updated_at').eq('user_id', userId).maybeSingle(),
      service.from('app_installations').select('device_name,system_version,app_version,locale,last_seen_at,revoked_at').eq('user_id', userId),
    ]);
    const queryErrors = [
      profile.error, friendships.error, invites.error, blocks.error, reports.error,
      textMessages.error, nixes.error, analyticsPreference.error, notificationPreference.error,
      activationState.error, installations.error,
    ].filter(Boolean);
    if (queryErrors.length) throw queryErrors[0];

    let archiveBytes = 0;
    const stream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        archiveBytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const upload = service.storage.from('account-exports').upload(archivePath, stream.readable, {
      contentType: 'application/zip',
      upsert: false,
    });
    const zip = new ZipWriter(stream.writable);
    const manifestFiles: ManifestFile[] = [];

    const addJson = async (path: string, value: JsonValue) => {
      const bytes = asJsonBytes(value);
      await zip.add(path, new TextReader(new TextDecoder().decode(bytes)));
      manifestFiles.push({ path, bytes: bytes.byteLength, sha256: await digest(bytes) });
    };
    await addJson('account/profile.json', (profile.data ?? null) as JsonValue);
    await addJson('account/settings.json', {
      analytics: analyticsPreference.data ?? null,
      notifications: notificationPreference.data ?? null,
      activation: activationState.data ?? null,
      installations: installations.data ?? [],
    } as JsonValue);
    await addJson('social/friendships.json', (friendships.data ?? []) as JsonValue);
    await addJson('social/invites.json', (invites.data ?? []) as JsonValue);
    await addJson('social/blocks.json', (blocks.data ?? []) as JsonValue);
    await addJson('safety/my-reports.json', (reports.data ?? []) as JsonValue);
    await addJson('messages/text-messages.json', (textMessages.data ?? []) as JsonValue);

    const nixMetadata: JsonValue[] = [];
    for (const raw of nixes.data ?? []) {
      const row = raw as {
        id: string;
        media_path: string;
        media_type: string;
        [key: string]: unknown;
      };
      const extension = row.media_type === 'video' ? 'mp4' : 'jpg';
      const target = `media/nixes/${row.id}.${extension}`;
      const { data: media, error } = await service.storage.from('media-vault').download(row.media_path);
      if (!error && media) {
        const bytes = new Uint8Array(await media.arrayBuffer());
        await zip.add(target, new BlobReader(new Blob([bytes], { type: media.type })));
        manifestFiles.push({ path: target, bytes: bytes.byteLength, sha256: await digest(bytes) });
        const { media_path: _privatePath, ...safeMetadata } = row;
        nixMetadata.push({ ...(safeMetadata as JsonValue & object), archive_path: target } as JsonValue);
      }
    }
    await addJson('messages/nixes.json', nixMetadata);

    const avatarPath = (profile.data as { avatar_storage_path?: string | null } | null)?.avatar_storage_path;
    if (avatarPath) {
      const { data: avatar, error } = await service.storage.from('avatars').download(avatarPath);
      if (!error && avatar) {
        const bytes = new Uint8Array(await avatar.arrayBuffer());
        const target = 'media/avatar';
        await zip.add(target, new BlobReader(new Blob([bytes], { type: avatar.type })));
        manifestFiles.push({ path: target, bytes: bytes.byteLength, sha256: await digest(bytes) });
      }
    }

    const manifest = {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      export_id: job.id,
      files: manifestFiles,
    };
    const manifestBytes = asJsonBytes(manifest as JsonValue);
    await zip.add('manifest.json', new TextReader(new TextDecoder().decode(manifestBytes)));
    await zip.close();
    const { error: uploadError } = await upload;
    if (uploadError) throw uploadError;

    const completedAt = new Date();
    await service.from('data_export_jobs').update({
      status: 'ready',
      storage_path: archivePath,
      archive_size_bytes: archiveBytes,
      manifest_sha256: await digest(manifestBytes),
      completed_at: completedAt.toISOString(),
      expires_at: new Date(completedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      updated_at: completedAt.toISOString(),
      error_code: null,
    }).eq('id', job.id);
    return true;
  } catch (error) {
    console.error('Data export failed', job.id, error);
    await service.storage.from('account-exports').remove([archivePath]);
    await service.from('data_export_jobs').update({
      status: 'failed',
      error_code: 'EXPORT_BUILD_FAILED',
      updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', code: 'METHOD_NOT_ALLOWED' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'SERVER_CONFIG_MISSING', code: 'SERVER_CONFIG_MISSING' }, 500);
  if (!hasServiceRoleBearer(req, serviceKey)) return json({ error: 'AUTH_REQUIRED', code: 'AUTH_REQUIRED' }, 401);
  const service = createClient(url, serviceKey);

  const { data: expired } = await service
    .from('data_export_jobs')
    .select('id,storage_path')
    .eq('status', 'ready')
    .lte('expires_at', new Date().toISOString());
  const expiredPaths = (expired ?? []).flatMap((job) => job.storage_path ? [job.storage_path] : []);
  if (expiredPaths.length) await service.storage.from('account-exports').remove(expiredPaths);
  if (expired?.length) {
    await service.from('data_export_jobs')
      .update({ status: 'expired', storage_path: null, updated_at: new Date().toISOString() })
      .in('id', expired.map((job) => job.id));
  }

  const { data: queued, error } = await service
    .from('data_export_jobs')
    .select('id,user_id')
    .eq('status', 'queued')
    .order('requested_at')
    .limit(2);
  if (error) return json({ error: 'EXPORT_QUEUE_FAILED', code: 'EXPORT_QUEUE_FAILED' }, 500);
  let completed = 0;
  for (const job of (queued ?? []) as ExportJob[]) {
    if (await processJob(service, job)) completed += 1;
  }
  return json({ ok: true, claimed: queued?.length ?? 0, completed, expired: expired?.length ?? 0 });
});
