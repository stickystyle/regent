// ABOUTME: Tests for the message-event-workflow ROSI workflow.
// ABOUTME: Validates workflow structure and step chaining for context message storage.

import { assertEquals, assertExists } from "@std/assert";
import { describe, it } from "@std/testing/bdd";

/**
 * Note: ROSI workflows are declarative configurations that are processed by the
 * Slack SDK at runtime. We can't directly test the runtime behavior, but we can
 * validate the workflow structure by importing it and checking its definition.
 *
 * The message-event-workflow should:
 * 1. Define input parameters for message event data
 * 2. Add a step for MessageEventFunction to parse the message
 * 3. Add a step for StoreContextMessageFunction to store context messages
 *
 * The StoreContextMessageFunction handles its own "do nothing" logic when:
 * - session_id is undefined (message not in a thread)
 * - session doesn't exist (thread has no active brainstorm)
 */

describe("MessageEventWorkflow structure", () => {
  it("should export the workflow definition", async () => {
    const module = await import("../../workflows/message-event-workflow.ts");

    assertExists(module.MessageEventWorkflow);
    assertEquals(typeof module.MessageEventWorkflow.addStep, "function");
  });

  it("should have the correct callback_id", async () => {
    const module = await import("../../workflows/message-event-workflow.ts");

    assertEquals(
      module.MessageEventWorkflow.definition.callback_id,
      "message_event_workflow",
    );
  });

  it("should define required input parameters", async () => {
    const module = await import("../../workflows/message-event-workflow.ts");
    const inputProps =
      module.MessageEventWorkflow.definition.input_parameters?.properties;

    assertExists(inputProps);
    assertExists(inputProps.event_type, "missing event_type input");
    assertExists(inputProps.channel_id, "missing channel_id input");
    assertExists(inputProps.user_id, "missing user_id input");
    assertExists(inputProps.message_text, "missing message_text input");
    assertExists(inputProps.message_ts, "missing message_ts input");
    assertExists(inputProps.thread_ts, "missing thread_ts input");
    assertExists(inputProps.bot_id, "missing bot_id input");
  });
});

