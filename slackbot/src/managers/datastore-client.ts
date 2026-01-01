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

/**
 * Slack API client interface for datastore operations.
 *
 * This interface represents the subset of the Slack API client used for
 * datastore operations. It's defined here to avoid importing the full
 * Slack SDK types.
 */
export interface SlackAppsDatastore {
  get<T>(params: {
    datastore: string;
    id: string;
  }): Promise<{ ok: boolean; item?: T; error?: string }>;

  put<T>(params: {
    datastore: string;
    item: T;
  }): Promise<{ ok: boolean; item?: T; error?: string }>;

  delete(params: {
    datastore: string;
    id: string;
  }): Promise<{ ok: boolean; error?: string }>;
}

/**
 * SlackDatastoreClient wraps the Slack API client's datastore methods.
 *
 * This adapter implements the DatastoreClient interface by delegating to
 * the real Slack API client. Used in ROSI functions where the Slack client
 * is provided as a dependency.
 */
export class SlackDatastoreClient implements DatastoreClient {
  private static readonly DATASTORE_NAME = "sessions";
  private appsDatastore: SlackAppsDatastore;

  /**
   * Create a SlackDatastoreClient.
   *
   * @param appsDatastore - The Slack API client's apps.datastore object
   */
  constructor(appsDatastore: SlackAppsDatastore) {
    this.appsDatastore = appsDatastore;
  }

  async put(session: Session): Promise<DatastoreResponse<Session>> {
    const response = await this.appsDatastore.put<Session>({
      datastore: SlackDatastoreClient.DATASTORE_NAME,
      item: session,
    });

    if (!response.ok) {
      return { ok: false, error: response.error };
    }

    return { ok: true, item: session };
  }

  async get(sessionId: string): Promise<DatastoreResponse<Session>> {
    const response = await this.appsDatastore.get<Session>({
      datastore: SlackDatastoreClient.DATASTORE_NAME,
      id: sessionId,
    });

    if (!response.ok) {
      return { ok: false, error: response.error };
    }

    return { ok: true, item: response.item };
  }

  async delete(sessionId: string): Promise<DatastoreResponse<void>> {
    const response = await this.appsDatastore.delete({
      datastore: SlackDatastoreClient.DATASTORE_NAME,
      id: sessionId,
    });

    if (!response.ok) {
      return { ok: false, error: response.error };
    }

    return { ok: true };
  }
}
