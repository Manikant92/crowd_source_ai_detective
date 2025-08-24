import React from 'react'

interface ToastProps {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}

// Simple toast implementation for demonstration
let toastCallback: ((props: ToastProps) => void) | null = null

export function toast(props: ToastProps) {
  if (toastCallback) {
    toastCallback(props)
  } else {
    // Fallback to console.log if no toast provider is set up
    console.log(`Toast: ${props.title}${props.description ? ` - ${props.description}` : ''}`)
  }
}

export function setToastCallback(callback: (props: ToastProps) => void) {
  toastCallback = callback
}

// Simple toast hook
export function useToast() {
  return { toast }
}
