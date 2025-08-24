// Complete helper functions for the claim processing system

import {
  executeClaimDetector,
  executeContentAnalyzer,
  executeFactChecker,
  executeSourceValidator,
  executeCrossReferencer,
  executeReliabilityScorer
} from './agent-logic.ts';

// Main agent step execution dispatcher
export async function executeAgentStep(step, context) {
  const startTime = Date.now();
  
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

// Utility functions for report generation
export function categorizeReliabilityScore(score) {
  if (score >= 0.8) return 'highly_reliable';
  if (score >= 0.6) return 'reliable';
  if (score >= 0.4) return 'questionable';
  if (score >= 0.2) return 'unreliable';
  return 'highly_unreliable';
}

export function calculateConfidenceLevel(processingResults) {
  const confidenceValues = Object.values(processingResults)
    .filter(result => result.confidence !== undefined)
    .map(result => result.confidence);
  
  if (confidenceValues.length === 0) return 0.5;
  
  return confidenceValues.reduce((sum, conf) => sum + conf, 0) / confidenceValues.length;
}

export function generateReportSummary(claimText, reliabilityScore, processingResults) {
  const verdict = categorizeReliabilityScore(reliabilityScore);
  const confidence = calculateConfidenceLevel(processingResults);
  
  let summary = `Fact-check analysis of claim: "${claimText.substring(0, 100)}${claimText.length > 100 ? '...' : ''}"\n\n`;
  summary += `Overall Verdict: ${verdict.toUpperCase()} (Score: ${reliabilityScore.toFixed(3)})\n`;
  summary += `Confidence Level: ${(confidence * 100).toFixed(1)}%\n\n`;
  
  // Add key findings from each agent
  if (processingResults.fact_checking) {
    const factCheck = processingResults.fact_checking;
    if (factCheck.overall_verification) {
      summary += `Fact Verification: ${factCheck.overall_verification.supporting} supporting, ${factCheck.overall_verification.contradicting} contradicting sources found\n`;
    }
  }
  
  if (processingResults.source_validation) {
    const sourceVal = processingResults.source_validation;
    summary += `Source Quality: Average credibility score ${sourceVal.average_credibility?.toFixed(2) || 'N/A'}\n`;
  }
  
  if (processingResults.cross_referencing) {
    const crossRef = processingResults.cross_referencing;
    summary += `Cross-References: ${crossRef.similar_claims?.length || 0} similar claims found\n`;
  }
  
  summary += `\nAnalysis completed with ${Object.keys(processingResults).length} AI agents.`;
  
  return summary;
}

export function extractFactorScores(processingResults) {
  return {
    content_quality: processingResults.content_analysis?.confidence || 0.5,
    fact_verification: processingResults.fact_checking?.confidence || 0.5,
    source_credibility: processingResults.source_validation?.confidence || 0.5,
    cross_reference: processingResults.cross_referencing?.confidence || 0.5,
    claim_detection: processingResults.claim_detection?.confidence || 0.5
  };
}

export function calculateConfidenceIntervals(processingResults) {
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

export function calculateSourceDiversity(evidenceChain) {
  const domains = new Set();
  const sourceTypes = new Set();
  
  evidenceChain.forEach(evidence => {
    if (evidence.source && evidence.source.includes('http')) {
      try {
        const url = new URL(evidence.source);
        domains.add(url.hostname);
      } catch (e) {
        // Invalid URL, skip
      }
    }
    
    if (evidence.type) {
      sourceTypes.add(evidence.type);
    }
  });
  
  return {
    unique_domains: domains.size,
    source_types: sourceTypes.size,
    diversity_score: (domains.size + sourceTypes.size) / Math.max(1, evidenceChain.length)
  };
}

// Database helper functions
export async function fetchExistingSource(url, supabaseUrl, serviceRoleKey) {
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

export async function storeNewSource(sourceData, supabaseUrl, serviceRoleKey) {
  try {
    const sourceRecord = {
      source_url: sourceData.url,
      source_title: sourceData.title || '',
      source_domain: sourceData.domain,
      credibility_score: sourceData.credibility_score,
      source_type: sourceData.source_type || 'other',
      source_metadata: {
        assessment_date: new Date().toISOString(),
        assessment_method: 'automated',
        credibility_factors: sourceData.credibility_factors || {}
      },
      first_seen: new Date().toISOString(),
      last_verified: new Date().toISOString()
    };
    
    const response = await fetch(`${supabaseUrl}/rest/v1/sources`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'apikey': serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sourceRecord)
    });
    
    if (!response.ok) {
      console.warn('Failed to store new source:', await response.text());
    }
  } catch (error) {
    console.warn('Error storing new source:', error);
  }
}

export async function findSimilarClaims(claimText, supabaseUrl, serviceRoleKey) {
  try {
    // Use full-text search to find similar claims
    const searchQuery = claimText.toLowerCase().split(' ').slice(0, 5).join(' & ');
    const response = await fetch(
      `${supabaseUrl}/rest/v1/claims?claim_text=fts.${encodeURIComponent(searchQuery)}&limit=20`, 
      {
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'apikey': serviceRoleKey
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      return data.filter(claim => claim.claim_text !== claimText); // Exclude exact match
    }
  } catch (error) {
    console.warn('Error finding similar claims:', error);
  }
  
  return [];
}

// Source credibility assessment (simplified version)
export async function assessSourceCredibility(url) {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    // Domain reputation mapping (in production, use comprehensive database)
    const domainReputations = {
      'reuters.com': 0.95,
      'bbc.com': 0.92,
      'apnews.com': 0.94,
      'cnn.com': 0.78,
      'foxnews.com': 0.72,
      'nytimes.com': 0.88,
      'washingtonpost.com': 0.87,
      'theguardian.com': 0.85,
      'nature.com': 0.98,
      'sciencemag.org': 0.97,
      'wikipedia.org': 0.75,
      'youtube.com': 0.45,
      'twitter.com': 0.35,
      'facebook.com': 0.30
    };
    
    let credibilityScore = domainReputations[domain] || 0.5;
    
    // Adjust based on URL characteristics
    if (url.includes('https://')) credibilityScore += 0.05;
    if (domain.includes('.gov')) credibilityScore = Math.max(credibilityScore, 0.85);
    if (domain.includes('.edu')) credibilityScore = Math.max(credibilityScore, 0.82);
    if (domain.includes('.org') && !domain.includes('wikipedia')) credibilityScore += 0.05;
    
    // Determine source type
    let sourceType = 'other';
    if (domain.includes('.gov')) sourceType = 'government';
    else if (domain.includes('.edu') || ['nature.com', 'sciencemag.org'].includes(domain)) sourceType = 'academic';
    else if (['reuters.com', 'bbc.com', 'apnews.com', 'cnn.com', 'foxnews.com', 'nytimes.com'].includes(domain)) sourceType = 'news';
    else if (['twitter.com', 'facebook.com', 'youtube.com'].includes(domain)) sourceType = 'social';
    
    return {
      url,
      domain,
      credibility_score: Math.max(0, Math.min(1, credibilityScore)),
      source_type: sourceType,
      title: '', // Would be extracted from page in production
      credibility_factors: {
        domain_reputation: domainReputations[domain] !== undefined,
        secure_connection: url.includes('https://'),
        institutional_domain: domain.includes('.gov') || domain.includes('.edu')
      },
      from_database: false
    };
    
  } catch (error) {
    return {
      url,
      domain: 'unknown',
      credibility_score: 0.3,
      source_type: 'other',
      title: '',
      error: error.message,
      from_database: false
    };
  }
}

// Additional utility functions for analysis
export function detectManipulationIndicators(text, sourceUrls) {
  let riskScore = 0;
  const flags = [];
  
  // Check for emotional manipulation language
  const emotionalWords = /(shocking|unbelievable|must see|exclusive|breaking|urgent|alarming)/gi;
  const emotionalMatches = text.match(emotionalWords) || [];
  if (emotionalMatches.length > 2) {
    riskScore += 0.2;
    flags.push('High emotional language detected');
  }
  
  // Check for unsupported superlatives
  const superlatives = /(always|never|all|every|most|best|worst|only)/gi;
  const superlativeMatches = text.match(superlatives) || [];
  if (superlativeMatches.length > 3) {
    riskScore += 0.15;
    flags.push('Excessive use of absolute statements');
  }
  
  // Check source diversity
  if (sourceUrls && sourceUrls.length === 0) {
    riskScore += 0.25;
    flags.push('No sources provided');
  } else if (sourceUrls && sourceUrls.length === 1) {
    riskScore += 0.1;
    flags.push('Single source dependency');
  }
  
  return {
    risk_score: Math.min(1, riskScore),
    flags,
    emotional_language_count: emotionalMatches.length,
    superlative_count: superlativeMatches.length
  };
}

export function analyzeLinguisticBias(text) {
  // Simplified bias detection
  const biasIndicators = {
    political_left: /(progressive|liberal|equality|social justice|inclusive)/gi,
    political_right: /(conservative|traditional|law and order|free market)/gi,
    sensational: /(shocking|outrageous|scandal|exposed|reveals)/gi,
    hedging: /(might|could|possibly|allegedly|reportedly)/gi
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
    objectivity: Math.max(0, Math.min(1, objectivity)),
    dominant_bias: Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b),
    hedging_ratio: scores.hedging || 0
  };
}

export function generateContentFingerprint(text) {
  // Simple content fingerprinting for duplicate detection
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Generate hash-like fingerprint (simplified)
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(16);
}

export function generateScoringJustification(factors, weights, finalScore) {
  let justification = `Reliability Assessment Breakdown:\n\n`;
  
  Object.keys(factors).forEach(factor => {
    const score = factors[factor];
    const weight = weights[factor];
    const contribution = score * weight;
    const percentage = (weight * 100).toFixed(1);
    
    justification += `• ${factor.replace('_', ' ').toUpperCase()}: ${score.toFixed(3)} (${percentage}% weight) = ${contribution.toFixed(3)} contribution\n`;
  });
  
  justification += `\nFinal weighted score: ${finalScore.toFixed(3)}\n`;
  justification += `Reliability category: ${categorizeReliabilityScore(finalScore).replace('_', ' ').toUpperCase()}`;
  
  return justification;
}