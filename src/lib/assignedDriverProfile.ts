import type { DigitalProfileData } from '../components/DigitalProfileCard';
import { supabase } from './supabase';

export const getAssignedDriverProfile = async (orderId: string): Promise<DigitalProfileData | null> => {
  const { data, error } = await supabase.rpc('get_assigned_driver_profile', { p_order_id: orderId });
  if (error) {
    console.error('[GERAK] Unable to load assigned driver profile', error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    name: row.name,
    role: row.role,
    phone: row.phone ?? '',
    vehicle: row.vehicle,
    status: row.status,
    avatarUrl: row.avatar_url,
    gerakId: row.gerak_id,
    canDrive: row.can_drive,
    canRent: row.can_rent,
    canTransport: row.can_transport,
  };
};
