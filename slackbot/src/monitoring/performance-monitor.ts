// ABOUTME: Orchestrates latency tracking with automatic thinking indicator management.
// ABOUTME: Posts thinking indicators when operations exceed thresholds and cleans up on completion.

import type { SlackMessagingClient } from "../clients/messaging-client.ts";
import { LatencyTracker } from "./latency-tracker.ts";
import type { OperationType } from "./latency-tracker.ts";
import { ThinkingIndicatorManager } from "./thinking-indicator.ts";

/**
 * Configuration for PerformanceMonitor.
 */
export interface PerformanceMonitorConfig {
  /**
   * Delay in milliseconds before posting thinking indicator.
   * Defaults to the latency threshold for the operation type.
   */
  indicatorDelayMs?: number;

  /**
   * Override thresholds for operation types (useful for testing).
   */
  thresholdOverrides?: Partial<Record<OperationType, number>>;
}

/**
 * Key for tracking active indicators by channel and thread.
 */
function makeIndicatorKey(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}

/**
 * Orchestrates latency tracking with automatic thinking indicator management.
 *
 * Wraps async operations to:
 * 1. Track their latency
 * 2. Post "Thinking..." indicator if operation exceeds threshold
 * 3. Clean up indicator when operation completes or fails
 *
 * This implements Requirement 11.3: When the system cannot meet latency targets,
 * it posts a "thinking..." indicator to acknowledge receipt.
 *
 * @example
 * ```ts
 * const monitor = new PerformanceMonitor(slackClient);
 *
 * const result = await monitor.trackOperation(
 *   "exploration",
 *   channelId,
 *   threadTs,
 *   async () => {
 *     // Long-running operation
 *     return await exploreRepository();
 *   }
 * );
 * ```
 */
export class PerformanceMonitor {
  private readonly latencyTracker: LatencyTracker;
  private readonly indicatorManager: ThinkingIndicatorManager;
  private readonly config: PerformanceMonitorConfig;
  private readonly activeIndicators: Map<string, string> = new Map();

  /**
   * Create a new PerformanceMonitor.
   *
   * @param messagingClient - Slack messaging client for posting indicators
   * @param config - Optional configuration for thresholds and delays
   */
  constructor(
    messagingClient: SlackMessagingClient,
    config?: PerformanceMonitorConfig,
  ) {
    this.latencyTracker = new LatencyTracker();
    this.indicatorManager = new ThinkingIndicatorManager(messagingClient);
    this.config = config ?? {};
  }

  /**
   * Track an operation with automatic thinking indicator management.
   *
   * Posts a thinking indicator if the operation exceeds the configured
   * delay threshold, and cleans up the indicator when the operation
   * completes (success or failure).
   *
   * @param type - The type of operation being tracked
   * @param channelId - Slack channel ID for indicator posting
   * @param threadTs - Thread timestamp for indicator posting
   * @param operation - Async operation to execute
   * @returns The result of the operation
   * @throws Re-throws any error from the operation after cleanup
   */
  async trackOperation<T>(
    type: OperationType,
    channelId: string,
    threadTs: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const operationId = this.latencyTracker.startOperation(type);
    const indicatorKey = makeIndicatorKey(channelId, threadTs);

    // Get the delay before posting indicator
    const indicatorDelay = this.getIndicatorDelay(type);

    // Set up timer to post thinking indicator
    let indicatorTs: string | undefined;
    let indicatorPosted = false;

    const indicatorTimer = setTimeout(async () => {
      try {
        indicatorTs = await this.indicatorManager.postThinkingIndicator(
          channelId,
          threadTs,
        );
        indicatorPosted = true;
        this.activeIndicators.set(indicatorKey, indicatorTs);
      } catch {
        // Silently ignore indicator posting failures
        // The main operation should still proceed
      }
    }, indicatorDelay);

    try {
      // Execute the operation
      const result = await operation();

      // Stop timing
      this.latencyTracker.stopOperation(operationId);

      return result;
    } catch (error) {
      // Stop timing even on error
      this.latencyTracker.stopOperation(operationId);
      throw error;
    } finally {
      // Always clean up the indicator timer and any posted indicator
      clearTimeout(indicatorTimer);

      if (indicatorPosted && indicatorTs) {
        try {
          await this.indicatorManager.deleteThinkingIndicator(
            channelId,
            indicatorTs,
          );
        } catch {
          // Silently ignore indicator deletion failures
        }
      }

      // Remove from active indicators
      this.activeIndicators.delete(indicatorKey);
    }
  }

  /**
   * Check if there's an active thinking indicator for a thread.
   *
   * @param channelId - Slack channel ID
   * @param threadTs - Thread timestamp
   * @returns true if there's an active indicator
   */
  hasActiveIndicator(channelId: string, threadTs: string): boolean {
    const key = makeIndicatorKey(channelId, threadTs);
    return this.activeIndicators.has(key);
  }

  /**
   * Get the indicator delay for an operation type.
   *
   * @param type - The operation type
   * @returns Delay in milliseconds before posting indicator
   */
  private getIndicatorDelay(type: OperationType): number {
    // Check for configured override
    if (this.config.indicatorDelayMs !== undefined) {
      return this.config.indicatorDelayMs;
    }

    // Check for threshold override
    if (this.config.thresholdOverrides?.[type] !== undefined) {
      return this.config.thresholdOverrides[type]!;
    }

    // Use default threshold from LatencyTracker
    return this.latencyTracker.getThreshold(type);
  }

  /**
   * Get the latency tracker for accessing timing data.
   *
   * @returns The internal LatencyTracker instance
   */
  getLatencyTracker(): LatencyTracker {
    return this.latencyTracker;
  }
}
