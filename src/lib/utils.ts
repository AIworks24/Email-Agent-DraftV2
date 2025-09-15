// lib/utils.ts

/**
 * Estimate token count for text (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}

/**
 * Generate a client state for webhook subscriptions
 */
export function generateClientState(emailAddress: string): string {
  return `email-agent-${emailAddress}-${Date.now()}`;
}

/**
 * Clean and sanitize email content
 */
export function sanitizeEmailContent(content: string): string {
  if (!content) return '';
  
  // Remove HTML tags if present
  const cleaned = content.replace(/<[^>]*>/g, '');
  
  // Decode common HTML entities
  return cleaned
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Extract email address from Microsoft Graph email format
 */
export function extractEmailAddress(emailObj: any): string {
  if (!emailObj) return '';
  
  if (typeof emailObj === 'string') return emailObj;
  
  if (emailObj.emailAddress?.address) {
    return emailObj.emailAddress.address;
  }
  
  if (emailObj.address) {
    return emailObj.address;
  }
  
  return '';
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Truncate text to specified length
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate a random UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Parse error messages for display
 */
export function parseErrorMessage(error: any): string {
  if (typeof error === 'string') return error;
  
  if (error?.message) return error.message;
  
  if (error?.error?.message) return error.error.message;
  
  if (error?.response?.data?.message) return error.response.data.message;
  
  return 'An unknown error occurred';
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}