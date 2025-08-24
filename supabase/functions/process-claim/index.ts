// Complete Claim Processing Edge Function with Integrated Multi-Agent Logic

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
    const { claim_id, claim_text, source_urls = [], claim_type = 'text', user_id } = await req.json();

    if (!claim_id || !claim_text) {
      throw new Error('Claim ID and claim text are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    console.log(`Processing claim: ${claim_id}`);

    // Update claim status to processing
    const statusUpdateResponse = await fetch(`${supabaseUrl}/rest/v1/claims?id=eq.${claim_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'processing',
        last_updated: new Date().toISOString()
      })
    });

    if (!statusUpdateResponse.ok) {
      throw new Error('Failed to update claim status');
    }

    // Initialize multi-agent workflow
    const workflowId = `workflow_${claim_id}_${Date.now()}`;
    const agentSteps = [
      { name: 'claim_detection', type: 'claim_detector', description: 'Extract and structure verifiable claims' },
      { name: 'content_analysis', type: 'content_analyzer', description: 'Analyze content quality and detect manipulation' },
      { name: 'fact_checking', type: 'fact_checker', description: 'Cross-reference against authoritative sources' },
      { name: 'source_validation', type: 'source_validator', description: 'Assess source credibility and bias' },
      { name: 'cross_referencing', type: 'cross_referencer', description: 'Find related claims and detect duplicates' },
      { name: 'reliability_scoring', type: 'reliability_scorer', description: 'Calculate final reliability score' }
    ];

    console.log(`Creating workflow steps for ${workflowId}`);

    // Create workflow steps in database
    const workflowSteps = agentSteps.map((step, index) => ({
      claim_id,
      agent_id: null,
      workflow_id: workflowId,
      step_name: step.name,
      step_index: index,
      status: 'pending',
      input_data: {
        claim_text,
        source_urls,
        claim_type,
        previous_outputs: []
      },
      created_at: new Date().toISOString()
    }));

    const workflowResponse = await fetch(`${supabaseUrl}/rest/v1/agent_workflows`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(workflowSteps)
    });

    if (!workflowResponse.ok) {
      throw new Error('Failed to create workflow steps');
    }

    // Execute each agent step sequentially
    let previousOutputs = {};
    let finalReliabilityScore = 0.5;
    let evidenceChain = [];
    let processingResults = {};

    for (const [index, step] of agentSteps.entries()) {
      console.log(`Executing step ${index + 1}: ${step.name}`);
      
      try {
        // Update step status to running
        await fetch(`${supabaseUrl}/rest/v1/agent_workflows?workflow_id=eq.${workflowId}&step_index=eq.${index}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'running',
            started_at: new Date().toISOString()
          })
        });

        // Execute agent logic
        const stepResult = await executeAgentStep(step, {
          claim_text,
          source_urls,
          claim_type,
          previous_outputs: previousOutputs,
          supabaseUrl,
          serviceRoleKey
        });

        // Store step results
        processingResults[step.name] = stepResult;
        previousOutputs[step.name] = stepResult;
        
        if (stepResult.evidence) {
          evidenceChain.push(...stepResult.evidence);
        }
        
        if (step.name === 'reliability_scoring' && stepResult.reliability_score !== undefined) {
          finalReliabilityScore = stepResult.reliability_score;
        }

        // Update step status to completed
        await fetch(`${supabaseUrl}/rest/v1/agent_workflows?workflow_id=eq.${workflowId}&step_index=eq.${index}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'completed',
            output_data: stepResult,
            processing_time_ms: stepResult.processing_time_ms || 0,
            completed_at: new Date().toISOString()
          })
        });

        console.log(`Completed step ${index + 1}: ${step.name}`);

      } catch (stepError) {
        console.error(`Error in step ${step.name}:`, stepError);
        
        // Mark step as failed but continue
        await fetch(`${supabaseUrl}/rest/v1/agent_workflows?workflow_id=eq.${workflowId}&step_index=eq.${index}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            status: 'failed',
            error_message: stepError.message,
            completed_at: new Date().toISOString()
          })
        });
        
        processingResults[step.name] = {
          error: stepError.message,
          confidence: 0.0,
          processing_time_ms: 0
        };
      }
    }

    // Update final claim with results
    const finalUpdateResponse = await fetch(`${supabaseUrl}/rest/v1/claims?id=eq.${claim_id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reliability_score: finalReliabilityScore,
        status: 'completed',
        last_updated: new Date().toISOString(),
        claim_metadata: {
          ...processingResults,
          workflow_id: workflowId,
          evidence_chain: evidenceChain,
          processing_completed_at: new Date().toISOString()
        }
      })
    });

    if (!finalUpdateResponse.ok) {
      console.warn('Failed to update final claim status');
    }

    // Generate comprehensive report
    const reportData = {
      claim_id,
      report_type: 'fact_check',
      report_data: {
        workflow_id: workflowId,
        processing_results: processingResults,
        final_verdict: categorizeReliabilityScore(finalReliabilityScore),
        confidence_level: calculateConfidenceLevel(processingResults),
        summary: generateReportSummary(claim_text, finalReliabilityScore, processingResults)
      },
      reliability_breakdown: {
        overall_score: finalReliabilityScore,
        factor_scores: extractFactorScores(processingResults),
        confidence_intervals: calculateConfidenceIntervals(processingResults)
      },
      evidence_summary: {
        total_sources: evidenceChain.length,
        evidence_chain: evidenceChain.slice(0, 10),
        source_diversity: calculateSourceDiversity(evidenceChain)
      },
      generated_at: new Date().toISOString(),
      is_published: true
    };

    const reportResponse = await fetch(`${supabaseUrl}/rest/v1/reports`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(reportData)
    });

    let reportId = null;
    if (reportResponse.ok) {
      const reportResult = await reportResponse.json();
      reportId = reportResult[0]?.id;
    }

    // Log successful completion
    await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        entity_id: claim_id,
        entity_type: 'claim',
        action_type: 'verified',
        new_state: {
          reliability_score: finalReliabilityScore,
          status: 'completed',
          workflow_id: workflowId
        },
        actor_id: user_id,
        is_system_action: true,
        action_metadata: {
          processing_time_total_ms: Object.values(processingResults)
            .reduce((sum, result) => sum + (result.processing_time_ms || 0), 0),
          steps_completed: Object.keys(processingResults).length,
          report_id: reportId
        },
        created_at: new Date().toISOString()
      })
    });

    console.log(`Successfully processed claim ${claim_id} with reliability score ${finalReliabilityScore}`);

    return new Response(JSON.stringify({
      data: {
        claim_id,
        workflow_id: workflowId,
        reliability_score: finalReliabilityScore,
        status: 'completed',
        report_id: reportId,
        processing_results: processingResults,
        evidence_count: evidenceChain.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Claim processing error:', error);

    return new Response(JSON.stringify({
      error: {
        code: 'CLAIM_PROCESSING_FAILED',
        message: error.message
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// AI Agent Step Implementations
async function executeAgentStep(step, context) {
  switch (step.type) {
    case 'claim_detector':
      return await executeClaimDetector(context);
    case 'content_analyzer':
      return await executeContentAnalyzer(context);
    case 'fact_checker':
      return await executeFactChecker(context);
    case 'source_validator':
      return await executeSourceValidator(context);
    case 'cross_referencer':
      return await executeCrossReferencer(context);
    case 'reliability_scorer':
      return await executeReliabilityScorer(context);
    default:
      throw new Error(`Unknown agent step type: ${step.type}`);
  }
}

// Claim Detection Agent
async function executeClaimDetector(context) {
  const { claim_text, claim_type } = context;
  const startTime = Date.now();
  
  try {
    const claims = extractVerifiableClaims(claim_text);
    const claimClassification = classifyClaims(claims, claim_type);
    
    return {
      extracted_claims: claims,
      classification: claimClassification,
      verifiable_statements: claims.filter(c => c.verifiable),
      confidence: calculateExtractionConfidence(claims),
      processing_time_ms: Date.now() - startTime,
      metadata: {
        total_claims: claims.length,
        verifiable_count: claims.filter(c => c.verifiable).length
      }
    };
  } catch (error) {
    return { error: error.message, confidence: 0.0, processing_time_ms: Date.now() - startTime };
  }
}

// Content Analysis Agent
async function executeContentAnalyzer(context) {
  const { claim_text, source_urls } = context;
  const startTime = Date.now();
  
  try {
    const qualityMetrics = analyzeContentQuality(claim_text);
    const manipulationFlags = detectManipulationIndicators(claim_text, source_urls);
    const biasAnalysis = analyzeLinguisticBias(claim_text);
    
    return {
      quality_metrics: qualityMetrics,
      manipulation_flags: manipulationFlags,
      bias_analysis: biasAnalysis,
      content_fingerprint: generateContentFingerprint(claim_text),
      confidence: (qualityMetrics.readability + (1 - manipulationFlags.risk_score) + biasAnalysis.objectivity) / 3,
      processing_time_ms: Date.now() - startTime,
      evidence: [{
        type: 'content_analysis',
        description: 'Content quality and manipulation detection results',
        confidence: qualityMetrics.overall_score,
        source: 'internal_analyzer'
      }]
    };
  } catch (error) {
    return { error: error.message, confidence: 0.0, processing_time_ms: Date.now() - startTime };
  }
}

// Fact-Checking Agent
async function executeFactChecker(context) {
  const { claim_text, source_urls, previous_outputs } = context;
  const startTime = Date.now();
  
  try {
    const extractedClaims = previous_outputs.claim_detection?.extracted_claims || [{ text: claim_text, verifiable: true }];
    let allEvidence = [];
    let overallVerification = { supporting: 0, contradicting: 0, neutral: 0 };
    
    for (const claim of extractedClaims.filter(c => c.verifiable)) {
      const searchResults = await searchAuthoritativeSources(claim.text);
      const sourceAnalysis = await analyzeProvidedSources(claim.text, source_urls);
      
      const claimEvidence = {
        claim: claim.text,
        search_results: searchResults,
        source_analysis: sourceAnalysis,
        verification_status: determineVerificationStatus(searchResults, sourceAnalysis)
      };
      
      allEvidence.push(claimEvidence);
      
      if (claimEvidence.verification_status === 'supporting') {
        overallVerification.supporting++;
      } else if (claimEvidence.verification_status === 'contradicting') {
        overallVerification.contradicting++;
      } else {
        overallVerification.neutral++;
      }
    }
    
    return {
      individual_claims: allEvidence,
      overall_verification: overallVerification,
      confidence: calculateFactCheckConfidence(allEvidence),
      processing_time_ms: Date.now() - startTime,
      evidence: allEvidence.flatMap(claim => 
        claim.search_results.sources?.map(source => ({
          type: 'external_verification',
          description: `Cross-reference verification: ${source.verdict}`,
          confidence: source.credibility_score,
          source: source.url,
          supporting_text: source.relevant_excerpt
        })) || []
      )
    };
  } catch (error) {
    return { error: error.message, confidence: 0.0, processing_time_ms: Date.now() - startTime };
  }
}

// Source Validation Agent
async function executeSourceValidator(context) {
  const { source_urls, supabaseUrl, serviceRoleKey } = context;
  const startTime = Date.now();
  
  try {
    let sourceValidations = [];
    
    for (const url of source_urls || []) {
      const existingSource = await fetchExistingSource(url, supabaseUrl, serviceRoleKey);
      
      let sourceCredibility;
      if (existingSource) {
        sourceCredibility = {
          url,
          domain: existingSource.source_domain,
          credibility_score: existingSource.credibility_score,
          from_database: true
        };
      } else {
        sourceCredibility = await assessSourceCredibility(url);
        await storeNewSource(sourceCredibility, supabaseUrl, serviceRoleKey);
      }
      
      sourceValidations.push(sourceCredibility);
    }
    
    return {
      source_validations: sourceValidations,
      average_credibility: sourceValidations.reduce((sum, s) => sum + s.credibility_score, 0) / (sourceValidations.length || 1),
      confidence: Math.min(sourceValidations.reduce((sum, s) => sum + s.credibility_score, 0) / (sourceValidations.length || 1), 1.0),
      processing_time_ms: Date.now() - startTime,
      evidence: sourceValidations.map(source => ({
        type: 'source_validation',
        description: `Source credibility: ${source.credibility_score.toFixed(2)}`,
        confidence: source.credibility_score,
        source: source.url
      }))
    };
  } catch (error) {
    return { error: error.message, confidence: 0.0, processing_time_ms: Date.now() - startTime };
  }
}

// Cross-Reference Agent
async function executeCrossReferencer(context) {
  const { claim_text, supabaseUrl, serviceRoleKey } = context;
  const startTime = Date.now();
  
  try {
    const similarClaims = await findSimilarClaims(claim_text, supabaseUrl, serviceRoleKey);
    const duplicateAnalysis = detectDuplicateClaims(claim_text, similarClaims);
    
    return {
      similar_claims: similarClaims.slice(0, 10),
      duplicate_analysis: duplicateAnalysis,
      novelty_score: calculateNoveltyScore(duplicateAnalysis, similarClaims),
      confidence: calculateCrossReferenceConfidence(similarClaims),
      processing_time_ms: Date.now() - startTime,
      evidence: similarClaims.map(claim => ({
        type: 'cross_reference',
        description: `Related claim with reliability: ${claim.reliability_score || 'unknown'}`,
        confidence: claim.reliability_score || 0.5,
        source: `internal_claim_${claim.id}`
      }))
    };
  } catch (error) {
    return { error: error.message, confidence: 0.0, processing_time_ms: Date.now() - startTime };
  }
}

// Reliability Scoring Agent
async function executeReliabilityScorer(context) {
  const { previous_outputs } = context;
  const startTime = Date.now();
  
  try {
    const factors = {
      content_quality: previous_outputs.content_analysis?.confidence || 0.5,
      fact_verification: previous_outputs.fact_checking?.confidence || 0.5,
      source_credibility: previous_outputs.source_validation?.confidence || 0.5,
      cross_reference: previous_outputs.cross_referencing?.confidence || 0.5,
      claim_detection: previous_outputs.claim_detection?.confidence || 0.5
    };
    
    const weights = {
      content_quality: 0.15,
      fact_verification: 0.35,
      source_credibility: 0.25,
      cross_reference: 0.15,
      claim_detection: 0.10
    };
    
    const reliabilityScore = Object.keys(factors).reduce(
      (sum, factor) => sum + (factors[factor] * weights[factor]), 0
    );
    
    const justification = generateScoringJustification(factors, weights, reliabilityScore);
    const confidenceInterval = calculateScoringConfidence(factors, previous_outputs);
    
    return {
      reliability_score: Math.max(0, Math.min(1, reliabilityScore)),
      factor_scores: factors,
      weights_applied: weights,
      justification,
      confidence_interval: confidenceInterval,
      confidence: confidenceInterval.confidence,
      processing_time_ms: Date.now() - startTime,
      evidence: [{
        type: 'reliability_calculation',
        description: `Final reliability: ${reliabilityScore.toFixed(3)}`,
        confidence: confidenceInterval.confidence,
        source: 'internal_scorer',
        supporting_text: justification
      }]
    };
  } catch (error) {
    return { error: error.message, confidence: 0.0, processing_time_ms: Date.now() - startTime };
  }
}

// Helper Functions

function extractVerifiableClaims(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  return sentences.map((sentence, index) => {
    const trimmed = sentence.trim();
    return {
      id: `claim_${index}`,
      text: trimmed,
      type: classifyClaimType(trimmed),
      verifiable: isClaimVerifiable(trimmed),
      entities: extractNamedEntities(trimmed),
      confidence: 0.7
    };
  });
}

function classifyClaimType(text) {
  if (/\d+%|\d+\s*(percent|million|billion|thousand)/i.test(text)) return 'statistical';
  if (/(happened|occurred|will|going to)/i.test(text)) return 'factual';
  if (/(think|believe|opinion|feel)/i.test(text)) return 'opinion';
  return 'factual';
}

function isClaimVerifiable(text) {
  const verifiabilityIndicators = [
    /\d{4}/, /\d+%/, /\$\d+/, /\b[A-Z][a-z]+\s[A-Z][a-z]+\b/,
    /(according to|reported by|study shows)/i
  ];
  return verifiabilityIndicators.some(pattern => pattern.test(text));
}

function extractNamedEntities(text) {
  const entities = [];
  const names = text.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g) || [];
  entities.push(...names.map(name => ({ text: name, type: 'PERSON' })));
  const numbers = text.match(/\b\d+(?:[.,]\d+)*%?\b/g) || [];
  entities.push(...numbers.map(num => ({ text: num, type: 'NUMBER' })));
  return entities;
}

function classifyClaims(claims, claimType) {
  return {
    primary_type: claimType,
    detected_types: [...new Set(claims.map(c => c.type))],
    classification_confidence: 0.8
  };
}

function calculateExtractionConfidence(claims) {
  return Math.min(1, (claims.filter(c => c.verifiable).length / Math.max(claims.length, 1)) * 0.8 + 0.2);
}

function analyzeContentQuality(text) {
  return {
    readability: calculateReadabilityScore(text),
    coherence: calculateCoherenceScore(text),
    specificity: calculateSpecificityScore(text),
    overall_score: 0.7
  };
}

function calculateReadabilityScore(text) {
  const sentences = text.split(/[.!?]+/).length;
  const words = text.split(/\s+/).length;
  const avgWordsPerSentence = words / sentences;
  return Math.max(0, Math.min(1, (100 - avgWordsPerSentence) / 100));
}

function calculateCoherenceScore(text) {
  const transitions = (text.match(/(however|therefore|moreover|furthermore)/gi) || []).length;
  const sentences = text.split(/[.!?]+/).length;
  return Math.min(1, transitions / sentences + 0.5);
}

function calculateSpecificityScore(text) {
  const specific = (text.match(/(\d{4}|\d+%|\$\d+|according to)/gi) || []).length;
  const words = text.split(/\s+/).length;
  return Math.min(1, (specific * 20) / words);
}

function detectManipulationIndicators(text, sourceUrls) {
  let riskScore = 0;
  const flags = [];
  
  const emotionalWords = /(shocking|unbelievable|exclusive|breaking)/gi;
  const emotionalMatches = text.match(emotionalWords) || [];
  if (emotionalMatches.length > 2) {
    riskScore += 0.2;
    flags.push('High emotional language');
  }
  
  if (!sourceUrls || sourceUrls.length === 0) {
    riskScore += 0.25;
    flags.push('No sources provided');
  }
  
  return {
    risk_score: Math.min(1, riskScore),
    flags,
    emotional_language_count: emotionalMatches.length
  };
}

function analyzeLinguisticBias(text) {
  const biasIndicators = {
    political_left: /(progressive|liberal|equality)/gi,
    political_right: /(conservative|traditional|law and order)/gi,
    sensational: /(shocking|outrageous|scandal)/gi
  };
  
  const scores = {};
  const totalWords = text.split(/\s+/).length;
  
  Object.keys(biasIndicators).forEach(category => {
    const matches = text.match(biasIndicators[category]) || [];
    scores[category] = matches.length / totalWords;
  });
  
  const objectivity = 1 - Math.max(...Object.values(scores));
  
  return {
    bias_scores: scores,
    objectivity: Math.max(0, Math.min(1, objectivity))
  };
}

function generateContentFingerprint(text) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

async function searchAuthoritativeSources(claimText) {
  // Simulated search - in production would use real APIs
  return {
    sources: [{
      url: 'https://example-news.com/article',
      title: 'Related Article',
      credibility_score: 0.8,
      verdict: 'supporting',
      relevant_excerpt: 'Supporting text...'
    }],
    authoritative: [{ domain: 'reuters.com', credibility: 0.9 }]
  };
}

async function analyzeProvidedSources(claimText, sourceUrls) {
  return { analysis_complete: true, sources_analyzed: sourceUrls.length };
}

function determineVerificationStatus(searchResults, sourceAnalysis) {
  return 'neutral'; // Simplified logic
}

function calculateFactCheckConfidence(allEvidence) {
  return Math.min(0.8, allEvidence.length * 0.2 + 0.4);
}

async function fetchExistingSource(url, supabaseUrl, serviceRoleKey) {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/sources?source_url=eq.${encodeURIComponent(url)}`, {
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.length > 0 ? data[0] : null;
    }
  } catch (error) {
    console.warn('Error fetching existing source:', error);
  }
  return null;
}

