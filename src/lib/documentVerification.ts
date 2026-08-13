import { supabase } from './supabase';

export type DocumentDecision = 'approved' | 'rejected';

export async function decideDocuments(userId: string, decision: DocumentDecision, reason?: string) {
  const trimmedReason = reason?.trim() ?? '';
  if (decision === 'rejected' && !trimmedReason) {
    return { success: false, error: 'Please enter a rejection reason.' };
  }

  const rpcResult = decision === 'approved'
    ? await supabase.rpc('approve_driver_docs', { p_user_id: userId })
    : await supabase.rpc('reject_driver_docs', { p_user_id: userId, p_reason: trimmedReason });

  if (rpcResult.error) return { success: false, error: rpcResult.error.message };

  // Best-effort only: the verification decision is already committed. The
  // Edge Function verifies both the caller's admin role and the saved status.
  const { data, error } = await supabase.functions.invoke('send-document-verification-email', {
    body: { userId, decision },
  });

  return {
    success: true,
    emailSent: !error && data?.success === true && data?.sent !== false,
  };
}
