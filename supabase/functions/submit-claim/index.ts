Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'false'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { claim_text, source_urls = [], claim_type = 'text', tags = [] } = await req.json();

    if (!claim_text || claim_text.trim().length < 10) {
      throw new Error('Claim text must be at least 10 characters long');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('Authentication required');
    }

    const token = authHeader.replace('Bearer ', '');
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': serviceRoleKey
      }
    });

    if (!userResponse.ok) {
      throw new Error('Invalid authentication token');
    }

    const userData = await userResponse.json();
    const userId = userData.id;

    console.log(`Submitting new claim from user: ${userId}`);

    // Check for duplicate claims using content fingerprint
    const contentFingerprint = generateContentFingerprint(claim_text);
    const duplicateCheck = await fetch(
      `${supabaseUrl}/rest/v1/claims?claim_metadata->>content_fingerprint=eq."${contentFingerprint}"&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      }
    );

    if (duplicateCheck.ok) {
      const duplicates = await duplicateCheck.json();
      if (duplicates.length > 0) {
        return new Response(JSON.stringify({
          error: {
            code: 'DUPLICATE_CLAIM',
            message: 'A similar claim has already been submitted',
            existing_claim_id: duplicates[0].id
          }
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Create new claim record
    const claimData = {
      submitter_id: userId,
      claim_text: claim_text.trim(),
      claim_type,
      source_urls: JSON.stringify(source_urls),
      tags: JSON.stringify(tags),
      status: 'pending',
      submitted_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      claim_metadata: {
        content_fingerprint: contentFingerprint,
        submission_ip: req.headers.get('cf-connecting-ip') || 'unknown',
        user_agent: req.headers.get('user-agent')?.substring(0, 200) || 'unknown',
        initial_source_count: source_urls.length
      }
    };

    const claimResponse = await fetch(`${supabaseUrl}/rest/v1/claims`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(claimData)
    });

    if (!claimResponse.ok) {
      const errorText = await claimResponse.text();
      throw new Error(`Failed to create claim: ${errorText}`);
    }

    const claimResult = await claimResponse.json();
    const claimId = claimResult[0].id;

    console.log(`Created claim: ${claimId}`);

    // Log submission to audit trail
    await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        entity_id: claimId,
        entity_type: 'claim',
        action_type: 'created',
        new_state: {
          status: 'pending',
          claim_type,
          source_count: source_urls.length
        },
        actor_id: userId,
        is_system_action: false,
        action_metadata: {
          submission_method: 'web_interface',
          content_length: claim_text.length,
          tags_count: tags.length
        },
        created_at: new Date().toISOString()
      })
    });

    // Automatically trigger AI processing
    try {
      console.log(`Triggering automatic processing for claim: ${claimId}`);
      
      const processingResponse = await fetch(`${supabaseUrl}/functions/v1/process-claim`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          claim_id: claimId,
          claim_text: claim_text.trim(),
          source_urls,
          claim_type,
          user_id: userId
        })
      });

      if (!processingResponse.ok) {
        console.warn(`Failed to trigger automatic processing: ${await processingResponse.text()}`);
      } else {
        console.log(`Successfully triggered processing for claim: ${claimId}`);
      }
    } catch (processingError) {
      console.warn(`Error triggering automatic processing: ${processingError.message}`);
      // Don't fail the claim submission if processing trigger fails
    }

    // Update user interaction statistics
    await fetch(`${supabaseUrl}/rest/v1/user_interactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        target_claim_id: claimId,
        action_type: 'submit_claim',
        metadata: {
          claim_type,
          source_count: source_urls.length,
          content_length: claim_text.length,
          tags: tags
        },
        created_at: new Date().toISOString()
      })
    });

    return new Response(JSON.stringify({
      data: {
        claim_id: claimId,
        status: 'pending',
        message: 'Claim submitted successfully and queued for AI processing',
        processing_initiated: true,
        claim_data: claimResult[0]
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Claim submission error:', error);

    return new Response(JSON.stringify({
      error: {
        code: 'CLAIM_SUBMISSION_FAILED',
        message: error.message
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Helper function to generate content fingerprint
function generateContentFingerprint(text) {
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return Math.abs(hash).toString(16);
}