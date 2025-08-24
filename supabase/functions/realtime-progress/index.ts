// Real-time Progress Tracking Edge Function
// Provides WebSocket-like real-time updates for claim processing

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

    const url = new URL(req.url);
    const claimId = url.searchParams.get('claim_id');
    const action = url.searchParams.get('action') || 'status';

    if (!claimId) {
      throw new Error('claim_id parameter required');
    }

    if (action === 'status') {
      // Get current processing status
      const [progressResponse, workflowResponse, clarificationResponse] = await Promise.all([
        // Get claim progress
        fetch(`${supabaseUrl}/rest/v1/claim_progress?claim_id=eq.${claimId}`, {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
          }
        }),
        
        // Get workflow steps
        fetch(`${supabaseUrl}/rest/v1/agent_workflows?claim_id=eq.${claimId}&order=step_index.asc`, {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
          }
        }),
        
        // Get active clarifications
        fetch(`${supabaseUrl}/rest/v1/clarification_requests?claim_id=eq.${claimId}&status=eq.pending`, {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
          }
        })
      ]);

      const progress = await progressResponse.json();
      const workflows = await workflowResponse.json();
      const clarifications = await clarificationResponse.json();

      const currentProgress = progress[0] || {
        current_status: 'unknown',
        progress_percentage: 0,
        current_agent: null
      };

      // Calculate detailed progress from workflow steps
      const completedSteps = workflows.filter(w => w.status === 'completed').length;
      const totalSteps = workflows.length;
      const runningSteps = workflows.filter(w => w.status === 'running');

      return new Response(JSON.stringify({
        success: true,
        claim_id: claimId,
        timestamp: new Date().toISOString(),
        status: {
          current_status: currentProgress.current_status,
          current_agent: currentProgress.current_agent,
          progress_percentage: currentProgress.progress_percentage,
          estimated_completion: currentProgress.estimated_completion
        },
        workflow_progress: {
          completed_steps: completedSteps,
          total_steps: totalSteps,
          completion_percentage: totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0,
          currently_running: runningSteps.map(s => ({
            step_name: s.step_name,
            agent_type: s.agent_type,
            started_at: s.started_at
          }))
        },
        clarifications: {
          active_count: clarifications.length,
          pending_requests: clarifications.map(c => ({
            request_id: c.request_id,
            title: c.title,
            priority: c.priority,
            created_at: c.created_at,
            expires_at: c.expires_at
          }))
        },
        agent_results: currentProgress.agent_results || {},
        confidence_metrics: currentProgress.confidence_metrics || {}
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'audit-trail') {
      // Get comprehensive audit trail
      const auditResponse = await fetch(
        `${supabaseUrl}/rest/v1/audit_events?claim_id=eq.${claimId}&order=timestamp.desc`,
        {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
          }
        }
      );

      const auditEvents = await auditResponse.json();

      // Get evidence items
      const evidenceResponse = await fetch(
        `${supabaseUrl}/rest/v1/evidence_items?claim_id=eq.${claimId}&order=collected_at.desc`,
        {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
          }
        }
      );

      const evidenceItems = await evidenceResponse.json();

      return new Response(JSON.stringify({
        success: true,
        claim_id: claimId,
        audit_trail: {
          total_events: auditEvents.length,
          events: auditEvents,
          timeline: auditEvents.map(e => ({
            timestamp: e.timestamp,
            event_type: e.event_type,
            agent_type: e.agent_type,
            summary: `${e.event_type} by ${e.agent_type}`
          }))
        },
        evidence_summary: {
          total_items: evidenceItems.length,
          source_types: [...new Set(evidenceItems.map(e => e.source_type))],
          avg_reliability: evidenceItems.length > 0 ? 
            evidenceItems.reduce((sum, e) => sum + e.reliability_score, 0) / evidenceItems.length : 0,
          evidence_distribution: {
            supporting: evidenceItems.filter(e => e.evidence_type === 'supporting').length,
            contradicting: evidenceItems.filter(e => e.evidence_type === 'contradicting').length,
            neutral: evidenceItems.filter(e => e.evidence_type === 'neutral').length
          }
        },
        transparency_score: calculateTransparencyScore(auditEvents, evidenceItems)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'live-updates') {
      // Stream live updates (simplified for edge function)
      const updateInterval = parseInt(url.searchParams.get('interval') || '5000');
      const maxUpdates = parseInt(url.searchParams.get('max_updates') || '60');
      
      let updateCount = 0;
      const updates = [];
      
      while (updateCount < maxUpdates) {
        // Get current status
        const statusResponse = await fetch(
          `${supabaseUrl}/rest/v1/claim_progress?claim_id=eq.${claimId}`,
          {
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey
            }
          }
        );
        
        const progress = await statusResponse.json();
        const currentProgress = progress[0];
        
        if (currentProgress) {
          updates.push({
            timestamp: new Date().toISOString(),
            status: currentProgress.current_status,
            agent: currentProgress.current_agent,
            progress: currentProgress.progress_percentage,
            update_number: updateCount + 1
          });
          
          // Stop if processing is completed
          if (currentProgress.current_status === 'completed' || currentProgress.current_status === 'error') {
            break;
          }
        }
        
        updateCount++;
        
        if (updateCount < maxUpdates) {
          await new Promise(resolve => setTimeout(resolve, updateInterval));
        }
      }
      
      return new Response(JSON.stringify({
        success: true,
        claim_id: claimId,
        updates,
        total_updates: updates.length,
        update_interval_ms: updateInterval
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      error: {
        code: 'INVALID_ACTION',
        message: 'Invalid action specified',
        supported_actions: ['status', 'audit-trail', 'live-updates']
      }
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Progress tracking error:', error);
    
    return new Response(JSON.stringify({
      error: {
        code: 'PROGRESS_TRACKING_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Calculate transparency score based on audit trail completeness
function calculateTransparencyScore(auditEvents, evidenceItems) {
  let score = 0.5; // Base score
  
  // Add points for comprehensive audit trail
  if (auditEvents.length >= 5) score += 0.1;
  if (auditEvents.length >= 10) score += 0.1;
  
  // Add points for evidence diversity
  const sourceTypes = new Set(evidenceItems.map(e => e.source_type));
  if (sourceTypes.size >= 2) score += 0.1;
  if (sourceTypes.size >= 3) score += 0.1;
  
  // Add points for human intervention tracking
  const humanEvents = auditEvents.filter(e => e.event_type.includes('clarification'));
  if (humanEvents.length > 0) score += 0.1;
  
  // Add points for detailed event data
  const detailedEvents = auditEvents.filter(e => e.event_data && Object.keys(e.event_data).length > 2);
  if (detailedEvents.length >= auditEvents.length * 0.8) score += 0.1;
  
  return Math.min(1.0, score);
}
