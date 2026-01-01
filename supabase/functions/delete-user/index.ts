import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const superAdminEmail = Deno.env.get('SUPER_ADMIN_EMAIL');
    
    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !requestingUser) {
      throw new Error('Unauthorized');
    }

    // Check if requesting user is admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !roleData) {
      throw new Error('Only admins can delete users');
    }

    const { userId } = await req.json();

    if (!userId) {
      throw new Error('User ID is required');
    }

    // Prevent self-deletion
    if (userId === requestingUser.id) {
      throw new Error('Cannot delete your own account');
    }

    // Get the target user's info
    const { data: targetUser, error: targetUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (targetUserError || !targetUser.user) {
      throw new Error('User not found');
    }

    // Prevent deletion of super admin
    if (superAdminEmail && targetUser.user.email === superAdminEmail) {
      throw new Error('Cannot delete the super admin account');
    }

    // Check if target user is an admin
    const { data: targetRoleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .single();

    // Check if requesting user is the super admin
    const isRequestingSuperAdmin = superAdminEmail && requestingUser.email === superAdminEmail;

    // Only super admin can delete other admins
    if (targetRoleData && !isRequestingSuperAdmin) {
      throw new Error('Only the super admin can delete admin accounts');
    }

    // Delete the user (this will cascade to profiles and user_roles)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      throw deleteError;
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
