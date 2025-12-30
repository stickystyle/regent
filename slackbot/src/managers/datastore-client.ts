// ABOUTME: Interface for Slack Datastore client to enable dependency injection.
// ABOUTME: Allows testing with mock implementations while using real Slack Datastore in production.

import type { Session } from "../types/session.ts";

/**
 * Response from datastore operations.
 */
export interface DatastoreResponse<T> {
  ok: boolean;
  item?: T;
  error?: string;
}

/**
 * DatastoreClient abstracts the Slack Datastore API for session persistence.
 *
 * This interface enables dependency injection, allowing tests to use mock
 * implementations while production code uses the real Slack Datastore client.
 */
export interface DatastoreClient {
  /**
   * Store a session record in the datastore.
   *
   * @param session - The session to store
   * @returns Response indicating success or failure
   */
  put(session: Session): Promise<DatastoreResponse<Session>>;

  /**
   * Retrieve a session record by ID.
   *
   * @param sessionId - The session ID to retrieve
   * @returns Response containing the session or error
   */
  get(sessionId: string): Promise<DatastoreResponse<Session>>;

  /**
   * Delete a session record.
   *
   * @param sessionId - The session ID to delete
   * @returns Response indicating success or failure
   */
  delete(sessionId: string): Promise<DatastoreResponse<void>>;
}

/**
 * In-memory mock datastore client for testing.
 *
 * Simulates the Slack Datastore with TTL expiration checks.
 */
export class MockDatastoreClient implements DatastoreClient {
  private store = new Map<string, Session>();
  private currentTime: Date;

  constructor(currentTime?: Date) {
    this.currentTime = currentTime ?? new Date();
  }

  /**
   * Set the current time for TTL expiration checks.
   */
  setCurrentTime(time: Date): void {
    this.currentTime = time;
  }

  put(session: Session): Promise<DatastoreResponse<Session>> {
    this.store.set(session.session_id, session);
    return Promise.resolve({ ok: true, item: session });
  }

  get(sessionId: string): Promise<DatastoreResponse<Session>> {
    const session = this.store.get(sessionId);

    if (!session) {
      return Promise.resolve({ ok: false, error: "datastore_error: item not found" });
    }

    // Check TTL expiration
    const ttlDate = new Date(session.ttl);
    if (this.currentTime > ttlDate) {
      // Simulate automatic TTL deletion
      this.store.delete(sessionId);
      return Promise.resolve({ ok: false, error: "datastore_error: item not found" });
    }

    return Promise.resolve({ ok: true, item: session });
  }

  delete(sessionId: string): Promise<DatastoreResponse<void>> {
    const existed = this.store.has(sessionId);
    this.store.delete(sessionId);
    return Promise.resolve({ ok: existed });
  }

  /**
   * Check if a session exists (for testing duplicate prevention).
   */
  has(sessionId: string): boolean {
    return this.store.has(sessionId);
  }

  /**
   * Clear all stored sessions (for test cleanup).
   */
  clear(): void {
    this.store.clear();
  }
}