async function storeNewSource(sourceData, supabaseUrl, serviceRoleKey) {
  try {
    const sourceRecord = {
      source_url: sourceData.url,
      source_title: sourceData.title || '',
      source_domain: sourceData.domain,
      credibility_score: sourceData.credibility_score,
      source_type: sourceData.source_type || 'other',
      source_metadata: {
        assessment_date: new Date().toISOString()
      },
      first_seen: new Date().toISOString(),
      last_verified: new Date().toISOString()
    };
    
    await fetch(`${supabaseUrl}/rest/v1/sources`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sourceRecord)
    });
  } catch (error) {
    console.warn('Error storing source:', error);
  }
}

async function findSimilarClaims(claimText, supabaseUrl, serviceRoleKey) {
  try {
    const searchQuery = claimText.toLowerCase().split(' ').slice(0, 5).join(' & ');
    const response = await fetch(
      `${supabaseUrl}/rest/v1/claims?claim_text=fts.${encodeURIComponent(searchQuery)}&limit=10`, 
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      return data.filter(claim => claim.claim_text !== claimText);
    }
  } catch (error) {
    console.warn('Error finding similar claims:', error);
  }
  return [];
}

function detectDuplicateClaims(claimText, similarClaims) {
  return {
    is_duplicate: false,
    similarity_scores: similarClaims.map(claim => ({
      claim_id: claim.id,
      similarity: 0.3
    }))
  };
}

