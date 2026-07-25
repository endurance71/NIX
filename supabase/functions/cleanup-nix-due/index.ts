import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    let totalCleaned = 0;
    const batchSize = 100;

    // Pobierz z nix_cleanup_queue
    const { data: queueItems, error: queueError } = await serviceClient
      .from('nix_cleanup_queue')
      .select('nix_id, media_path, attempt_count')
      .lte('next_attempt_at', new Date().toISOString())
      .limit(batchSize);

    if (queueError) throw queueError;

    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ ok: true, cleanedCount: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Przetwarzanie w pętli (dla S3 usunięcia)
    const mediaPathsToDelete = queueItems.flatMap((item) =>
      item.media_path ? [item.media_path] : []
    );
    const nixIdsToUpdate = queueItems.map((item) => item.nix_id);

    if (mediaPathsToDelete.length > 0) {
      const { error: storageError } = await serviceClient.storage
        .from('media-vault')
        .remove(mediaPathsToDelete);

      if (storageError) {
        await Promise.all(
          queueItems.map((item) =>
            serviceClient
              .from('nix_cleanup_queue')
              .update({
                last_error: storageError.message,
                next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
                attempt_count: (item.attempt_count || 0) + 1,
              })
              .eq('nix_id', item.nix_id)
          )
        );
        throw storageError;
      }
    }

    // Ustaw flagi cleaned
    const { error: nixUpdateError } = await serviceClient
      .from('nixes')
      .update({ status: 'cleaned', cleaned_at: new Date().toISOString() })
      .in('id', nixIdsToUpdate);

    if (nixUpdateError) {
      // Ignore if missing column status in some older schema, but it should exist.
      await Promise.all(
        queueItems.map((item) =>
          serviceClient
            .from('nix_cleanup_queue')
            .update({
              last_error: nixUpdateError.message,
              next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
              attempt_count: (item.attempt_count || 0) + 1,
            })
            .eq('nix_id', item.nix_id)
        )
      );
      throw nixUpdateError;
    }

    // Usun z kolejki
    await serviceClient
      .from('nix_cleanup_queue')
      .delete()
      .in('nix_id', nixIdsToUpdate);

    totalCleaned = queueItems.length;

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
