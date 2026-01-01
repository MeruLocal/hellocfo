import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from './useAuth';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
}

interface UserWithRole extends Profile {
  role: AppRole | null;
}

export function useUsers() {
  const queryClient = useQueryClient();

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async (): Promise<UserWithRole[]> => {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Combine profiles with roles
      return (profiles || []).map((profile) => ({
        ...profile,
        role: roles?.find(r => r.user_id === profile.id)?.role as AppRole | null,
      }));
    },
  });

  const createUser = useMutation({
    mutationFn: async ({ email, password, fullName, role }: {
      email: string;
      password: string;
      fullName?: string;
      role: AppRole;
    }) => {
      // Create user via edge function to bypass RLS for initial creation
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { email, password, fullName, role },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  return {
    users,
    isLoading,
    error,
    createUser,
    deleteUser,
  };
}
