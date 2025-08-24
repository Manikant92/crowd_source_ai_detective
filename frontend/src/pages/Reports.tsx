import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Filter, TrendingUp, Clock, Users, FileText, ExternalLink, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/button'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'

export function Reports() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<'all' | 'completed' | 'trending'>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'reliability' | 'trending'>('recent')

  // Fetch claims with reports
  const { data: claims, isLoading } = useQuery({
    queryKey: ['public-claims', filter, sortBy, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('claims')
        .select('*')
      
      // Apply filters
      if (filter === 'completed') {
        query = query.eq('status', 'completed')
      } else if (filter === 'trending') {
        query = query.eq('is_trending', true)
      }
      
      // Apply search
      if (searchTerm) {
        query = query.ilike('claim_text', `%${searchTerm}%`)
      }
      
      // Apply sorting
      switch (sortBy) {
        case 'recent':
          query = query.order('submitted_at', { ascending: false })
          break
        case 'reliability':
          query = query.order('reliability_score', { ascending: false, nullsFirst: false })
          break
        case 'trending':
          query = query.order('verification_count', { ascending: false })
          break
      }
      
      query = query.limit(50)
      
      const { data, error } = await query
      if (error) throw error
      return data || []
    }
  })

  // Fetch platform stats
  const { data: stats } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: async () => {
      const [claimsResult, verificationsResult, usersResult] = await Promise.all([
        supabase.from('claims').select('id, status, reliability_score'),
        supabase.from('verifications').select('id'),
        supabase.from('users').select('id')
      ])

      const claims = claimsResult.data || []
      const verifications = verificationsResult.data || []
      const users = usersResult.data || []

      return {
        totalClaims: claims.length,
        completedClaims: claims.filter(c => c.status === 'completed').length,
        totalVerifications: verifications.length,
        activeUsers: users.length,
        avgReliability: claims.length > 0 
          ? claims.filter(c => c.reliability_score).reduce((sum, c) => sum + (c.reliability_score || 0), 0) / claims.filter(c => c.reliability_score).length
          : 0
      }
    }
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
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Fact-Check Reports</h1>
        <p className="text-slate-600">
          Explore verified claims, AI analysis reports, and community consensus data.
        </p>
      </div>

      {/* Platform Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-blue-100 p-3 rounded-lg">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">{stats.totalClaims}</div>
            <div className="text-sm text-slate-600">Total Claims</div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-green-100 p-3 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">{stats.completedClaims}</div>
            <div className="text-sm text-slate-600">Verified</div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-purple-100 p-3 rounded-lg">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">{stats.totalVerifications}</div>
            <div className="text-sm text-slate-600">Verifications</div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-orange-100 p-3 rounded-lg">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">{stats.activeUsers}</div>
            <div className="text-sm text-slate-600">Contributors</div>
          </div>

          <div className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-indigo-100 p-3 rounded-lg">
                <TrendingUp className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mb-1">
              {stats.avgReliability ? (stats.avgReliability * 100).toFixed(1) + '%' : 'N/A'}
            </div>
            <div className="text-sm text-slate-600">Avg Accuracy</div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Search claims..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
          <div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Claims</option>
              <option value="completed">Completed Only</option>
              <option value="trending">Trending</option>
            </select>
          </div>
          
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="recent">Most Recent</option>
              <option value="reliability">Highest Reliability</option>
              <option value="trending">Most Verified</option>
            </select>
          </div>
        </div>
      </div>

      {/* Claims List */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Fact-Check Reports</h2>
            <div className="flex items-center space-x-2 text-sm text-slate-600">
              <Filter className="w-4 h-4" />
              <span>{claims?.length || 0} results</span>
            </div>
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="large" />
            </div>
          ) : claims?.length === 0 ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 mb-2">No Claims Found</h3>
              <p className="text-slate-600 mb-4">Try adjusting your search criteria or filters.</p>
              <Link to="/submit">
                <Button>
                  Submit a Claim
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {claims?.map((claim) => {
                const sourceUrls = claim.source_urls ? JSON.parse(claim.source_urls) : []
                const tags = claim.tags ? JSON.parse(claim.tags) : []
                
                return (
                  <div key={claim.id} className="border border-slate-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <Link to={`/claim/${claim.id}`}>
                          <h3 className="text-lg font-medium text-slate-900 hover:text-blue-600 transition-colors line-clamp-2">
                            {claim.claim_text}
                          </h3>
                        </Link>
                        <div className="mt-2 flex items-center space-x-4 text-sm text-slate-500">
                          <span className="flex items-center">
                            <Clock className="w-4 h-4 mr-1" />
                            {new Date(claim.submitted_at).toLocaleDateString()}
                          </span>
                          <span className="capitalize">{claim.claim_type}</span>
                          {claim.is_trending && (
                            <span className="flex items-center text-orange-600">
                              <TrendingUp className="w-4 h-4 mr-1" />
                              Trending
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end space-y-2">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(claim.status)}`}>
                          {claim.status}
                        </span>
                        {claim.reliability_score !== null && (
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getReliabilityColor(claim.reliability_score)}`}>
                            {getReliabilityLabel(claim.reliability_score)}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Tags */}
                    {tags.length > 0 && (
                      <div className="mb-4">
                        <div className="flex flex-wrap gap-2">
                          {tags.slice(0, 5).map((tag: string) => (
                            <span key={tag} className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-slate-100 text-slate-800">
                              {tag}
                            </span>
                          ))}
                          {tags.length > 5 && (
                            <span className="text-xs text-slate-500">+{tags.length - 5} more</span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Metrics */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-6">
                        <span className="flex items-center text-sm text-slate-600">
                          <Users className="w-4 h-4 mr-1" />
                          {claim.verification_count} verifications
                        </span>
                        {claim.reliability_score !== null && (
                          <span className="text-sm text-slate-600">
                            Reliability: {(claim.reliability_score * 100).toFixed(1)}%
                          </span>
                        )}
                        {sourceUrls.length > 0 && (
                          <span className="flex items-center text-sm text-slate-600">
                            <ExternalLink className="w-4 h-4 mr-1" />
                            {sourceUrls.length} sources
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Link to={`/claim/${claim.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}