function calculateNoveltyScore(duplicateAnalysis, similarClaims) {
  return duplicateAnalysis.is_duplicate ? 0.1 : Math.max(0.5, 1 - similarClaims.length * 0.1);
}

function calculateCrossReferenceConfidence(similarClaims) {
  return Math.min(0.9, similarClaims.length * 0.1 + 0.5);
}

async function assessSourceCredibility(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    const domainReputations = {
      'reuters.com': 0.95, 'bbc.com': 0.92, 'apnews.com': 0.94,
      'cnn.com': 0.78, 'nytimes.com': 0.88, 'nature.com': 0.98,
      'wikipedia.org': 0.75, 'youtube.com': 0.45, 'twitter.com': 0.35
    };
    
    let credibilityScore = domainReputations[domain] || 0.5;
    
    if (url.includes('https://')) credibilityScore += 0.05;
    if (domain.includes('.gov')) credibilityScore = Math.max(credibilityScore, 0.85);
    if (domain.includes('.edu')) credibilityScore = Math.max(credibilityScore, 0.82);
    
    let sourceType = 'other';
    if (domain.includes('.gov')) sourceType = 'government';
    else if (domain.includes('.edu')) sourceType = 'academic';
    else if (['reuters.com', 'bbc.com', 'cnn.com'].includes(domain)) sourceType = 'news';
    else if (['twitter.com', 'youtube.com'].includes(domain)) sourceType = 'social';
    
    return {
      url,
      domain,
      credibility_score: Math.max(0, Math.min(1, credibilityScore)),
      source_type: sourceType,
      title: '',
      from_database: false
    };
  } catch (error) {
    return {
      url, domain: 'unknown', credibility_score: 0.3, source_type: 'other',
      title: '', error: error.message, from_database: false
    };
  }
}

