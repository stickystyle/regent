// ABOUTME: RetryHandler with exponential backoff for transient error recovery.
// ABOUTME: Implements Property 11 - retry up to 3 times before reporting failure.

import { TransientError } from "./types.ts";

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of attempts (default: 3) */
  maxAttempts: number;

  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelayMs: number;

  /** Multiplier for exponential backoff (default: 2) */
  multiplier: number;

  /**
   * Optional callback invoked before each retry.
   *
   * @param attempt - The upcoming attempt number (2, 3, ...)
   * @param delayMs - The delay before this attempt in milliseconds
   * @param error - The error that triggered the retry
   */
  onRetry?: (attempt: number, delayMs: number, error: TransientError) => void;
}

/**
 * Default retry configuration.
 *
 * - 3 attempts total (1 initial + 2 retries)
 * - 1 second base delay
 * - 2x multiplier (delays: 0ms, 1000ms, 2000ms)
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  multiplier: 2,
};

/**
 * Calculates the backoff delay for a given attempt number.
 *
 * Attempt 1: 0ms (immediate)
 * Attempt 2: baseDelayMs
 * Attempt 3: baseDelayMs * multiplier
 * Attempt 4: baseDelayMs * multiplier^2
 * ...
 *
 * @param attempt - Current attempt number (1-based)
 * @param config - Configuration with baseDelayMs and multiplier
 * @returns Delay in milliseconds before this attempt
 *
 * @example
 * ```ts
 * calculateBackoffDelay(1, { baseDelayMs: 1000, multiplier: 2 }); // 0
 * calculateBackoffDelay(2, { baseDelayMs: 1000, multiplier: 2 }); // 1000
 * calculateBackoffDelay(3, { baseDelayMs: 1000, multiplier: 2 }); // 2000
 * ```
 */
export function calculateBackoffDelay(
  attempt: number,
  config: Pick<RetryConfig, "baseDelayMs" | "multiplier">,
): number {
  if (attempt <= 1) {
    return 0;
  }
  // For attempt 2: baseDelay * multiplier^0 = baseDelay
  // For attempt 3: baseDelay * multiplier^1 = baseDelay * 2
  // For attempt 4: baseDelay * multiplier^2 = baseDelay * 4
  return config.baseDelayMs * Math.pow(config.multiplier, attempt - 2);
}

/**
 * Handles retry logic with exponential backoff for transient errors.
 *
 * Implements Property 11: For any transient error, retry with exponential
 * backoff up to 3 times before reporting failure.
 *
 * @example
 * ```ts
 * const handler = new RetryHandler();
 *
 * const result = await handler.execute(async () => {
 *   const response = await fetch("https://api.example.com");
 *   if (!response.ok) {
 *     throw new NetworkTimeoutError("Request failed", "...", "...");
 *   }
 *   return response.json();
 * });
 * ```
 */
export class RetryHandler {
  private readonly config: RetryConfig;
  private _currentAttempt = 0;
  private _isExhausted = false;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /** Current attempt number (1-based, updated during execution) */
  get currentAttempt(): number {
    return this._currentAttempt;
  }

  /** Whether all retry attempts have been exhausted */
  get isExhausted(): boolean {
    return this._isExhausted;
  }

  /**
   * Executes an operation with retry logic.
   *
   * - Retries transient errors up to maxAttempts times
   * - Does NOT retry permanent errors or non-BaseError errors
   * - Applies exponential backoff between retries
   *
   * @param operation - Function to execute (can be sync or async)
   * @returns The result of the operation
   * @throws The last error if all retries are exhausted
   */
  async execute<T>(operation: () => T | Promise<T>): Promise<T> {
    // Reset state for new execution
    this._currentAttempt = 0;
    this._isExhausted = false;

    let lastError: Error | undefined;

    while (this._currentAttempt < this.config.maxAttempts) {
      this._currentAttempt++;

      // Apply backoff delay before attempts 2+
      if (this._currentAttempt > 1 && lastError instanceof TransientError) {
        const delay = calculateBackoffDelay(this._currentAttempt, this.config);

        if (this.config.onRetry) {
          this.config.onRetry(this._currentAttempt, delay, lastError);
        }

        if (delay > 0) {
          await this.sleep(delay);
        }
      }

      try {
        return await operation();
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }

        lastError = error;

        // Only retry transient errors
        if (!(error instanceof TransientError)) {
          throw error;
        }

        // Continue to next attempt if we haven't exhausted retries
        if (this._currentAttempt >= this.config.maxAttempts) {
          this._isExhausted = true;
          throw error;
        }
      }
    }

    // Should not reach here, but TypeScript needs this
    this._isExhausted = true;
    throw lastError;
  }

  /**
   * Sleep for the specified duration.
   * Extracted for easier testing.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
