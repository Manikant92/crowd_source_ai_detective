import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X, Link as LinkIcon, Tag, AlertCircle, CheckCircle, Upload } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { submitClaim } from '../lib/supabase'
import { Button } from '../components/ui/button'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'

export function SubmitClaim() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    claim_text: '',
    claim_type: 'text',
    source_urls: [''],
    tags: []
  })
  const [newTag, setNewTag] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submitMutation = useMutation({
    mutationFn: submitClaim,
    onSuccess: (data) => {
      // Navigate to the newly created claim
      navigate(`/claim/${data.data.claim_id}`)
    },
    onError: (error: any) => {
      setErrors({ submit: error.message || 'Failed to submit claim' })
    }
  })

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.claim_text.trim()) {
      newErrors.claim_text = 'Claim text is required'
    } else if (formData.claim_text.length < 20) {
      newErrors.claim_text = 'Claim must be at least 20 characters long'
    }

    const validUrls = formData.source_urls.filter(url => url.trim())
    if (validUrls.length === 0) {
      newErrors.source_urls = 'At least one source URL is recommended'
    } else {
      const invalidUrls = validUrls.filter(url => {
        try {
          new URL(url)
          return false
        } catch {
          return true
        }
      })
      if (invalidUrls.length > 0) {
        newErrors.source_urls = 'Please provide valid URLs'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    const claimData = {
      claim_text: formData.claim_text.trim(),
      claim_type: formData.claim_type,
      source_urls: formData.source_urls.filter(url => url.trim()),
      tags: formData.tags
    }

    submitMutation.mutate(claimData)
  }

  const addSourceUrl = () => {
    setFormData({
      ...formData,
      source_urls: [...formData.source_urls, '']
    })
  }

  const removeSourceUrl = (index: number) => {
    setFormData({
      ...formData,
      source_urls: formData.source_urls.filter((_, i) => i !== index)
    })
  }

  const updateSourceUrl = (index: number, value: string) => {
    const newUrls = [...formData.source_urls]
    newUrls[index] = value
    setFormData({ ...formData, source_urls: newUrls })
  }

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, newTag.trim()]
      })
      setNewTag('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove)
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Submit a Claim</h1>
        <p className="text-slate-600">
          Submit a claim for fact-checking by our AI agents and community experts.
          Provide as much detail and source information as possible for accurate verification.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Claim Text */}
          <div>
            <label htmlFor="claim_text" className="block text-sm font-medium text-slate-700 mb-2">
              Claim Statement *
            </label>
            <textarea
              id="claim_text"
              name="claim_text"
              rows={4}
              value={formData.claim_text}
              onChange={(e) => setFormData({ ...formData, claim_text: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter the claim you want to fact-check. Be specific and factual..."
            />
            <div className="mt-1 flex justify-between items-center">
              <div>
                {errors.claim_text && (
                  <p className="text-sm text-red-600 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {errors.claim_text}
                  </p>
                )}
              </div>
              <p className="text-sm text-slate-500">
                {formData.claim_text.length}/1000 characters
              </p>
            </div>
          </div>

          {/* Claim Type */}
          <div>
            <label htmlFor="claim_type" className="block text-sm font-medium text-slate-700 mb-2">
              Claim Type
            </label>
            <select
              id="claim_type"
              name="claim_type"
              value={formData.claim_type}
              onChange={(e) => setFormData({ ...formData, claim_type: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="text">Text Statement</option>
              <option value="image">Image/Visual Claim</option>
              <option value="video">Video Content</option>
              <option value="url">Website/Article</option>
              <option value="mixed">Mixed Media</option>
            </select>
          </div>

          {/* Source URLs */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Source URLs
            </label>
            <p className="text-sm text-slate-500 mb-3">
              Provide URLs to sources that support or mention this claim.
            </p>
            
            <div className="space-y-3">
              {formData.source_urls.map((url, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <div className="flex-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LinkIcon className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => updateSourceUrl(index, e.target.value)}
                      placeholder="https://example.com/article"
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  {formData.source_urls.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSourceUrl(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            
            {errors.source_urls && (
              <p className="text-sm text-red-600 mt-2 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.source_urls}
              </p>
            )}
            
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addSourceUrl}
              className="mt-3"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Another URL
            </Button>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tags
            </label>
            <p className="text-sm text-slate-500 mb-3">
              Add tags to categorize your claim (e.g., politics, science, health, business).
            </p>
            
            <div className="flex items-center space-x-2 mb-3">
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Tag className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter a tag"
                  className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addTag}
                disabled={!newTag.trim()}
              >
                Add
              </Button>
            </div>
            
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-2 text-blue-600 hover:text-blue-800"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" />
                <span>{errors.submit}</span>
              </div>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex items-center justify-between pt-6 border-t border-slate-200">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate('/dashboard')}
            >
              Cancel
            </Button>
            
            <Button
              type="submit"
              loading={submitMutation.isPending}
              disabled={submitMutation.isPending}
              className="px-8"
            >
              {submitMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Submitting...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Submit Claim
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Guidelines */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center">
          <CheckCircle className="w-5 h-5 mr-2" />
          Submission Guidelines
        </h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li>• Be specific and factual in your claim statement</li>
          <li>• Provide credible source URLs whenever possible</li>
          <li>• Use appropriate tags to help categorize your claim</li>
          <li>• Avoid opinion-based statements - focus on verifiable facts</li>
          <li>• Claims will be processed by AI agents and reviewed by the community</li>
        </ul>
      </div>
    </div>
  )
}