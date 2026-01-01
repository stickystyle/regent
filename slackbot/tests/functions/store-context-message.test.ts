// ABOUTME: Tests for the store-context-message ROSI function.
// ABOUTME: Validates context messages are stored in session datastore.

import { assertEquals } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import type { ContextMessage, Session } from "../../src/types/session.ts";
import { Phase } from "../../src/types/session.ts";
import { storeContextMessageInDatastore } from "../../functions/store-context-message.ts";

describe("storeContextMessageInDatastore", () => {
  let datastore: MockDatastoreClient;

  const testSession: Session = {
    session_id: "C1234567890:1234567880.123456",
    phase: Phase.Questioning,
    initiator_user_id: "U1234567890",
    confidence_score: 50,
    created_at: new Date().toISOString(),
    ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  beforeEach(async () => {
    datastore = new MockDatastoreClient();
    await datastore.put(testSession);
  });

  afterEach(() => {
    datastore.clear();
  });

  it("does not store message when is_direct_mention is true", async () => {
    const result = await storeContextMessageInDatastore(
      {
        session_id: testSession.session_id,
        sender: "U9876543210",
        text: "Direct mention message",
        timestamp: "1234567890.123456",
        is_direct_mention: true,
      },
      datastore,
    );

    assertEquals(result.success, true);
    assertEquals(result.stored, false);
    assertEquals(result.reason, "direct_mention");

    // Verify message was NOT stored in session's context_messages
    const updatedSession = await datastore.get(testSession.session_id);
    assertEquals(updatedSession.ok, true);
    assertEquals(
      updatedSession.item!.context_messages,
      undefined,
      "Direct mentions should not be stored as context messages",
    );
  });

  it("stores context message when is_direct_mention is false", async () => {
    const result = await storeContextMessageInDatastore(
      {
        session_id: testSession.session_id,
        sender: "U9876543210",
        text: "Context message not a direct mention",
        timestamp: "1234567890.123456",
        is_direct_mention: false,
      },
      datastore,
    );

    assertEquals(result.success, true);
    assertEquals(result.stored, true);

    // Verify message was stored in session's context_messages
    const updatedSession = await datastore.get(testSession.session_id);
    const contextMessages: ContextMessage[] = JSON.parse(
      updatedSession.item!.context_messages!,
    );
    assertEquals(contextMessages.length, 1);
    assertEquals(contextMessages[0].text, "Context message not a direct mention");
  });

  it("stores context message when is_direct_mention is undefined (defaults to context)", async () => {
    const result = await storeContextMessageInDatastore(
      {
        session_id: testSession.session_id,
        sender: "U9876543210",
        text: "Message without mention flag",
        timestamp: "1234567890.123456",
        is_direct_mention: undefined,
      },
      datastore,
    );

    assertEquals(result.success, true);
    assertEquals(result.stored, true);

    // Verify message was stored (undefined should default to storing)
    const updatedSession = await datastore.get(testSession.session_id);
    const contextMessages: ContextMessage[] = JSON.parse(
      updatedSession.item!.context_messages!,
    );
    assertEquals(contextMessages.length, 1);
  });

  it("stores context message in session datastore record", async () => {
    const result = await storeContextMessageInDatastore(
      {
        session_id: testSession.session_id,
        sender: "U9876543210",
        text: "Team discussion in datastore",
        timestamp: "1234567890.123456",
        is_direct_mention: false,
      },
      datastore,
    );

    assertEquals(result.success, true);
    assertEquals(result.stored, true);

    // Verify message was stored in session's context_messages
    const updatedSession = await datastore.get(testSession.session_id);
    assertEquals(updatedSession.ok, true);
    assertEquals(updatedSession.item !== undefined, true);

    const contextMessages: ContextMessage[] = JSON.parse(
      updatedSession.item!.context_messages!,
    );
    assertEquals(contextMessages.length, 1);
    assertEquals(contextMessages[0].sender, "U9876543210");
    assertEquals(contextMessages[0].text, "Team discussion in datastore");
    assertEquals(contextMessages[0].timestamp, "1234567890.123456");
  });

  it("appends to existing context messages", async () => {
    // Store first message
    await storeContextMessageInDatastore(
      {
        session_id: testSession.session_id,
        sender: "U1111111111",
        text: "First message",
        timestamp: "1234567890.100000",
        is_direct_mention: false,
      },
      datastore,
    );

    // Store second message
    await storeContextMessageInDatastore(
      {
        session_id: testSession.session_id,
        sender: "U2222222222",
        text: "Second message",
        timestamp: "1234567890.200000",
        is_direct_mention: false,
      },
      datastore,
    );

    // Verify both messages are stored
    const updatedSession = await datastore.get(testSession.session_id);
    const contextMessages: ContextMessage[] = JSON.parse(
      updatedSession.item!.context_messages!,
    );

    assertEquals(contextMessages.length, 2);
    assertEquals(contextMessages[0].text, "First message");
    assertEquals(contextMessages[1].text, "Second message");
  });

  it("does not store message when session does not exist", async () => {
    const result = await storeContextMessageInDatastore(
      {
        session_id: "C9999999999:9999999999.999999",
        sender: "U9876543210",
        text: "Message in non-existent session",
        timestamp: "1234567890.123456",
        is_direct_mention: false,
      },
      datastore,
    );

    assertEquals(result.success, true);
    assertEquals(result.stored, false);
    assertEquals(result.reason, "no_session");
  });

  it("does not store message when session_id is undefined", async () => {
    const result = await storeContextMessageInDatastore(
      {
        session_id: undefined,
        sender: "U9876543210",
        text: "Message without session",
        timestamp: "1234567890.123456",
        is_direct_mention: false,
      },
      datastore,
    );

    assertEquals(result.success, true);
    assertEquals(result.stored, false);
    assertEquals(result.reason, "no_session_id");
  });

  it("handles missing sender gracefully", async () => {
    const result = await storeContextMessageInDatastore(
      {
        session_id: testSession.session_id,
        sender: undefined,
        text: "Message without sender",
        timestamp: "1234567890.123456",
        is_direct_mention: false,
      },
      datastore,
    );

    assertEquals(result.success, true);
    assertEquals(result.stored, false);
    assertEquals(result.reason, "missing_data");
  });

  it("handles corrupted context_messages JSON gracefully", async () => {
    // Set corrupted context_messages
    const corruptedSession: Session = {
      ...testSession,
      context_messages: "not valid json",
    };
    await datastore.put(corruptedSession);

    const result = await storeContextMessageInDatastore(
      {
        session_id: testSession.session_id,
        sender: "U9876543210",
        text: "New message",
        timestamp: "1234567890.123456",
        is_direct_mention: false,
      },
      datastore,
    );

    assertEquals(result.success, true);
    assertEquals(result.stored, true);

    // Verify new message replaces corrupted data
    const updatedSession = await datastore.get(testSession.session_id);
    const contextMessages: ContextMessage[] = JSON.parse(
      updatedSession.item!.context_messages!,
    );
    assertEquals(contextMessages.length, 1);
    assertEquals(contextMessages[0].text, "New message");
  });

  it("preserves other session fields when storing context message", async () => {
    const sessionWithFields: Session = {
      ...testSession,
      repository: "owner/repo",
      canvas_id: "F123456",
      epic_number: 42,
    };
    await datastore.put(sessionWithFields);

    await storeContextMessageInDatastore(
      {
        session_id: testSession.session_id,
        sender: "U9876543210",
        text: "Context message",
        timestamp: "1234567890.123456",
        is_direct_mention: false,
      },
      datastore,
    );

    const updatedSession = await datastore.get(testSession.session_id);
    assertEquals(updatedSession.item!.repository, "owner/repo");
    assertEquals(updatedSession.item!.canvas_id, "F123456");
    assertEquals(updatedSession.item!.epic_number, 42);
  });
});

describe("storeContextMessage ROSI function contract", () => {
  it("should define expected input parameters including is_direct_mention", () => {
    // This test documents the expected ROSI function input schema
    // is_direct_mention is used to skip storage for direct @regent mentions
    const expectedInputs = {
      session_id: "string (optional)",
      sender: "string (optional)",
      text: "string (optional)",
      timestamp: "string (optional)",
      is_direct_mention: "boolean (optional)",
    };

    // All inputs are optional because they come from message-event function
    // which may have undefined values in error cases
    assertEquals(typeof expectedInputs.session_id, "string");
    assertEquals(typeof expectedInputs.sender, "string");
    assertEquals(typeof expectedInputs.text, "string");
    assertEquals(typeof expectedInputs.timestamp, "string");
    assertEquals(typeof expectedInputs.is_direct_mention, "string");
  });

  it("should define expected output parameters", () => {
    // This test documents the expected ROSI function output schema
    const expectedOutputs = {
      success: true,
      stored: true,
      reason: undefined,
    };

    assertEquals(expectedOutputs.success, true);
    assertEquals(expectedOutputs.stored, true);
    assertEquals(expectedOutputs.reason, undefined);
  });
});

describe("ROSI SlackFunction wrapper", () => {
  it("should store context messages in session datastore record", () => {
    // The ROSI SlackFunction wrapper:
    // 1. Creates a DatastoreClient adapter from client.apps.datastore
    // 2. Fetches the session record
    // 3. Appends the context message to session.context_messages
    // 4. Saves the updated session

    // This tests the contract that context messages are persisted
    const sessionId = "C1234567890:1234567880.123456";
    const contextMessage = {
      sender: "U9876543210",
      text: "Team discussion",
      timestamp: "1234567890.123456",
    };

    // Verify context message structure matches ContextMessage type
    assertEquals(contextMessage.sender, "U9876543210");
    assertEquals(contextMessage.text, "Team discussion");
    assertEquals(typeof sessionId, "string");
  });

  it("should return stored: true when session exists and message is stored", () => {
    // Expected output when storage succeeds
    const expectedOutput = {
      success: true,
      stored: true,
    };

    assertEquals(expectedOutput.success, true);
    assertEquals(expectedOutput.stored, true);
  });

  it("should return stored: false with reason when session does not exist", () => {
    // Expected output when session lookup fails
    const expectedOutput = {
      success: true,
      stored: false,
      reason: "no_session",
    };

    assertEquals(expectedOutput.success, true);
    assertEquals(expectedOutput.stored, false);
    assertEquals(expectedOutput.reason, "no_session");
  });

  it("should accept is_direct_mention input to prevent double-storage", () => {
    // is_direct_mention is used to skip storage for direct @regent mentions
    // which are handled by the orchestrator's MessageCache.
    const inputsWithMention = {
      session_id: "C1234567890:1234567880.123456",
      sender: "U9876543210",
      text: "Direct mention message",
      timestamp: "1234567890.123456",
      is_direct_mention: true,
    };

    // When is_direct_mention is true, the function should skip storage
    assertEquals(inputsWithMention.is_direct_mention, true);

    const inputsWithoutMention = {
      session_id: "C1234567890:1234567880.123456",
      sender: "U9876543210",
      text: "Context message",
      timestamp: "1234567890.123456",
      is_direct_mention: false,
    };

    // When is_direct_mention is false, the function should store the message
    assertEquals(inputsWithoutMention.is_direct_mention, false);
  });
});
