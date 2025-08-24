import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, TrendingUp, Clock, CheckCircle, AlertTriangle, Users, Search, Filter } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/button'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { useAuth } from '../contexts/AuthContext'

export function Dashboard() {
  const { user } = useAuth()
  const [filter, setFilter] = useState<'all' | 'pending' | 'processing' | 'completed'>('all')

  // Fetch user's claims
  const { data: claims, isLoading: claimsLoading } = useQuery({
    queryKey: ['user-claims', user?.id, filter],
    queryFn: async () => {
      let query = supabase
        .from('claims')
        .select('*')
        .eq('submitter_id', user?.id)
        .order('submitted_at', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    },
    enabled: !!user?.id
  })

  // Fetch recent community activity
  const { data: recentClaims, isLoading: recentLoading } = useQuery({
    queryKey: ['recent-claims'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('claims')
        .select('*')
        .order('submitted_at', { ascending: false })
        .limit(5)

      if (error) throw error
      return data || []
    }
  })

  // Fetch user stats
  const { data: userStats } = useQuery({
    queryKey: ['user-stats', user?.id],
    queryFn: async () => {
      const [claimsResult, verificationsResult] = await Promise.all([
        supabase
          .from('claims')
          .select('id, status, reliability_score')
          .eq('submitter_id', user?.id),
        supabase
          .from('verifications')
          .select('id, verdict')
          .eq('verifier_id', user?.id)
      ])

      const claims = claimsResult.data || []
      const verifications = verificationsResult.data || []

      return {
        totalClaims: claims.length,
        completedClaims: claims.filter(c => c.status === 'completed').length,
        avgReliability: claims.length > 0 
          ? claims.filter(c => c.reliability_score).reduce((sum, c) => sum + (c.reliability_score || 0), 0) / claims.filter(c => c.reliability_score).length
          : 0,
        totalVerifications: verifications.length
      }
    },
    enabled: !!user?.id
  })

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
    if (!score) return 'Pending'
    if (score >= 0.8) return 'Highly Reliable'
    if (score >= 0.6) return 'Reliable'
    if (score >= 0.4) return 'Questionable'
    return 'Unreliable'
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Dashboard</h1>
        <p className="text-slate-600">
          Welcome back! Track your claims, verify community submissions, and explore fact-check reports.
        </p>
      </div>

      {/* Stats Overview */}
      {userStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-blue-100 p-3 rounded-lg">
                <Plus className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">{userStats.totalClaims}</div>
            <div className="text-sm text-slate-600">Claims Submitted</div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-green-100 p-3 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">{userStats.completedClaims}</div>
            <div className="text-sm text-slate-600">Completed</div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-purple-100 p-3 rounded-lg">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">
              {userStats.avgReliability ? (userStats.avgReliability * 100).toFixed(1) + '%' : 'N/A'}
            </div>
            <div className="text-sm text-slate-600">Avg Reliability</div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-orange-100 p-3 rounded-lg">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">{userStats.totalVerifications}</div>
            <div className="text-sm text-slate-600">Verifications</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* My Claims */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">My Claims</h2>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value as any)}
                      className="text-sm border border-slate-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All</option>
                      <option value="pending">Pending</option>
                      <option value="processing">Processing</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <Link to="/submit">
                    <Button size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      New Claim
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            <div className="p-6">
              {claimsLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : claims?.length === 0 ? (
                <div className="text-center py-8">
                  <Search className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No claims found</h3>
                  <p className="text-slate-600 mb-4">
                    {filter === 'all' ? 'You haven\'t submitted any claims yet.' : `No ${filter} claims found.`}
                  </p>
                  <Link to="/submit">
                    <Button>
                      Submit Your First Claim
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {claims?.map((claim) => (
                    <Link key={claim.id} to={`/claim/${claim.id}`}>
                      <div className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-900 font-medium line-clamp-2">
                              {claim.claim_text}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {new Date(claim.submitted_at).toLocaleDateString()} • {claim.claim_type}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(claim.status)}`}>
                              {claim.status}
                            </span>
                            {claim.reliability_score !== null && (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getReliabilityColor(claim.reliability_score)}`}>
                                {getReliabilityLabel(claim.reliability_score)}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            {claim.verification_count} verifications
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Community Activity */}
        <div>
          <div className="bg-white rounded-lg shadow-sm border border-slate-200">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900">Recent Community Activity</h2>
            </div>
            <div className="p-6">
              {recentLoading ? (
                <div className="flex justify-center py-4">
                  <LoadingSpinner />
                </div>
              ) : (
                <div className="space-y-4">
                  {recentClaims?.map((claim) => (
                    <Link key={claim.id} to={`/claim/${claim.id}`}>
                      <div className="border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors">
                        <p className="text-sm text-slate-900 line-clamp-2 mb-2">
                          {claim.claim_text}
                        </p>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{new Date(claim.submitted_at).toLocaleDateString()}</span>
                          <span className={`px-2 py-1 rounded-full ${getStatusColor(claim.status)}`}>
                            {claim.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-200">
              <Link to="/reports" className="text-sm text-blue-600 hover:text-blue-500 font-medium">
                View all reports →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}