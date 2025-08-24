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
    const { claim_id, verdict, confidence_score, justification, evidence_links = [] } = await req.json();

    if (!claim_id || !verdict || confidence_score === undefined) {
      throw new Error('Claim ID, verdict, and confidence score are required');
    }

    if (confidence_score < 0 || confidence_score > 1) {
      throw new Error('Confidence score must be between 0 and 1');
    }

    const validVerdicts = ['true', 'false', 'mixed', 'unverified', 'misleading'];
    if (!validVerdicts.includes(verdict)) {
      throw new Error(`Verdict must be one of: ${validVerdicts.join(', ')}`);
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

    console.log(`Processing community verification from user: ${userId} for claim: ${claim_id}`);

    // Check if user has already verified this claim
    const existingVerificationResponse = await fetch(
      `${supabaseUrl}/rest/v1/verifications?claim_id=eq.${claim_id}&verifier_id=eq.${userId}`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      }
    );

    if (existingVerificationResponse.ok) {
      const existing = await existingVerificationResponse.json();
      if (existing.length > 0) {
        return new Response(JSON.stringify({
          error: {
            code: 'ALREADY_VERIFIED',
            message: 'You have already submitted a verification for this claim',
            existing_verification_id: existing[0].id
          }
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Get user's reputation to weight their verification
    const userProfileResponse = await fetch(
      `${supabaseUrl}/rest/v1/users?id=eq.${userId}`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      }
    );

    let userReputation = 50.0; // Default reputation
    if (userProfileResponse.ok) {
      const userProfile = await userProfileResponse.json();
      if (userProfile.length > 0) {
        userReputation = userProfile[0].reputation_score || 50.0;
      }
    }

    // Create verification record
    const verificationData = {
      claim_id,
      verifier_id: userId,
      verification_type: 'community',
      verdict,
      confidence_score,
      justification: justification || '',
      evidence_links: JSON.stringify(evidence_links),
      verified_at: new Date().toISOString(),
      upvotes: 0,
      downvotes: 0,
      is_consensus: false
    };

    const verificationResponse = await fetch(`${supabaseUrl}/rest/v1/verifications`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(verificationData)
    });

    if (!verificationResponse.ok) {
      const errorText = await verificationResponse.text();
      throw new Error(`Failed to create verification: ${errorText}`);
    }

    const verificationResult = await verificationResponse.json();
    const verificationId = verificationResult[0].id;

    console.log(`Created verification: ${verificationId}`);

    // Update claim verification count
    const claimUpdateResponse = await fetch(`${supabaseUrl}/rest/v1/claims?id=eq.${claim_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        verification_count: 1, // This would need proper increment in production
        last_updated: new Date().toISOString()
      })
    });

    // Get all verifications for this claim to calculate consensus
    const allVerificationsResponse = await fetch(
      `${supabaseUrl}/rest/v1/verifications?claim_id=eq.${claim_id}`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      }
    );

    let consensusAnalysis = null;
    if (allVerificationsResponse.ok) {
      const allVerifications = await allVerificationsResponse.json();
      consensusAnalysis = analyzeConsensus(allVerifications, userReputation);
      
      // Update claim reliability score if consensus threshold is reached
      if (consensusAnalysis.consensus_reached) {
        await fetch(`${supabaseUrl}/rest/v1/claims?id=eq.${claim_id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reliability_score: consensusAnalysis.weighted_reliability_score,
            status: 'completed',
            last_updated: new Date().toISOString(),
            claim_metadata: {
              community_consensus: consensusAnalysis,
              consensus_reached_at: new Date().toISOString()
            }
          })
        });
      }
    }

    // Log verification to audit trail
    await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        entity_id: verificationId,
        entity_type: 'verification',
        action_type: 'created',
        new_state: {
          verdict,
          confidence_score,
          verification_type: 'community'
        },
        actor_id: userId,
        is_system_action: false,
        action_metadata: {
          claim_id,
          user_reputation: userReputation,
          evidence_count: evidence_links.length,
          justification_length: justification?.length || 0
        },
        created_at: new Date().toISOString()
      })
    });

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
        target_claim_id: claim_id,
        target_verification_id: verificationId,
        action_type: 'verify_claim',
        metadata: {
          verdict,
          confidence_score,
          evidence_count: evidence_links.length
        },
        created_at: new Date().toISOString()
      })
    });

    return new Response(JSON.stringify({
      data: {
        verification_id: verificationId,
        status: 'submitted',
        message: 'Community verification submitted successfully',
        consensus_analysis: consensusAnalysis,
        verification_data: verificationResult[0]
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Community verification error:', error);

    return new Response(JSON.stringify({
      error: {
        code: 'VERIFICATION_FAILED',
        message: error.message
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Consensus analysis function
function analyzeConsensus(verifications, currentUserReputation = 50.0) {
  if (verifications.length === 0) {
    return {
      consensus_reached: false,
      total_verifications: 0,
      weighted_reliability_score: 0.5
    };
  }

  // Group verifications by verdict
  const verdictCounts = {};
  let totalWeight = 0;
  let weightedScore = 0;

  verifications.forEach(verification => {
    const verdict = verification.verdict;
    const confidence = verification.confidence_score;
    const weight = 1.0; // In production, weight by user reputation

    if (!verdictCounts[verdict]) {
      verdictCounts[verdict] = { count: 0, weight: 0, confidence_sum: 0 };
    }

    verdictCounts[verdict].count++;
    verdictCounts[verdict].weight += weight;
    verdictCounts[verdict].confidence_sum += confidence;
    
    totalWeight += weight;

    // Convert verdict to numerical reliability score
    let verdictScore;
    switch (verdict) {
      case 'true': verdictScore = 0.9; break;
      case 'false': verdictScore = 0.1; break;
      case 'mixed': verdictScore = 0.5; break;
      case 'misleading': verdictScore = 0.3; break;
      case 'unverified': verdictScore = 0.5; break;
      default: verdictScore = 0.5;
    }

    weightedScore += verdictScore * confidence * weight;
  });

  const averageWeightedScore = totalWeight > 0 ? weightedScore / totalWeight : 0.5;

  // Determine consensus (simplified - need at least 3 verifications and 60% agreement)
  const consensusThreshold = 0.6;
  const minVerifications = 3;
  
  let dominantVerdict = null;
  let consensusReached = false;
  
  if (verifications.length >= minVerifications) {
    const dominantVerdictData = Object.entries(verdictCounts)
      .reduce((max, [verdict, data]) => data.weight > max.weight ? { verdict, ...data } : max, 
                { verdict: null, weight: 0 });
    
    if (dominantVerdictData.weight / totalWeight >= consensusThreshold) {
      dominantVerdict = dominantVerdictData.verdict;
      consensusReached = true;
    }
  }

  return {
    consensus_reached: consensusReached,
    dominant_verdict: dominantVerdict,
    total_verifications: verifications.length,
    verdict_breakdown: verdictCounts,
    weighted_reliability_score: Math.max(0, Math.min(1, averageWeightedScore)),
    consensus_strength: dominantVerdict ? verdictCounts[dominantVerdict].weight / totalWeight : 0,
    average_confidence: verifications.reduce((sum, v) => sum + v.confidence_score, 0) / verifications.length
  };
}