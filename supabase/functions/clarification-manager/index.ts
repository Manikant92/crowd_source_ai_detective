// Clarification Management Edge Function
// Handles human-in-the-loop clarifications for the Portia workflow

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const method = req.method;
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const action = pathParts[pathParts.length - 1];

    if (method === 'GET' && action === 'pending') {
      // Get pending clarification requests
      const claimId = url.searchParams.get('claim_id');
      const priority = url.searchParams.get('priority');
      
      let query = `${supabaseUrl}/rest/v1/clarification_requests?status=eq.pending&order=created_at.asc`;
      
      if (claimId) {
        query += `&claim_id=eq.${claimId}`;
      }
      
      if (priority) {
        query += `&priority=eq.${priority}`;
      }

      const response = await fetch(query, {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch pending clarifications');
      }

      const clarifications = await response.json();
      
      return new Response(JSON.stringify({
        success: true,
        clarifications,
        total: clarifications.length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (method === 'POST' && action === 'create') {
      // Create new clarification request
      const { 
        claim_id, 
        clarification_type, 
        priority = 'medium',
        agent_type,
        title,
        description,
        context_data,
        options,
        default_value,
        timeout_seconds = 3600
      } = await req.json();

      if (!claim_id || !clarification_type || !agent_type || !title || !description) {
        throw new Error('Missing required fields for clarification request');
      }

      const requestId = `clarify_${claim_id}_${Date.now()}`;
      const expiresAt = new Date(Date.now() + (timeout_seconds * 1000)).toISOString();

      const clarificationData = {
        request_id: requestId,
        claim_id,
        clarification_type,
        priority,
        status: 'pending',
        agent_type,
        title,
        description,
        context_data,
        options,
        default_value,
        timeout_seconds,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const response = await fetch(`${supabaseUrl}/rest/v1/clarification_requests`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(clarificationData)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create clarification request: ${error}`);
      }

      // Update claim progress to show waiting for clarification
      await fetch(`${supabaseUrl}/rest/v1/claim_progress?claim_id=eq.${claim_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          current_status: 'awaiting_clarification',
          current_agent: agent_type,
          active_clarifications: 1,
          last_updated: new Date().toISOString()
        })
      });

      // Create audit event
      await fetch(`${supabaseUrl}/rest/v1/audit_events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_id: `clarify_created_${requestId}`,
          claim_id,
          agent_type,
          event_type: 'clarification_requested',
          event_data: {
            request_id: requestId,
            clarification_type,
            priority,
            expires_at: expiresAt
          },
          timestamp: new Date().toISOString()
        })
      });

      return new Response(JSON.stringify({
        success: true,
        request_id: requestId,
        message: 'Clarification request created successfully',
        expires_at: expiresAt
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (method === 'POST' && action === 'respond') {
      // Submit response to clarification request
      const { request_id, response_data, user_id, notes } = await req.json();

      if (!request_id || !response_data || !user_id) {
        throw new Error('Missing required fields for clarification response');
      }

      // Get the original request
      const requestResponse = await fetch(
        `${supabaseUrl}/rest/v1/clarification_requests?request_id=eq.${request_id}&limit=1`,
        {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
          }
        }
      );

      if (!requestResponse.ok) {
        throw new Error('Failed to fetch clarification request');
      }

      const requests = await requestResponse.json();
      if (requests.length === 0) {
        throw new Error('Clarification request not found');
      }

      const request = requests[0];
      if (request.status !== 'pending') {
        throw new Error('Clarification request is no longer pending');
      }

      const responseTimeSeconds = (Date.now() - new Date(request.created_at).getTime()) / 1000;

      // Update the clarification request with response
      const updateResponse = await fetch(
        `${supabaseUrl}/rest/v1/clarification_requests?request_id=eq.${request_id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'completed',
            response_data,
            response_user_id: user_id,
            response_time_seconds: responseTimeSeconds,
            response_notes: notes,
            updated_at: new Date().toISOString()
          })
        }
      );

      if (!updateResponse.ok) {
        throw new Error('Failed to update clarification request');
      }

      // Update claim progress
      await fetch(`${supabaseUrl}/rest/v1/claim_progress?claim_id=eq.${request.claim_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          current_status: 'processing',
          active_clarifications: 0,
          last_updated: new Date().toISOString()
        })
      });

      // Create audit event
      await fetch(`${supabaseUrl}/rest/v1/audit_events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_id: `clarify_responded_${request_id}`,
          claim_id: request.claim_id,
          user_id,
          agent_type: request.agent_type,
          event_type: 'clarification_responded',
          event_data: {
            request_id,
            response_data,
            response_time_seconds: responseTimeSeconds,
            human_intervention: true
          },
          timestamp: new Date().toISOString()
        })
      });

      // Resume workflow processing
      try {
        await fetch(`${supabaseUrl}/functions/v1/portia-process-claim`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            claim_id: request.claim_id,
            claim_text: 'resume_after_clarification',
            trigger_full_workflow: false,
            clarification_response: {
              request_id,
              response_data,
              user_id
            }
          })
        });
      } catch (resumeError) {
        console.warn('Failed to resume workflow:', resumeError.message);
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'Clarification response submitted successfully',
        response_time_seconds: responseTimeSeconds,
        workflow_resumed: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (method === 'GET' && action === 'status') {
      // Get clarification status for a claim
      const claimId = url.searchParams.get('claim_id');
      
      if (!claimId) {
        throw new Error('claim_id parameter required');
      }

      const response = await fetch(
        `${supabaseUrl}/rest/v1/clarification_requests?claim_id=eq.${claimId}&order=created_at.desc`,
        {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch clarification status');
      }

      const clarifications = await response.json();
      const pending = clarifications.filter(c => c.status === 'pending');
      const completed = clarifications.filter(c => c.status === 'completed');
      const expired = clarifications.filter(c => c.status === 'expired' || new Date(c.expires_at) < new Date());

      return new Response(JSON.stringify({
        success: true,
        claim_id: claimId,
        total_clarifications: clarifications.length,
        pending_count: pending.length,
        completed_count: completed.length,
        expired_count: expired.length,
        pending_clarifications: pending,
        latest_clarifications: clarifications.slice(0, 5)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      error: {
        code: 'INVALID_ACTION',
        message: 'Invalid action or method',
        supported_actions: ['pending', 'create', 'respond', 'status']
      }
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Clarification management error:', error);
    
    return new Response(JSON.stringify({
      error: {
        code: 'CLARIFICATION_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