function generateScoringJustification(factors, weights, finalScore) {
  let justification = `Reliability Assessment:\n\n`;
  
  Object.keys(factors).forEach(factor => {
    const score = factors[factor];
    const weight = weights[factor];
    const contribution = score * weight;
    justification += `• ${factor.toUpperCase()}: ${score.toFixed(3)} (${(weight * 100).toFixed(1)}% weight)\n`;
  });
  
  justification += `\nFinal score: ${finalScore.toFixed(3)}`;
  return justification;
}

function calculateScoringConfidence(factors, previousOutputs) {
  const confidenceValues = Object.values(factors);
  const mean = confidenceValues.reduce((sum, val) => sum + val, 0) / confidenceValues.length;
  const variance = confidenceValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / confidenceValues.length;
  const stdDev = Math.sqrt(variance);
  
  return {
    lower: Math.max(0, mean - 1.96 * stdDev),
    upper: Math.min(1, mean + 1.96 * stdDev),
    confidence: mean
  };
}

// Report Generation Helpers
function categorizeReliabilityScore(score) {
  if (score >= 0.8) return 'highly_reliable';
  if (score >= 0.6) return 'reliable';
  if (score >= 0.4) return 'questionable';
  if (score >= 0.2) return 'unreliable';
  return 'highly_unreliable';
}

