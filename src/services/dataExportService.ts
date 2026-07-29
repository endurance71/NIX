import { supabase } from '../lib/supabase';
import type { DataExportJob } from '../types/database.types';
import { recordProductEvent } from './productAnalyticsService';

export async function listDataExportJobs(): Promise<DataExportJob[]> {
  const { data, error } = await supabase
    .from('data_export_jobs')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data ?? [];
}

export async function requestDataExport(): Promise<DataExportJob> {
  const { data, error } = await supabase.rpc('request_data_export');
  if (error) throw error;
  void recordProductEvent('data_export_requested');
  return data;
}

export async function createDataExportDownloadUrl(jobId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('data-export-download', {
    body: { job_id: jobId },
  });
  if (error) throw error;
  if (typeof data?.signed_url !== 'string') {
    const code = typeof data?.code === 'string' ? data.code : 'EXPORT_DOWNLOAD_FAILED';
    throw new Error(code);
  }
  return data.signed_url;
}
