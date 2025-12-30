// ABOUTME: Tracks operation latency with categorization for performance monitoring.
// ABOUTME: Provides latency thresholds for simple messages (5s) vs exploration/synthesis (30s).

/**
 * Operation types for latency categorization.
 * - simple_message: Basic message operations - Target p95 < 5 seconds
 * - exploration: Repository exploration and Q&A loop - Target p95 < 30 seconds
 * - synthesis: Spec synthesis and revisions - Target p95 < 30 seconds
 */
export type OperationType = "simple_message" | "exploration" | "synthesis";

/**
 * Latency thresholds in milliseconds for each operation type.
 */
const LATENCY_THRESHOLDS: Record<OperationType, number> = {
  simple_message: 5000,
  exploration: 30000,
  synthesis: 30000,
};

/**
 * Internal tracking data for an operation.
 */
interface OperationData {
  type: OperationType;
  startTime: number;
  endTime?: number;
  duration?: number;
}

/**
 * Tracks operation latency with categorization for performance monitoring.
 *
 * Provides timing measurement and latency threshold checking for different
 * operation types. Used by PerformanceMonitor to determine when to show
 * thinking indicators.
 *
 * @example
 * ```ts
 * const tracker = new LatencyTracker();
 * const id = tracker.startOperation("simple_message");
 * // ... do work ...
 * const duration = tracker.stopOperation(id);
 * console.log(`Operation took ${duration}ms`);
 * ```
 */
export class LatencyTracker {
  private operations: Map<string, OperationData> = new Map();
  private counter = 0;

  /**
   * Start tracking a new operation.
   *
   * @param type - The type of operation being tracked
   * @returns A unique operation ID for use with stopOperation and getLatency
   */
  startOperation(type: OperationType): string {
    this.counter++;
    const id = `op-${Date.now()}-${this.counter}`;

    this.operations.set(id, {
      type,
      startTime: Date.now(),
    });

    return id;
  }

  /**
   * Stop tracking an operation and calculate its duration.
   *
   * @param operationId - The operation ID from startOperation
   * @returns Duration in milliseconds, or 0 if operation not found or already stopped
   */
  stopOperation(operationId: string): number {
    const operation = this.operations.get(operationId);

    if (!operation) {
      return 0;
    }

    // Already stopped
    if (operation.endTime !== undefined) {
      return 0;
    }

    const endTime = Date.now();
    const duration = endTime - operation.startTime;

    operation.endTime = endTime;
    operation.duration = duration;

    return duration;
  }

  /**
   * Get the latency for a completed operation.
   *
   * @param operationId - The operation ID from startOperation
   * @returns Duration in milliseconds, or undefined if not found or still in progress
   */
  getLatency(operationId: string): number | undefined {
    const operation = this.operations.get(operationId);

    if (!operation || operation.duration === undefined) {
      return undefined;
    }

    return operation.duration;
  }

  /**
   * Get the operation type for a tracked operation.
   *
   * @param operationId - The operation ID from startOperation
   * @returns The operation type, or undefined if not found
   */
  getOperationType(operationId: string): OperationType | undefined {
    const operation = this.operations.get(operationId);
    return operation?.type;
  }

  /**
   * Get the latency threshold for an operation type.
   *
   * @param type - The operation type
   * @returns Threshold in milliseconds (5000 for simple_message, 30000 for others)
   */
  getThreshold(type: OperationType): number {
    return LATENCY_THRESHOLDS[type];
  }

  /**
   * Check if an in-progress operation is exceeding its latency threshold.
   *
   * @param operationId - The operation ID from startOperation
   * @returns true if elapsed time exceeds threshold, false otherwise
   */
  isExceedingThreshold(operationId: string): boolean {
    const operation = this.operations.get(operationId);

    if (!operation) {
      return false;
    }

    const elapsed = Date.now() - operation.startTime;
    const threshold = LATENCY_THRESHOLDS[operation.type];

    return elapsed > threshold;
  }

  /**
   * Get elapsed time for an in-progress operation.
   *
   * @param operationId - The operation ID from startOperation
   * @returns Elapsed time in milliseconds, or 0 if not found
   */
  getElapsed(operationId: string): number {
    const operation = this.operations.get(operationId);

    if (!operation) {
      return 0;
    }

    // If already stopped, return the duration
    if (operation.duration !== undefined) {
      return operation.duration;
    }

    return Date.now() - operation.startTime;
  }

  /**
   * Clear all tracked operations.
   */
  clear(): void {
    this.operations.clear();
  }
}