function calculateConfidenceLevel(processingResults) {
  const confidenceValues = Object.values(processingResults)
    .filter(result => result.confidence !== undefined)
    .map(result => result.confidence);
  
  if (confidenceValues.length === 0) return 0.5;
  return confidenceValues.reduce((sum, conf) => sum + conf, 0) / confidenceValues.length;
}

function generateReportSummary(claimText, reliabilityScore, processingResults) {
  const verdict = categorizeReliabilityScore(reliabilityScore);
  const confidence = calculateConfidenceLevel(processingResults);
  
  let summary = `Fact-check of: "${claimText.substring(0, 100)}..."\n\n`;
  summary += `Verdict: ${verdict.toUpperCase()} (${reliabilityScore.toFixed(3)})\n`;
  summary += `Confidence: ${(confidence * 100).toFixed(1)}%\n\n`;
  summary += `Analysis completed with ${Object.keys(processingResults).length} AI agents.`;
  
  return summary;
}

function extractFactorScores(processingResults) {
  return {
    content_quality: processingResults.content_analysis?.confidence || 0.5,
    fact_verification: processingResults.fact_checking?.confidence || 0.5,
    source_credibility: processingResults.source_validation?.confidence || 0.5,
    cross_reference: processingResults.cross_referencing?.confidence || 0.5,
    claim_detection: processingResults.claim_detection?.confidence || 0.5
  };
}

