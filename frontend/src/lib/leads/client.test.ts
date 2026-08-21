import assert from 'node:assert/strict'
import test from 'node:test'
import {shouldSkipFormDraftRestore} from './client'

test('shouldSkipFormDraftRestore returns false when no reset flag exists', () => {
  // Clear any existing flag
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('portals_profile_reset_timestamp')
  }
  
  const result = shouldSkipFormDraftRestore()
  assert.equal(result, false)
})

test('shouldSkipFormDraftRestore returns true when reset flag is recent', () => {
  if (typeof localStorage === 'undefined') {
    // Skip test in non-browser environment
    return
  }
  
  // Set a recent reset timestamp (100ms ago)
  localStorage.setItem('portals_profile_reset_timestamp', (Date.now() - 100).toString())
  
  const result = shouldSkipFormDraftRestore()
  assert.equal(result, true)
  
  // Flag should be cleared after checking
  assert.equal(localStorage.getItem('portals_profile_reset_timestamp'), null)
})

test('shouldSkipFormDraftRestore returns false when reset flag is old', () => {
  if (typeof localStorage === 'undefined') {
    // Skip test in non-browser environment
    return
  }
  
  // Set an old reset timestamp (3 seconds ago)
  localStorage.setItem('portals_profile_reset_timestamp', (Date.now() - 3000).toString())
  
  const result = shouldSkipFormDraftRestore()
  assert.equal(result, false)
  
  // Flag should still be cleared even if old
  assert.equal(localStorage.getItem('portals_profile_reset_timestamp'), null)
})

test('shouldSkipFormDraftRestore handles storage errors gracefully', () => {
  if (typeof localStorage === 'undefined') {
    // Skip test in non-browser environment
    return
  }
  
  // Mock localStorage to throw an error
  const originalGetItem = localStorage.getItem
  localStorage.getItem = () => {
    throw new Error('Storage error')
  }
  
  const result = shouldSkipFormDraftRestore()
  assert.equal(result, false)
  
  // Restore original method
  localStorage.getItem = originalGetItem
})

test('shouldSkipFormDraftRestore handles invalid timestamp gracefully', () => {
  if (typeof localStorage === 'undefined') {
    // Skip test in non-browser environment
    return
  }
  
  // Set an invalid timestamp
  localStorage.setItem('portals_profile_reset_timestamp', 'invalid')
  
  const result = shouldSkipFormDraftRestore()
  assert.equal(result, false)
  
  // Flag should be cleared even if invalid
  assert.equal(localStorage.getItem('portals_profile_reset_timestamp'), null)
})