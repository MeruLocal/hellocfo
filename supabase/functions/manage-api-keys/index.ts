import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Generate a secure API key
function generateApiKey(): string {
  const prefix = 'cfo_';
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...randomBytes))
    .replace(/[+/=]/g, '') // URL-safe
    .substring(0, 40);
  return prefix + base64;
}

// Hash API key using SHA-256 for storage
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface CreateKeyRequest {
  action: 'create';
  name: string;
  scopes?: string[];
  expiresInDays?: number | null;
}

interface ListKeysRequest {
  action: 'list';
}

interface RevokeKeyRequest {
  action: 'revoke';
  keyId: string;
}

interface DeleteKeyRequest {
  action: 'delete';
  keyId: string;
}

type RequestBody = CreateKeyRequest | ListKeysRequest | RevokeKeyRequest | DeleteKeyRequest;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Validate Authorization header (JWT required for key management)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized', code: 'MISSING_AUTH' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const token = authHeader.replace('Bearer ', '');

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Verify user token
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    console.error('[Auth] Invalid token:', authError?.message);
    return new Response(JSON.stringify({ error: 'Invalid token', code: 'INVALID_TOKEN' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  console.log('[Auth] User authenticated:', user.id);

  // Parse request body
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { action } = body;

  try {
    switch (action) {
      case 'create': {
        const { name, scopes = ['cfo-agent'], expiresInDays } = body as CreateKeyRequest;

        if (!name || typeof name !== 'string') {
          return new Response(JSON.stringify({ error: 'Name is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Generate new API key
        const apiKey = generateApiKey();
        const keyHash = await hashApiKey(apiKey);
        const keyPrefix = apiKey.substring(0, 8);

        // Calculate expiration
        let expiresAt: string | null = null;
        if (expiresInDays && expiresInDays > 0) {
          const expDate = new Date();
          expDate.setDate(expDate.getDate() + expiresInDays);
          expiresAt = expDate.toISOString();
        }

        // Insert into database
        const { data: newKey, error: insertError } = await supabase
          .from('api_keys')
          .insert({
            user_id: user.id,
            name,
            key_hash: keyHash,
            key_prefix: keyPrefix,
            scopes,
            expires_at: expiresAt
          })
          .select('id, name, key_prefix, scopes, expires_at, created_at')
          .single();

        if (insertError) {
          console.error('[Create] Insert error:', insertError);
          return new Response(JSON.stringify({ error: 'Failed to create API key' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log('[Create] API key created:', newKey.id);

        return new Response(JSON.stringify({
          success: true,
          apiKey, // Only shown once at creation!
          keyId: newKey.id,
          name: newKey.name,
          keyPrefix: newKey.key_prefix,
          scopes: newKey.scopes,
          expiresAt: newKey.expires_at,
          createdAt: newKey.created_at,
          message: 'Save this API key securely. It will not be shown again.'
        }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'list': {
        const { data: keys, error: listError } = await supabase
          .from('api_keys')
          .select('id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at, updated_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (listError) {
          console.error('[List] Query error:', listError);
          return new Response(JSON.stringify({ error: 'Failed to list API keys' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({
          success: true,
          keys: keys.map(k => ({
            id: k.id,
            name: k.name,
            keyPrefix: k.key_prefix + '...',
            scopes: k.scopes,
            isActive: k.is_active,
            lastUsedAt: k.last_used_at,
            expiresAt: k.expires_at,
            createdAt: k.created_at,
            updatedAt: k.updated_at,
            isExpired: k.expires_at ? new Date(k.expires_at) < new Date() : false
          }))
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'revoke': {
        const { keyId } = body as RevokeKeyRequest;

        if (!keyId) {
          return new Response(JSON.stringify({ error: 'keyId is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Verify ownership and revoke
        const { data: updated, error: updateError } = await supabase
          .from('api_keys')
          .update({ is_active: false })
          .eq('id', keyId)
          .eq('user_id', user.id)
          .select('id, name')
          .single();

        if (updateError || !updated) {
          console.error('[Revoke] Update error:', updateError);
          return new Response(JSON.stringify({ error: 'API key not found or already revoked' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log('[Revoke] API key revoked:', updated.id);

        return new Response(JSON.stringify({
          success: true,
          message: `API key "${updated.name}" has been revoked`,
          keyId: updated.id
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'delete': {
        const { keyId } = body as DeleteKeyRequest;

        if (!keyId) {
          return new Response(JSON.stringify({ error: 'keyId is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Verify ownership and delete
        const { data: deleted, error: deleteError } = await supabase
          .from('api_keys')
          .delete()
          .eq('id', keyId)
          .eq('user_id', user.id)
          .select('id, name')
          .single();

        if (deleteError || !deleted) {
          console.error('[Delete] Delete error:', deleteError);
          return new Response(JSON.stringify({ error: 'API key not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        console.log('[Delete] API key deleted:', deleted.id);

        return new Response(JSON.stringify({
          success: true,
          message: `API key "${deleted.name}" has been permanently deleted`,
          keyId: deleted.id
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ 
          error: 'Invalid action',
          validActions: ['create', 'list', 'revoke', 'delete']
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('[Error]', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
