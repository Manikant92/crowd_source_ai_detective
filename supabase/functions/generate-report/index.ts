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
    const url = new URL(req.url);
    const reportId = url.searchParams.get('id');
    const claimId = url.searchParams.get('claim_id');
    const format = url.searchParams.get('format') || 'json';
    
    if (!reportId && !claimId) {
      throw new Error('Either report ID or claim ID is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    let reportData = null;
    let claimData = null;
    let verificationData = [];
    let auditData = [];

    // Fetch report data
    if (reportId) {
      const reportResponse = await fetch(
        `${supabaseUrl}/rest/v1/reports?id=eq.${reportId}`,
        {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
          }
        }
      );
      
      if (reportResponse.ok) {
        const reports = await reportResponse.json();
        if (reports.length > 0) {
          reportData = reports[0];
        }
      }
    } else {
      // Find report by claim ID
      const reportResponse = await fetch(
        `${supabaseUrl}/rest/v1/reports?claim_id=eq.${claimId}&order=generated_at.desc&limit=1`,
        {
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': serviceRoleKey
          }
        }
      );
      
      if (reportResponse.ok) {
        const reports = await reportResponse.json();
        if (reports.length > 0) {
          reportData = reports[0];
        }
      }
    }

    if (!reportData) {
      throw new Error('Report not found');
    }

    const targetClaimId = reportData.claim_id;

    // Fetch associated claim data
    const claimResponse = await fetch(
      `${supabaseUrl}/rest/v1/claims?id=eq.${targetClaimId}`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      }
    );

    if (claimResponse.ok) {
      const claims = await claimResponse.json();
      if (claims.length > 0) {
        claimData = claims[0];
      }
    }

    // Fetch community verifications
    const verificationResponse = await fetch(
      `${supabaseUrl}/rest/v1/verifications?claim_id=eq.${targetClaimId}&order=verified_at.desc`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      }
    );

    if (verificationResponse.ok) {
      verificationData = await verificationResponse.json();
    }

    // Fetch audit trail
    const auditResponse = await fetch(
      `${supabaseUrl}/rest/v1/audit_logs?entity_id=eq.${targetClaimId}&order=created_at.desc&limit=50`,
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      }
    );

    if (auditResponse.ok) {
      auditData = await auditResponse.json();
    }

    // Generate comprehensive report
    const comprehensiveReport = generateComprehensiveReport({
      reportData,
      claimData,
      verificationData,
      auditData
    });

    // Return in requested format
    if (format === 'html') {
      const htmlReport = generateHTMLReport(comprehensiveReport);
      return new Response(htmlReport, {
        headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
      });
    } else if (format === 'markdown') {
      const markdownReport = generateMarkdownReport(comprehensiveReport);
      return new Response(markdownReport, {
        headers: { ...corsHeaders, 'Content-Type': 'text/markdown; charset=utf-8' }
      });
    } else {
      return new Response(JSON.stringify({
        data: comprehensiveReport
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Report generation error:', error);

    return new Response(JSON.stringify({
      error: {
        code: 'REPORT_GENERATION_FAILED',
        message: error.message
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Generate comprehensive report structure
function generateComprehensiveReport({ reportData, claimData, verificationData, auditData }) {
  const processingResults = reportData.report_data?.processing_results || {};
  const reliabilityBreakdown = reportData.reliability_breakdown || {};
  const evidenceSummary = reportData.evidence_summary || {};

  return {
    report_metadata: {
      report_id: reportData.id,
      claim_id: reportData.claim_id,
      generated_at: reportData.generated_at,
      report_type: reportData.report_type,
      format_version: '1.0'
    },
    claim_information: {
      claim_text: claimData?.claim_text || 'Not available',
      claim_type: claimData?.claim_type || 'unknown',
      submitted_at: claimData?.submitted_at,
      source_urls: claimData?.source_urls ? JSON.parse(claimData.source_urls) : [],
      tags: claimData?.tags ? JSON.parse(claimData.tags) : [],
      current_status: claimData?.status || 'unknown'
    },
    reliability_assessment: {
      overall_score: reliabilityBreakdown.overall_score || claimData?.reliability_score || 0.5,
      verdict_category: categorizeReliabilityScore(reliabilityBreakdown.overall_score || claimData?.reliability_score || 0.5),
      confidence_level: reliabilityBreakdown.confidence_intervals?.confidence || 0.5,
      factor_breakdown: reliabilityBreakdown.factor_scores || {},
      confidence_intervals: reliabilityBreakdown.confidence_intervals || {}
    },
    ai_analysis: {
      workflow_id: processingResults.workflow_id || reportData.report_data?.workflow_id,
      processing_steps: Object.keys(processingResults).length,
      step_results: processingResults,
      evidence_chain: evidenceSummary.evidence_chain || [],
      source_analysis: processingResults.source_validation || {},
      fact_check_results: processingResults.fact_checking || {},
      content_analysis: processingResults.content_analysis || {}
    },
    community_verification: {
      total_verifications: verificationData.length,
      verification_breakdown: analyzeVerificationBreakdown(verificationData),
      consensus_analysis: analyzeCommunityConsensus(verificationData),
      individual_verifications: verificationData.slice(0, 10).map(v => ({
        verdict: v.verdict,
        confidence_score: v.confidence_score,
        verification_type: v.verification_type,
        verified_at: v.verified_at,
        upvotes: v.upvotes,
        downvotes: v.downvotes,
        justification_preview: v.justification?.substring(0, 200) + (v.justification?.length > 200 ? '...' : '') || ''
      }))
    },
    transparency_audit: {
      total_audit_entries: auditData.length,
      processing_timeline: buildProcessingTimeline(auditData),
      state_changes: auditData.filter(entry => entry.action_type === 'updated').length,
      system_actions: auditData.filter(entry => entry.is_system_action).length,
      user_actions: auditData.filter(entry => !entry.is_system_action).length,
      audit_trail: auditData.slice(0, 20).map(entry => ({
        timestamp: entry.created_at,
        action: entry.action_type,
        entity_type: entry.entity_type,
        is_system: entry.is_system_action,
        metadata: entry.action_metadata
      }))
    },
    source_credibility: {
      source_diversity: evidenceSummary.source_diversity || {},
      total_sources: evidenceSummary.total_sources || 0,
      credible_sources: countCredibleSources(processingResults.source_validation),
      source_breakdown: extractSourceBreakdown(processingResults)
    },
    report_summary: {
      executive_summary: generateExecutiveSummary(claimData, reliabilityBreakdown, verificationData),
      key_findings: extractKeyFindings(processingResults, verificationData),
      limitations: identifyLimitations(processingResults, verificationData),
      recommendations: generateRecommendations(reliabilityBreakdown, verificationData)
    }
  };
}

// Helper functions
function categorizeReliabilityScore(score) {
  if (score >= 0.8) return 'Highly Reliable';
  if (score >= 0.6) return 'Reliable';
  if (score >= 0.4) return 'Questionable';
  if (score >= 0.2) return 'Unreliable';
  return 'Highly Unreliable';
}

function analyzeVerificationBreakdown(verifications) {
  const breakdown = { true: 0, false: 0, mixed: 0, unverified: 0, misleading: 0 };
  
  verifications.forEach(v => {
    if (breakdown.hasOwnProperty(v.verdict)) {
      breakdown[v.verdict]++;
    }
  });
  
  return breakdown;
}

function analyzeCommunityConsensus(verifications) {
  if (verifications.length === 0) {
    return { consensus_reached: false, agreement_level: 0 };
  }
  
  const verdictCounts = analyzeVerificationBreakdown(verifications);
  const totalVerifications = verifications.length;
  const dominantVerdict = Object.entries(verdictCounts)
    .reduce((max, [verdict, count]) => count > max.count ? { verdict, count } : max, { verdict: null, count: 0 });
  
  const agreementLevel = dominantVerdict.count / totalVerifications;
  
  return {
    consensus_reached: agreementLevel >= 0.6 && totalVerifications >= 3,
    agreement_level: agreementLevel,
    dominant_verdict: dominantVerdict.verdict,
    total_participants: totalVerifications
  };
}

function buildProcessingTimeline(auditData) {
  return auditData
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(entry => ({
      timestamp: entry.created_at,
      event: entry.action_type,
      details: entry.action_metadata
    }));
}

function countCredibleSources(sourceValidation) {
  if (!sourceValidation || !sourceValidation.source_validations) {
    return { high: 0, medium: 0, low: 0 };
  }
  
  const sources = sourceValidation.source_validations;
  return {
    high: sources.filter(s => s.credibility_score > 0.7).length,
    medium: sources.filter(s => s.credibility_score >= 0.4 && s.credibility_score <= 0.7).length,
    low: sources.filter(s => s.credibility_score < 0.4).length
  };
}

function extractSourceBreakdown(processingResults) {
  const sourceTypes = {};
  
  if (processingResults.source_validation?.source_validations) {
    processingResults.source_validation.source_validations.forEach(source => {
      const type = source.source_type || 'unknown';
      sourceTypes[type] = (sourceTypes[type] || 0) + 1;
    });
  }
  
  return sourceTypes;
}

function generateExecutiveSummary(claimData, reliabilityBreakdown, verificationData) {
  const claimText = claimData?.claim_text?.substring(0, 150) + '...' || 'Claim text not available';
  const score = reliabilityBreakdown.overall_score || claimData?.reliability_score || 0.5;
  const category = categorizeReliabilityScore(score);
  const communityVerifications = verificationData.length;
  
  return `Fact-check analysis of: "${claimText}". ` +
         `Overall reliability assessment: ${category} (${(score * 100).toFixed(1)}%). ` +
         `Analysis includes AI-powered multi-agent verification and ${communityVerifications} community verification(s). ` +
         `Full audit trail and evidence chain available for complete transparency.`;
}

function extractKeyFindings(processingResults, verificationData) {
  const findings = [];
  
  if (processingResults.fact_checking?.overall_verification) {
    const factCheck = processingResults.fact_checking.overall_verification;
    findings.push(`Fact-checking found ${factCheck.supporting} supporting and ${factCheck.contradicting} contradicting sources`);
  }
  
  if (processingResults.source_validation?.average_credibility) {
    const avgCredibility = processingResults.source_validation.average_credibility;
    findings.push(`Average source credibility score: ${(avgCredibility * 100).toFixed(1)}%`);
  }
  
  if (verificationData.length > 0) {
    const consensus = analyzeCommunityConsensus(verificationData);
    findings.push(`Community consensus: ${consensus.consensus_reached ? 'Reached' : 'Not reached'} (${(consensus.agreement_level * 100).toFixed(1)}% agreement)`);
  }
  
  if (processingResults.cross_referencing?.similar_claims) {
    const similarCount = processingResults.cross_referencing.similar_claims.length;
    findings.push(`${similarCount} similar claims found in database`);
  }
  
  return findings;
}

function identifyLimitations(processingResults, verificationData) {
  const limitations = [];
  
  if (verificationData.length < 3) {
    limitations.push('Limited community verification (fewer than 3 verifications)');
  }
  
  if (!processingResults.source_validation?.source_validations?.length) {
    limitations.push('No source URLs provided for validation');
  }
  
  if (processingResults.content_analysis?.manipulation_flags?.risk_score > 0.5) {
    limitations.push('Content shows potential manipulation indicators');
  }
  
  return limitations;
}

function generateRecommendations(reliabilityBreakdown, verificationData) {
  const recommendations = [];
  const score = reliabilityBreakdown.overall_score || 0.5;
  
  if (score < 0.6) {
    recommendations.push('Exercise caution when sharing this claim');
    recommendations.push('Seek additional verification from authoritative sources');
  }
  
  if (verificationData.length < 5) {
    recommendations.push('Additional community verifications would improve confidence');
  }
  
  if (score >= 0.8) {
    recommendations.push('Claim shows high reliability across multiple verification methods');
  }
  
  return recommendations;
}

// HTML Report Generation
function generateHTMLReport(report) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fact-Check Report - ${report.report_metadata.report_id}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background: #f8fafc; }
        .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background: #1e40af; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; }
        .section { margin-bottom: 30px; }
        .score-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; }
        .score-high { background: #10b981; color: white; }
        .score-medium { background: #f59e0b; color: white; }
        .score-low { background: #ef4444; color: white; }
        .evidence-item { background: #f1f5f9; padding: 12px; border-radius: 6px; margin: 8px 0; }
        .audit-entry { border-left: 3px solid #3b82f6; padding: 8px 12px; margin: 4px 0; background: #f8fafc; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>AI Detective Fact-Check Report</h1>
            <p>Report ID: ${report.report_metadata.report_id}</p>
            <p>Generated: ${new Date(report.report_metadata.generated_at).toLocaleString()}</p>
        </div>
        
        <div class="content">
            <div class="section">
                <h2>Executive Summary</h2>
                <p>${report.report_summary.executive_summary}</p>
                
                <h3>Reliability Assessment</h3>
                <span class="score-badge ${getScoreClass(report.reliability_assessment.overall_score)}">
                    ${report.reliability_assessment.verdict_category}: ${(report.reliability_assessment.overall_score * 100).toFixed(1)}%
                </span>
            </div>
            
            <div class="section">
                <h2>Claim Information</h2>
                <p><strong>Claim:</strong> ${report.claim_information.claim_text}</p>
                <p><strong>Type:</strong> ${report.claim_information.claim_type}</p>
                <p><strong>Submitted:</strong> ${new Date(report.claim_information.submitted_at).toLocaleString()}</p>
            </div>
            
            <div class="section">
                <h2>Key Findings</h2>
                <ul>
                    ${report.report_summary.key_findings.map(finding => `<li>${finding}</li>`).join('')}
                </ul>
            </div>
            
            <div class="section">
                <h2>AI Analysis Results</h2>
                <p><strong>Processing Steps:</strong> ${report.ai_analysis.processing_steps}</p>
                <p><strong>Evidence Sources:</strong> ${report.ai_analysis.evidence_chain.length}</p>
            </div>
            
            <div class="section">
                <h2>Community Verification</h2>
                <p><strong>Total Verifications:</strong> ${report.community_verification.total_verifications}</p>
                <p><strong>Consensus:</strong> ${report.community_verification.consensus_analysis.consensus_reached ? 'Reached' : 'Not Reached'}</p>
            </div>
            
            <div class="section">
                <h2>Recommendations</h2>
                <ul>
                    ${report.report_summary.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        </div>
    </div>
</body>
</html>`;
}

function getScoreClass(score) {
  if (score >= 0.6) return 'score-high';
  if (score >= 0.4) return 'score-medium';
  return 'score-low';
}

// Markdown Report Generation
function generateMarkdownReport(report) {
  return `# AI Detective Fact-Check Report

**Report ID:** ${report.report_metadata.report_id}  
**Generated:** ${new Date(report.report_metadata.generated_at).toLocaleString()}

## Executive Summary

${report.report_summary.executive_summary}

### Reliability Assessment

**${report.reliability_assessment.verdict_category}**: ${(report.reliability_assessment.overall_score * 100).toFixed(1)}%

## Claim Information

**Claim:** ${report.claim_information.claim_text}

**Type:** ${report.claim_information.claim_type}  
**Submitted:** ${new Date(report.claim_information.submitted_at).toLocaleString()}

## Key Findings

${report.report_summary.key_findings.map(finding => `- ${finding}`).join('\n')}

## AI Analysis Results

- **Processing Steps:** ${report.ai_analysis.processing_steps}
- **Evidence Sources:** ${report.ai_analysis.evidence_chain.length}

## Community Verification

- **Total Verifications:** ${report.community_verification.total_verifications}
- **Consensus:** ${report.community_verification.consensus_analysis.consensus_reached ? 'Reached' : 'Not Reached'}

## Recommendations

${report.report_summary.recommendations.map(rec => `- ${rec}`).join('\n')}

---
*Generated by AI Detective - Crowd-Sourced Fact-Checking Platform*`;
}