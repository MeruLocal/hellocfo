import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'user';

interface SuperAdminInfo {
  isSuperAdmin: boolean;
  superAdminEmail: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [superAdminInfo, setSuperAdminInfo] = useState<SuperAdminInfo>({ isSuperAdmin: false, superAdminEmail: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer role fetch to avoid deadlock
        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
            checkSuperAdmin();
          }, 0);
        } else {
          setRole(null);
          setSuperAdminInfo({ isSuperAdmin: false, superAdminEmail: null });
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
        checkSuperAdmin();
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
    
    if (data && !error) {
      setRole(data.role as AppRole);
    } else {
      setRole(null);
    }
  };

  const checkSuperAdmin = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('check-super-admin');
      if (!error && data) {
        setSuperAdminInfo({
          isSuperAdmin: data.isSuperAdmin || false,
          superAdminEmail: data.superAdminEmail || null,
        });
      }
    } catch (err) {
      console.error('Error checking super admin:', err);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error, data };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
      setSession(null);
      setRole(null);
      setSuperAdminInfo({ isSuperAdmin: false, superAdminEmail: null });
    }
    return { error };
  };

  const isAdmin = role === 'admin';
  const isSuperAdmin = superAdminInfo.isSuperAdmin;

  return {
    user,
    session,
    role,
    isAdmin,
    isSuperAdmin,
    superAdminEmail: superAdminInfo.superAdminEmail,
    loading,
    signIn,
    signUp,
    signOut,
  };
}