function calculateConfidenceIntervals(processingResults) {
  const confidenceValues = Object.values(processingResults)
    .filter(result => result.confidence !== undefined)
    .map(result => result.confidence);
  
  if (confidenceValues.length === 0) {
    return { lower: 0.4, upper: 0.6, confidence: 0.5 };
  }
  
  const mean = confidenceValues.reduce((sum, val) => sum + val, 0) / confidenceValues.length;
  const variance = confidenceValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / confidenceValues.length;
  const stdDev = Math.sqrt(variance);
  
  return {
    lower: Math.max(0, mean - 1.96 * stdDev),
    upper: Math.min(1, mean + 1.96 * stdDev),
    confidence: mean
  };
}

function calculateSourceDiversity(evidenceChain) {
  const domains = new Set();
  const sourceTypes = new Set();
  
  evidenceChain.forEach(evidence => {
    if (evidence.source && evidence.source.includes('http')) {
      try {
        const url = new URL(evidence.source);
        domains.add(url.hostname);
      } catch (e) {}
    }
    if (evidence.type) sourceTypes.add(evidence.type);
  });
  
  return {
    unique_domains: domains.size,
    source_types: sourceTypes.size,
    diversity_score: (domains.size + sourceTypes.size) / Math.max(1, evidenceChain.length)
  };
}