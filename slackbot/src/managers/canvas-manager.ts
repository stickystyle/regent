// ABOUTME: Canvas manager for creating and updating Slack Canvases with spec content.
// ABOUTME: Implements automatic fallback to file upload on Canvas API failures per Property 13.

import type { SpecDocument } from "../types/spec-document.ts";
import { toMarkdown } from "../types/spec-document.ts";
import type { SlackMessagingClient } from "../clients/messaging-client.ts";
import { SlackCanvasError } from "../errors/types.ts";

/**
 * CanvasManager handles Slack Canvas creation and updates for spec documents.
 *
 * Key responsibilities:
 * - Create Canvas documents with formatted spec content
 * - Update existing Canvas documents with revised specs
 * - Automatically fall back to file upload if Canvas creation fails (Property 13)
 * - Format spec content for Canvas-compatible markdown
 */
export interface CanvasManager {
  /**
   * Create Canvas with spec content, fallback to file upload on failure.
   *
   * This method implements Property 13: Canvas Fallback. If Canvas creation
   * fails (permissions, quotas, API errors), the system automatically falls
   * back to uploading brainstorm.md as a file attachment.
   *
   * @param spec - The specification document to render as Canvas
   * @param threadTs - Thread timestamp to attach Canvas to
   * @param channelId - Channel ID where Canvas should be created
   * @returns Canvas ID on success, or fallback indicator on file upload
   * @throws SlackCanvasError if both Canvas creation and file upload fail
   */
  createCanvas(
    spec: SpecDocument,
    threadTs: string,
    channelId: string,
  ): Promise<string>;

  /**
   * Update existing Canvas with revised spec content.
   *
   * @param canvasId - The Canvas ID to update
   * @param spec - The updated specification document
   * @throws SlackCanvasError if Canvas update fails
   */
  updateCanvas(canvasId: string, spec: SpecDocument): Promise<void>;

  /**
   * Convert spec markdown to Canvas-compatible format.
   *
   * Uses toMarkdown() from spec-document.ts to format the spec in
   * Regent brainstorm.md format.
   *
   * @param spec - The specification document to format
   * @returns Markdown string formatted for Canvas
   */
  formatForCanvas(spec: SpecDocument): string;
}

/**
 * Production implementation of CanvasManager using Slack Canvas API.
 *
 * Integrates with:
 * - Slack Canvas API for programmatic Canvas creation/editing
 * - SlackMessagingClient for fallback file uploads (Property 13)
 */
export class CanvasManagerImpl implements CanvasManager {
  /**
   * Create a new Canvas manager.
   *
   * @param canvasApi - Slack Canvas API client
   * @param messagingClient - Messaging client for fallback file uploads
   */
  constructor(
    private readonly canvasApi: {
      create: (params: {
        channel_id: string;
        thread_ts: string;
        content: string;
      }) => Promise<{ ok: boolean; canvas_id: string }>;
      edit: (params: {
        canvas_id: string;
        content: string;
      }) => Promise<{ ok: boolean }>;
    },
    private readonly messagingClient: SlackMessagingClient,
  ) {}

  async createCanvas(
    spec: SpecDocument,
    threadTs: string,
    channelId: string,
  ): Promise<string> {
    const markdown = this.formatForCanvas(spec);

    try {
      // Attempt Canvas creation
      const result = await this.canvasApi.create({
        channel_id: channelId,
        thread_ts: threadTs,
        content: markdown,
      });

      // Check if Canvas API returned ok: false
      if (!result.ok) {
        throw new SlackCanvasError(
          "Canvas creation failed",
          "Slack API returned ok: false",
          "Check Canvas permissions and workspace settings",
        );
      }

      return result.canvas_id;
    } catch (error) {
      // Property 13: Canvas Fallback
      // If Canvas creation fails with a SlackCanvasError (permissions, quotas,
      // API errors), fall back to file upload. Other errors (programming errors,
      // unexpected exceptions) are re-thrown as they may indicate bugs that need
      // to be fixed rather than gracefully handled.
      if (error instanceof SlackCanvasError) {
        // Fall back to uploading brainstorm.md as file attachment
        const uploadResult = await this.messagingClient.uploadFile(
          channelId,
          threadTs,
          "brainstorm.md",
          markdown,
          "text/markdown",
        );

        // Return fallback indicator with file ID
        return `fallback:${uploadResult.file.id}`;
      }

      // Re-throw non-SlackCanvasError exceptions (programming errors, unexpected issues)
      throw error;
    }
  }