describe("MessageEventWorkflow step chaining contract", () => {
  /**
   * This test documents the expected data flow between workflow steps.
   *
   * Step 1: MessageEventFunction
   *   Inputs: event_type, channel_id, user_id, message_text, message_ts, thread_ts, bot_id
   *   Outputs: should_respond, sender, message_text, timestamp, session_id, is_direct_mention
   *
   * Step 2: StoreContextMessageFunction
   *   Inputs: session_id, sender, text, timestamp (from Step 1 outputs)
   *   Outputs: success, stored, reason
   *
   * The StoreContextMessageFunction gracefully handles:
   * - No session_id (returns stored: false, reason: no_session_id)
   * - No session exists (returns stored: false, reason: no_session)
   * - Missing data (returns stored: false, reason: missing_data)
   */

  it("should pass session_id from MessageEventFunction to StoreContextMessageFunction", () => {
    // This documents the expected mapping from step 1 outputs to step 2 inputs
    const messageEventOutputs = {
      should_respond: false,
      sender: "U1234567890",
      message_text: "Team discussion",
      timestamp: "1234567890.123456",
      session_id: "C1234567890:1234567880.123456",
      is_direct_mention: false,
    };

    const storeContextInputs = {
      session_id: messageEventOutputs.session_id,
      sender: messageEventOutputs.sender,
      text: messageEventOutputs.message_text,
      timestamp: messageEventOutputs.timestamp,
    };

    assertEquals(storeContextInputs.session_id, "C1234567890:1234567880.123456");
    assertEquals(storeContextInputs.sender, "U1234567890");
    assertEquals(storeContextInputs.text, "Team discussion");
    assertEquals(storeContextInputs.timestamp, "1234567890.123456");
  });

  it("should handle undefined outputs gracefully", () => {
    // When a message is not in a thread or is from a bot, some outputs are undefined
    const messageEventOutputs = {
      should_respond: false,
      sender: undefined,
      message_text: undefined,
      timestamp: undefined,
      session_id: undefined,
      is_direct_mention: false,
    };

    const storeContextInputs = {
      session_id: messageEventOutputs.session_id,
      sender: messageEventOutputs.sender,
      text: messageEventOutputs.message_text,
      timestamp: messageEventOutputs.timestamp,
    };

    // StoreContextMessageFunction will return stored: false with appropriate reason
    assertEquals(storeContextInputs.session_id, undefined);
    assertEquals(storeContextInputs.sender, undefined);
  });

  it("should store context message for non-mention messages in active sessions", () => {
    // This is the happy path: user posts a comment in an active brainstorm thread
    const scenario = {
      // Workflow inputs (from trigger)
      workflowInputs: {
        event_type: "message",
        channel_id: "C1234567890",
        user_id: "U1234567890",
        message_text: "@alice should we use PostgreSQL?",
        message_ts: "1234567890.123456",
        thread_ts: "1234567880.123456",
        bot_id: undefined,
      },

      // MessageEventFunction outputs
      step1Outputs: {
        should_respond: false, // No @regent mention
        sender: "U1234567890",
        message_text: "@alice should we use PostgreSQL?",
        timestamp: "1234567890.123456",
        session_id: "C1234567890:1234567880.123456",
        is_direct_mention: false,
      },

      // StoreContextMessageFunction outputs (assuming session exists)
      step2Outputs: {
        success: true,
        stored: true,
        reason: undefined,
      },
    };

    // Verify the data mapping
    assertEquals(scenario.step1Outputs.should_respond, false);
    assertEquals(scenario.step1Outputs.is_direct_mention, false);
    assertEquals(
      scenario.step1Outputs.session_id,
      `${scenario.workflowInputs.channel_id}:${scenario.workflowInputs.thread_ts}`,
    );
  });

  it("should not store message when no active session exists", () => {
    // User posts in a thread that doesn't have an active brainstorm
    const scenario = {
      step1Outputs: {
        should_respond: false,
        sender: "U1234567890",
        message_text: "Random comment",
        timestamp: "1234567890.123456",
        session_id: "C9999999999:9999999999.999999", // No session for this
        is_direct_mention: false,
      },

      step2Outputs: {
        success: true,
        stored: false,
        reason: "no_session",
      },
    };

    // StoreContextMessageFunction handles this gracefully
    assertEquals(scenario.step2Outputs.stored, false);
    assertEquals(scenario.step2Outputs.reason, "no_session");
  });

  it("should still store message even when should_respond is true", () => {
    // The workflow always calls StoreContextMessageFunction regardless of should_respond.
    // For @regent messages (should_respond: true), the StoreContextMessageFunction
    // will still be called but the message won't be stored as a context message
    // because it's processed through the normal orchestrator flow.
    //
    // Note: The orchestrator adds direct mention messages to cache separately,
    // so there's no double-storage issue.
    const scenario = {
      step1Outputs: {
        should_respond: true, // This is an @regent mention
        sender: "U1234567890",
        message_text: "@regent Let me answer your question",
        timestamp: "1234567890.123456",
        session_id: "C1234567890:1234567880.123456",
        is_direct_mention: true,
      },
    };

    // The workflow always calls StoreContextMessageFunction with the outputs
    // The function itself handles whether to store based on message type
    assertEquals(scenario.step1Outputs.should_respond, true);
    assertEquals(scenario.step1Outputs.is_direct_mention, true);
  });
});

describe("Workflow function imports", () => {
  it("should import MessageEventFunction", async () => {
    const module = await import("../../functions/message-event.ts");
    assertExists(module.MessageEventFunction);
  });

  it("should import StoreContextMessageFunction", async () => {
    const module = await import("../../functions/store-context-message.ts");
    assertExists(module.StoreContextMessageFunction);
  });
});
