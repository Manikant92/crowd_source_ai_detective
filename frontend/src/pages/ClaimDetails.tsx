import React, { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, User, ExternalLink, TrendingUp, Users, FileText, ChevronRight, ThumbsUp, ThumbsDown, MessageSquare, AlertTriangle, CheckCircle, Eye } from 'lucide-react'
import { supabase, submitVerification } from '../lib/supabase'
import { Button } from '../components/ui/button'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { useAuth } from '../contexts/AuthContext'

export function ClaimDetails() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [showVerificationForm, setShowVerificationForm] = useState(false)
  const [verificationData, setVerificationData] = useState({
    verdict: '',
    confidence_score: 0.5,
    justification: '',
    evidence_links: ['']
  })

  // Fetch claim details
  const { data: claim, isLoading: claimLoading } = useQuery({
    queryKey: ['claim', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('claims')
        .select('*')
        .eq('id', id)
        .single()
      
      if (error) throw error
      return data
    },
    enabled: !!id
  })

  // Fetch verifications
  const { data: verifications, isLoading: verificationsLoading } = useQuery({
    queryKey: ['verifications', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('verifications')
        .select('*')
        .eq('claim_id', id)
        .order('verified_at', { ascending: false })
      
      if (error) throw error
      return data || []
    },
    enabled: !!id
  })

  // Fetch report
  const { data: report } = useQuery({
    queryKey: ['report', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('claim_id', id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      
      if (error) throw error
      return data
    },
    enabled: !!id
  })

  // Submit verification mutation
  const verifyMutation = useMutation({
    mutationFn: submitVerification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verifications', id] })
      setShowVerificationForm(false)
      setVerificationData({
        verdict: '',
        confidence_score: 0.5,
        justification: '',
        evidence_links: ['']
      })
    }
  })

  const handleVerificationSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !verificationData.verdict) return

    verifyMutation.mutate({
      claim_id: id,
      verdict: verificationData.verdict,
      confidence_score: verificationData.confidence_score,
      justification: verificationData.justification,
      evidence_links: verificationData.evidence_links.filter(link => link.trim())
    })
  }

  const addEvidenceLink = () => {
    setVerificationData({
      ...verificationData,
      evidence_links: [...verificationData.evidence_links, '']
    })
  }

  const updateEvidenceLink = (index: number, value: string) => {
    const newLinks = [...verificationData.evidence_links]
    newLinks[index] = value
    setVerificationData({ ...verificationData, evidence_links: newLinks })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'processing': return 'bg-blue-100 text-blue-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'disputed': return 'bg-red-100 text-red-800'
      default: return 'bg-slate-100 text-slate-800'
    }
  }

  const getReliabilityColor = (score: number | null) => {
    if (!score) return 'bg-slate-100 text-slate-800'
    if (score >= 0.8) return 'bg-green-100 text-green-800'
    if (score >= 0.6) return 'bg-blue-100 text-blue-800'
    if (score >= 0.4) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  const getReliabilityLabel = (score: number | null) => {
    if (!score) return 'Pending Analysis'
    if (score >= 0.8) return 'Highly Reliable'
    if (score >= 0.6) return 'Reliable'
    if (score >= 0.4) return 'Questionable'
    return 'Unreliable'
  }

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case 'true': return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'false': return <AlertTriangle className="w-4 h-4 text-red-600" />
      case 'mixed': return <Eye className="w-4 h-4 text-yellow-600" />
      default: return <MessageSquare className="w-4 h-4 text-slate-600" />
    }
  }

  if (claimLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-center py-12">
          <LoadingSpinner size="large" />
        </div>
      </div>
    )
  }

  if (!claim) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Claim Not Found</h1>
          <p className="text-slate-600 mb-4">The claim you're looking for doesn't exist or has been removed.</p>
          <Link to="/dashboard">
            <Button>Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  const sourceUrls = claim.source_urls ? JSON.parse(claim.source_urls) : []
  const tags = claim.tags ? JSON.parse(claim.tags) : []

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="flex mb-8" aria-label="Breadcrumb">
        <ol className="flex items-center space-x-2">
          <li>
            <Link to="/dashboard" className="text-slate-500 hover:text-slate-700">
              Dashboard
            </Link>
          </li>
          <ChevronRight className="w-4 h-4 text-slate-400" />
          <li className="text-slate-900 font-medium">Claim Details</li>
        </ol>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Claim Overview */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(claim.status)}`}>
                  {claim.status}
                </span>
                {claim.reliability_score !== null && (
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getReliabilityColor(claim.reliability_score)}`}>
                    {getReliabilityLabel(claim.reliability_score)} ({(claim.reliability_score * 100).toFixed(1)}%)
                  </span>
                )}
              </div>
              <div className="text-sm text-slate-500">
                <Clock className="w-4 h-4 inline mr-1" />
                {new Date(claim.submitted_at).toLocaleDateString()}
              </div>
            </div>
            
            <h1 className="text-2xl font-bold text-slate-900 mb-4">{claim.claim_text}</h1>
            
            <div className="flex items-center justify-between text-sm text-slate-600">
              <div className="flex items-center space-x-4">
                <span className="flex items-center">
                  <User className="w-4 h-4 mr-1" />
                  Claim ID: {claim.id.slice(0, 8)}
                </span>
                <span className="capitalize">{claim.claim_type}</span>
              </div>
              <span className="flex items-center">
                <Users className="w-4 h-4 mr-1" />
                {claim.verification_count} verifications
              </span>
            </div>
            
            {tags.length > 0 && (
              <div className="mt-4">
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag: string) => (
                    <span key={tag} className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-slate-100 text-slate-800">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Source URLs */}
          {sourceUrls.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Source URLs</h3>
              <div className="space-y-3">
                {sourceUrls.map((url: string, index: number) => (
                  <div key={index} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
                    <ExternalLink className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-500 text-sm truncate"
                    >
                      {url}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Analysis Report */}
          {report && (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">AI Analysis Report</h3>
                <Button variant="ghost" size="sm">
                  <FileText className="w-4 h-4 mr-2" />
                  View Full Report
                </Button>
              </div>
              
              {report.report_data?.summary && (
                <div className="prose prose-sm max-w-none">
                  <p className="text-slate-700 whitespace-pre-line">{report.report_data.summary}</p>
                </div>
              )}
              
              {report.reliability_breakdown && (
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <div className="text-sm font-medium text-slate-900">Overall Score</div>
                    <div className="text-2xl font-bold text-slate-900">
                      {(report.reliability_breakdown.overall_score * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <div className="text-sm font-medium text-slate-900">Evidence Sources</div>
                    <div className="text-2xl font-bold text-slate-900">
                      {report.evidence_summary?.total_sources || 0}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Community Verifications */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Community Verifications ({verifications?.length || 0})
              </h3>
              {user && (
                <Button
                  size="sm"
                  onClick={() => setShowVerificationForm(true)}
                  disabled={showVerificationForm}
                >
                  Add Verification
                </Button>
              )}
            </div>
            
            {verificationsLoading ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : verifications?.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-slate-900 mb-2">No Verifications Yet</h4>
                <p className="text-slate-600">Be the first to verify this claim!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {verifications?.map((verification) => (
                  <div key={verification.id} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        {getVerdictIcon(verification.verdict)}
                        <span className="font-medium text-slate-900 capitalize">
                          {verification.verdict}
                        </span>
                        <span className="text-sm text-slate-500">
                          Confidence: {(verification.confidence_score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="text-sm text-slate-500">
                        {new Date(verification.verified_at).toLocaleDateString()}
                      </div>
                    </div>
                    
                    {verification.justification && (
                      <p className="text-slate-700 text-sm mb-3">{verification.justification}</p>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 capitalize">
                        {verification.verification_type} verification
                      </span>
                      <div className="flex items-center space-x-3">
                        <button className="flex items-center space-x-1 text-slate-500 hover:text-green-600">
                          <ThumbsUp className="w-4 h-4" />
                          <span className="text-sm">{verification.upvotes}</span>
                        </button>
                        <button className="flex items-center space-x-1 text-slate-500 hover:text-red-600">
                          <ThumbsDown className="w-4 h-4" />
                          <span className="text-sm">{verification.downvotes}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Quick Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-slate-600">Status</span>
                <span className="font-medium capitalize">{claim.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Verifications</span>
                <span className="font-medium">{claim.verification_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Submitted</span>
                <span className="font-medium">{new Date(claim.submitted_at).toLocaleDateString()}</span>
              </div>
              {claim.reliability_score && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Reliability</span>
                  <span className="font-medium">{(claim.reliability_score * 100).toFixed(1)}%</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Actions</h3>
            <div className="space-y-3">
              {report && (
                <Button variant="secondary" size="sm" className="w-full">
                  <FileText className="w-4 h-4 mr-2" />
                  Download Report
                </Button>
              )}
              <Button variant="ghost" size="sm" className="w-full">
                <ExternalLink className="w-4 h-4 mr-2" />
                Share Claim
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Verification Form Modal */}
      {showVerificationForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleVerificationSubmit} className="p-6">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Add Your Verification</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Verdict</label>
                  <select
                    value={verificationData.verdict}
                    onChange={(e) => setVerificationData({ ...verificationData, verdict: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select verdict...</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                    <option value="mixed">Mixed/Partially True</option>
                    <option value="misleading">Misleading</option>
                    <option value="unverified">Unverified</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Confidence: {(verificationData.confidence_score * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={verificationData.confidence_score}
                    onChange={(e) => setVerificationData({ ...verificationData, confidence_score: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Justification</label>
                  <textarea
                    value={verificationData.justification}
                    onChange={(e) => setVerificationData({ ...verificationData, justification: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Explain your reasoning..."
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowVerificationForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={verifyMutation.isPending}
                  disabled={!verificationData.verdict}
                >
                  Submit Verification
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}