  async updateCanvas(canvasId: string, spec: SpecDocument): Promise<void> {
    const markdown = this.formatForCanvas(spec);

    const result = await this.canvasApi.edit({
      canvas_id: canvasId,
      content: markdown,
    });

    // Check if Canvas API returned ok: false
    if (!result.ok) {
      throw new SlackCanvasError(
        "Canvas update failed",
        "Slack API returned ok: false",
        "Check Canvas permissions and try again",
      );
    }
  }

  formatForCanvas(spec: SpecDocument): string {
    return toMarkdown(spec);
  }
}

/**
 * Mock Canvas manager for testing.
 *
 * Provides configurable responses and error injection for testing
 * Canvas operations and fallback behavior.
 */
export class MockCanvasManager implements CanvasManager {
  private createCanvasError: Error | null = null;
  private updateCanvasError: Error | null = null;
  private canvasCounter = 0;
  private createdCanvases: Array<{
    canvasId: string;
    threadTs: string;
    channelId: string;
    content: string;
  }> = [];
  private updatedCanvases: Array<{
    canvasId: string;
    content: string;
  }> = [];

  /**
   * Configure an error to be thrown by createCanvas.
   *
   * @param error - Error to throw on next createCanvas call
   */
  setCreateCanvasError(error: Error): void {
    this.createCanvasError = error;
  }

  /**
   * Configure an error to be thrown by updateCanvas.
   *
   * @param error - Error to throw on next updateCanvas call
   */
  setUpdateCanvasError(error: Error): void {
    this.updateCanvasError = error;
  }

  /**
   * Get all canvases created through this mock manager.
   */
  getCreatedCanvases(): Array<{
    canvasId: string;
    threadTs: string;
    channelId: string;
    content: string;
  }> {
    return [...this.createdCanvases];
  }

  /**
   * Get all canvases updated through this mock manager.
   */
  getUpdatedCanvases(): Array<{
    canvasId: string;
    content: string;
  }> {
    return [...this.updatedCanvases];
  }

  /**
   * Clear all configured errors and recorded operations.
   */
  clear(): void {
    this.createCanvasError = null;
    this.updateCanvasError = null;
    this.canvasCounter = 0;
    this.createdCanvases = [];
    this.updatedCanvases = [];
  }

  createCanvas(
    spec: SpecDocument,
    threadTs: string,
    channelId: string,
  ): Promise<string> {
    // Throw configured error if set
    if (this.createCanvasError !== null) {
      return Promise.reject(this.createCanvasError);
    }

    // Generate mock canvas ID
    this.canvasCounter++;
    const canvasId = `canvas_${this.canvasCounter.toString().padStart(10, "0")}`;

    // Record the creation
    const content = this.formatForCanvas(spec);
    this.createdCanvases.push({
      canvasId,
      threadTs,
      channelId,
      content,
    });

    return Promise.resolve(canvasId);
  }

  updateCanvas(canvasId: string, spec: SpecDocument): Promise<void> {
    // Throw configured error if set
    if (this.updateCanvasError !== null) {
      return Promise.reject(this.updateCanvasError);
    }

    // Record the update
    const content = this.formatForCanvas(spec);
    this.updatedCanvases.push({
      canvasId,
      content,
    });

    return Promise.resolve();
  }

  formatForCanvas(spec: SpecDocument): string {
    return toMarkdown(spec);
  }
}
