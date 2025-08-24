import React from 'react'
import { Link } from 'react-router-dom'
import { Shield, Users, Search, FileCheck, TrendingUp, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import { Button } from '../components/ui/button'
import { useAuth } from '../contexts/AuthContext'

export function Home() {
  const { user } = useAuth()

  const features = [
    {
      icon: Search,
      title: 'AI-Powered Analysis',
      description: 'Multi-agent AI system analyzes claims using advanced fact-checking algorithms and cross-references multiple sources.'
    },
    {
      icon: Users,
      title: 'Community Verification',
      description: 'Crowd-sourced verification from experts and community members adds human intelligence to AI analysis.'
    },
    {
      icon: FileCheck,
      title: 'Transparent Reports',
      description: 'Comprehensive reports with full audit trails show exactly how reliability scores are calculated.'
    },
    {
      icon: Shield,
      title: 'Source Credibility',
      description: 'Sophisticated source validation assesses the credibility and bias of information sources.'
    }
  ]

  const stats = [
    { value: '1,247', label: 'Claims Verified', icon: CheckCircle },
    { value: '89.3%', label: 'Accuracy Rate', icon: TrendingUp },
    { value: '324', label: 'Active Contributors', icon: Users },
    { value: '<2min', label: 'Average Processing Time', icon: Clock }
  ]

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800">
        <div className="absolute inset-0 bg-black opacity-10"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <div className="flex justify-center mb-8">
              <div className="bg-white/10 backdrop-blur-lg p-4 rounded-2xl">
                <Shield className="w-16 h-16 text-white" />
              </div>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
              Crowd-Sourced AI Detective
            </h1>
            <p className="text-xl text-blue-100 mb-4 max-w-3xl mx-auto">
              Experience next-generation fact-checking powered by <span className="font-semibold text-white">Portia SDK</span>.
              Multi-agent AI orchestration with real-time processing, human-in-the-loop clarifications, 
              and complete transparency.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mb-8 max-w-4xl mx-auto">
              <span className="bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-sm text-white">
                Multi-Agent Orchestration
              </span>
              <span className="bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-sm text-white">
                Human-in-the-Loop
              </span>
              <span className="bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-sm text-white">
                60+ Web Tools
              </span>
              <span className="bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-sm text-white">
                Full Transparency
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/portia-submit">
                <Button size="lg" className="bg-white text-blue-700 hover:bg-blue-50 font-semibold px-8">
                  Try Portia AI Detective
                </Button>
              </Link>
              {user ? (
                <Link to="/dashboard">
                  <Button variant="ghost" size="lg" className="text-white border border-white/30 hover:bg-white/10">
                    View Dashboard
                  </Button>
                </Link>
              ) : (
                <Link to="/reports">
                  <Button variant="ghost" size="lg" className="text-white border border-white/30 hover:bg-white/10">
                    Browse Reports
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="bg-slate-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => {
              const Icon = stat.icon
              return (
                <div key={index} className="bg-white rounded-lg p-6 shadow-sm border border-slate-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="bg-blue-100 p-3 rounded-lg">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</div>
                  <div className="text-sm text-slate-600">{stat.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Our advanced system combines artificial intelligence with human expertise to provide 
              transparent, reliable fact-checking at scale.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <div key={index} className="bg-white rounded-xl p-8 shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                  <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center mb-6">
                    <Icon className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-4">
                    {feature.title}
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Trust & Transparency */}
      <div className="bg-slate-900 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">
              Trust Through Transparency
            </h2>
            <p className="text-lg text-slate-300 max-w-3xl mx-auto">
              Every verification decision includes complete audit trails, source credibility assessments, 
              and community consensus data. See exactly how we arrive at our reliability scores.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <Search className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Multi-Source Analysis</h3>
              <p className="text-slate-300">
                Cross-reference claims against multiple authoritative sources and databases.
              </p>
            </div>
            
            <div className="text-center">
              <div className="bg-green-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Credibility Scoring</h3>
              <p className="text-slate-300">
                Assess source reliability based on domain authority, editorial standards, and track record.
              </p>
            </div>
            
            <div className="text-center">
              <div className="bg-purple-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <FileCheck className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Audit Trail</h3>
              <p className="text-slate-300">
                Complete transparency with immutable logs of every step in the verification process.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="bg-blue-50 py-16">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            Join the Fight Against Misinformation
          </h2>
          <p className="text-lg text-slate-600 mb-8">
            Help build a more informed society by contributing to our community-driven fact-checking platform.
          </p>
          {user ? (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/submit">
                <Button size="lg" className="px-8">
                  Submit Your First Claim
                </Button>
              </Link>
              <Link to="/dashboard">
                <Button variant="secondary" size="lg" className="px-8">
                  Go to Dashboard
                </Button>
              </Link>
            </div>
          ) : (
            <Link to="/auth">
              <Button size="lg" className="px-8">
                Create Free Account
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}