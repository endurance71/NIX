import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hasServiceRoleBearer } from '../_shared/service-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase environment variables' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!hasServiceRoleBearer(req, serviceRoleKey)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    let totalCleaned = 0;
    const batchSize = 100;

    // Pobierz z nix_cleanup_queue
    const { data: queueItems, error: queueError } = await serviceClient
      .from('nix_cleanup_queue')
      .select('nix_id, receiver_id, media_path, attempt_count')
      .lte('next_attempt_at', new Date().toISOString())
      .limit(batchSize);

    if (queueError) throw queueError;

    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ ok: true, cleanedCount: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nixIds = queueItems.map((item) => item.nix_id);
    const { data: nixes, error: nixReadError } = await serviceClient
      .from('nixes')
      .select('id, receiver_id, media_path, asset_id')
      .in('id', nixIds);
    if (nixReadError) throw nixReadError;
    const nixesById = new Map((nixes ?? []).map((nix) => [nix.id, nix]));

    const cleanupResults = await Promise.all(queueItems.map(async (item) => {
      try {
        const nix = nixesById.get(item.nix_id);
        if (!nix) {
          await serviceClient.from('nix_cleanup_queue').delete().eq('nix_id', item.nix_id);
          return true;
        }
        if (nix.asset_id) {
          const { data: archiveData, error: archiveError } = await serviceClient.rpc(
            'archive_shared_media_nix',
            {
              p_nix_id: item.nix_id,
              p_receiver_id: item.receiver_id,
            }
          );
          const archive = Array.isArray(archiveData) ? archiveData[0] : archiveData;
          if (archiveError || !archive) {
            throw archiveError ?? new Error('SHARED_ARCHIVE_FAILED');
          }
          if (archive.should_delete) {
            const { error: storageError } = await serviceClient.storage
              .from('media-vault')
              .remove([archive.storage_path]);
            if (storageError) throw storageError;
            await serviceClient
              .from('media_assets')
              .update({ status: 'deleted', deleted_at: new Date().toISOString() })
              .eq('id', archive.asset_id);
          }
        } else {
          const { error: storageError } = await serviceClient.storage
            .from('media-vault')
            .remove([item.media_path]);
          if (storageError) throw storageError;
          const { error: nixUpdateError } = await serviceClient
            .from('nixes')
            .update({ status: 'cleaned', cleaned_at: new Date().toISOString() })
            .eq('id', item.nix_id);
          if (nixUpdateError) throw nixUpdateError;
        }
        await serviceClient.from('nix_cleanup_queue').delete().eq('nix_id', item.nix_id);
        return true;
      } catch (itemError) {
        const message = itemError instanceof Error ? itemError.message : 'Unknown cleanup error';
        await serviceClient
          .from('nix_cleanup_queue')
          .update({
            last_error: message,
            next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
            attempt_count: (item.attempt_count || 0) + 1,
          })
          .eq('nix_id', item.nix_id);
        return false;
      }
    }));
    totalCleaned += cleanupResults.filter(Boolean).length;

    return new Response(JSON.stringify({ ok: true, cleanedCount: totalCleaned }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('cleanup-nix-due error:', error);
    return new Response(JSON.stringify({ error: error.message ?? 'Unknown cleanup error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
