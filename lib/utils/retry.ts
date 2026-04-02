/**
 * Retry utility module for handling transient failures with exponential backoff
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: ((error: unknown) => boolean);
  onRetry?: (attempt: number, error: unknown) => void | Promise<void>;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: unknown;
  attempts: number;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: (error: unknown) => {
    // Default: retry on network errors, timeouts, and 5xx server errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('fetch failed') ||
        message.includes('socket hang up')
      );
    }
    
    // Retry on HTTP 5xx errors
    if (typeof error === 'object' && error !== null && 'status' in error) {
      const status = (error as { status: number }).status;
      return status >= 500 && status < 600;
    }
    
    return false;
  },
};

/**
 * Executes a function with retry logic and exponential backoff
 * @param fn The async function to execute
 * @param options Retry configuration options
 * @returns RetryResult with success status, result/error, and attempt count
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await fn();
      return {
        success: true,
        result,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      const isRetryable = options.retryableErrors
        ? options.retryableErrors(error)
        : opts.retryableErrors(error);
      
      // If not retryable or last attempt, fail immediately
      if (!isRetryable || attempt === opts.maxAttempts) {
        return {
          success: false,
          error,
          attempts: attempt,
        };
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      );
      
      // Call retry callback if provided
      if (options.onRetry) {
        await options.onRetry(attempt, error);
      }
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Shouldn't reach here, but TypeScript needs this
  return {
    success: false,
    error: lastError,
    attempts: opts.maxAttempts,
  };
}

/**
 * Specialized retry for MCP tool calls
 */
export async function withMCPRetry<T>(
  fn: () => Promise<T>,
  options: Omit<RetryOptions, 'retryableErrors'> = {}
): Promise<RetryResult<T>> {
  return withRetry(fn, {
    ...options,
    retryableErrors: (error: unknown) => {
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
          message.includes('timeout') ||
          message.includes('connection') ||
          message.includes('socket') ||
          message.includes('network') ||
          message.includes('unavailable') ||
          message.includes('transport') ||
          message.includes('mcp')
        );
      }
      return false;
    },
  });
}

/**
 * Specialized retry for LLM API calls
 */
export async function withLLMRetry<T>(
  fn: () => Promise<T>,
  options: Omit<RetryOptions, 'retryableErrors'> = {}
): Promise<RetryResult<T>> {
  return withRetry(fn, {
    ...options,
    retryableErrors: (error: unknown) => {
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
          message.includes('timeout') ||
          message.includes('rate limit') ||
          message.includes('429') ||
          message.includes('503') ||
          message.includes('500') ||
          message.includes('overloaded') ||
          message.includes('api error')
        );
      }
      
      // Retry on specific HTTP status codes
      if (typeof error === 'object' && error !== null && 'status' in error) {
        const status = (error as { status: number }).status;
        return status === 429 || status === 503 || status === 500;
      }
      
      return false;
    },
  });
}

/**
 * Specialized retry for database operations
 */
export async function withDatabaseRetry<T>(
  fn: () => Promise<T>,
  options: Omit<RetryOptions, 'retryableErrors'> = {}
): Promise<RetryResult<T>> {
  return withRetry(fn, {
    maxAttempts: 2, // Fewer retries for DB operations
    initialDelayMs: 500,
    ...options,
    retryableErrors: (error: unknown) => {
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return (
          message.includes('connection') ||
          message.includes('timeout') ||
          message.includes('lock') ||
          message.includes('deadlock') ||
          message.includes('retry')
        );
      }
      return false;
    },
  });
}
