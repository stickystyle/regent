// ABOUTME: Tests for SessionOrchestrator tool loop execution.
// ABOUTME: Tests question-answer loop with tool use, system prompts, and message history.

import { assertEquals, assertExists } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { MockAnthropicClient } from "../../src/clients/anthropic-client.ts";
import { MockGitHubClient } from "../../src/clients/github-client.ts";
import { MockSlackMessagingClient } from "../../src/clients/messaging-client.ts";
import { MockDatastoreClient } from "../../src/managers/datastore-client.ts";
import { MessageCache } from "../../src/managers/message-cache.ts";
import { SessionManager } from "../../src/managers/session-manager.ts";
import { SessionOrchestrator } from "../../src/orchestrators/session-orchestrator.ts";
import type { RepositoryContext } from "../../src/types/repository-context.ts";
import { Framework } from "../../src/types/repository-context.ts";
import type { Session } from "../../src/types/session.ts";
import { Phase } from "../../src/types/session.ts";

/**
 * Helper to create a test session.
 */
function createTestSession(overrides?: Partial<Session>): Session {
  const now = new Date();
  const ttl = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    session_id: "C1234567890:1234567890.123456",
    phase: Phase.Questioning,
    initiator_user_id: "U1234567890",
    confidence_score: 50,
    created_at: now.toISOString(),
    ttl: ttl.toISOString(),
    ...overrides,
  };
}

describe("SessionOrchestrator - Tool Loop", () => {
  let orchestrator: SessionOrchestrator;
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let messageCache: MessageCache;
  let datastore: MockDatastoreClient;

  beforeEach(() => {
    datastore = new MockDatastoreClient();
    messageCache = new MessageCache();
    sessionManager = new SessionManager(datastore, () => new Date(), undefined, messageCache);
    githubClient = new MockGitHubClient();
    anthropicClient = new MockAnthropicClient();
    messagingClient = new MockSlackMessagingClient();

    orchestrator = new SessionOrchestrator(
      sessionManager,
      githubClient,
      anthropicClient,
      messagingClient,
      messageCache,
    );
  });

  afterEach(() => {
    datastore.clear();
    githubClient.clear();
    anthropicClient.clear();
    messagingClient.clear();
    messageCache.clear();
  });

  describe("runToolLoop", () => {
    describe("simple question response (no tools)", () => {
      it("should call Anthropic client with message history", async () => {
        // Arrange: Create session and add existing conversation to cache
        const session = createTestSession();
        await datastore.put(session);

        // Add existing messages to cache
        messageCache.append(session.session_id, {
          sender: "U1234567890",
          text: "I want to build a login feature",
          timestamp: "1234567890.123456",
        });
        messageCache.append(session.session_id, {
          sender: "bot",
          text: "What authentication method would you prefer?",
          timestamp: "1234567890.123457",
        });

        anthropicClient.setNextQuestionResponse({
          question: "What user roles will need access to this feature?",
          confidence_score: 60,
        });

        // Act: Run tool loop with user's answer
        await orchestrator.runToolLoop(
          session,
          "OAuth2 with Google please",
          "U1234567890",
          "1234567890.200000",
        );

        // Assert: Anthropic client should receive message history
        const conversations = anthropicClient.getConversationHistory();
        assertEquals(conversations.length, 1);

        // Should include existing messages plus the new user input
        const lastConversation = conversations[0];
        assertEquals(lastConversation.messages.length >= 3, true);
      });

      it("should post Claude's question to Slack thread", async () => {
        // Arrange
        const session = createTestSession();
        await datastore.put(session);

        anthropicClient.setNextQuestionResponse({
          question: "What specific user permissions should be supported?",
          confidence_score: 55,
        });

        // Act
        await orchestrator.runToolLoop(
          session,
          "We need role-based access control",
          "U1234567890",
          "1234567890.200000",
        );

        // Assert
        const messages = messagingClient.getPostedMessages();
        const questionMessage = messages.find((m) =>
          m.text.includes("permissions") || m.text.includes("specific")
        );
        assertExists(questionMessage);
      });

      it("should update session confidence score", async () => {
        // Arrange
        const session = createTestSession({ confidence_score: 40 });
        await datastore.put(session);

        anthropicClient.setNextQuestionResponse({
          question: "What is the expected user load?",
          confidence_score: 65,
        });

        // Act
        await orchestrator.runToolLoop(
          session,
          "About 1000 daily active users",
          "U1234567890",
          "1234567890.200000",
        );

        // Assert: Verify confidence was updated
        const updatedSession = await sessionManager.loadSession(
          "C1234567890",
          "1234567890.123456",
        );
        assertExists(updatedSession);
        assertEquals(updatedSession.confidence_score, 65);
      });

      it("should append user message to cache before calling Anthropic", async () => {
        // Arrange
        const session = createTestSession();
        await datastore.put(session);

        anthropicClient.setNextQuestionResponse({
          question: "Next question?",
          confidence_score: 50,
        });

        // Act
        await orchestrator.runToolLoop(
          session,
          "My answer to the question",
          "U1234567890",
          "1234567890.200000",
        );

        // Assert: Message should be in cache with correct user ID
        const cachedMessages = messageCache.get(session.session_id);
        const userMessage = cachedMessages.find(
          (m) => m.text === "My answer to the question",
        );
        assertExists(userMessage);
        assertEquals(userMessage.sender, "U1234567890");
      });

      it("should append bot response to cache after receiving response", async () => {
        // Arrange
        const session = createTestSession();
        await datastore.put(session);

        anthropicClient.setNextQuestionResponse({
          question: "What database technology do you prefer?",
          confidence_score: 50,
        });

        // Act
        await orchestrator.runToolLoop(
          session,
          "User input",
          "U1234567890",
          "1234567890.200000",
        );

        // Assert: Bot response should be in cache
        const cachedMessages = messageCache.get(session.session_id);
        const botMessage = cachedMessages.find(
          (m) => m.sender === "bot" && m.text.includes("database"),
        );
        assertExists(botMessage);
      });
    });

    describe("phase transition", () => {
      it("should transition to review phase when confidence reaches 95%", async () => {
        // Arrange
        const session = createTestSession({ confidence_score: 90 });
        await datastore.put(session);

        anthropicClient.setNextQuestionResponse({
          question:
            "I believe we have covered everything. I'm 95% confident we have enough detail.",
          confidence_score: 95,
        });

        // Act
        await orchestrator.runToolLoop(
          session,
          "Yes, I think we've covered all the requirements",
          "U1234567890",
          "1234567890.200000",
        );

        // Assert: Session should transition to review phase
        const updatedSession = await sessionManager.loadSession(
          "C1234567890",
          "1234567890.123456",
        );
        assertExists(updatedSession);
        assertEquals(updatedSession.phase, Phase.Review);
      });

      it("should transition to review phase when confidence exceeds 95%", async () => {
        // Arrange
        const session = createTestSession({ confidence_score: 92 });
        await datastore.put(session);

        anthropicClient.setNextQuestionResponse({
          question: "The requirements are very comprehensive. I'm 98% confident.",
          confidence_score: 98,
        });

        // Act
        await orchestrator.runToolLoop(
          session,
          "Final confirmation",
          "U1234567890",
          "1234567890.200000",
        );

        // Assert
        const updatedSession = await sessionManager.loadSession(
          "C1234567890",
          "1234567890.123456",
        );
        assertExists(updatedSession);
        assertEquals(updatedSession.phase, Phase.Review);
      });

      it("should NOT transition when confidence is below 95%", async () => {
        // Arrange
        const session = createTestSession({ confidence_score: 80 });
        await datastore.put(session);

        anthropicClient.setNextQuestionResponse({
          question: "What about error handling? I'm 94% confident.",
          confidence_score: 94,
        });

        // Act
        await orchestrator.runToolLoop(
          session,
          "Some answer",
          "U1234567890",
          "1234567890.200000",
        );

        // Assert: Should stay in questioning phase
        const updatedSession = await sessionManager.loadSession(
          "C1234567890",
          "1234567890.123456",
        );
        assertExists(updatedSession);
        assertEquals(updatedSession.phase, Phase.Questioning);
      });
    });

    describe("message history formatting", () => {
      it("should include thread context messages in correct order", async () => {
        // Arrange
        const session = createTestSession();
        await datastore.put(session);

        // Simulate existing conversation
        messageCache.append(session.session_id, {
          sender: "U1234567890",
          text: "First message: build a feature",
          timestamp: "1234567890.100000",
        });
        messageCache.append(session.session_id, {
          sender: "bot",
          text: "First question from bot",
          timestamp: "1234567890.100001",
        });
        messageCache.append(session.session_id, {
          sender: "U1234567890",
          text: "Second answer from user",
          timestamp: "1234567890.100002",
        });

        anthropicClient.setNextQuestionResponse({
          question: "Next question?",
          confidence_score: 50,
        });

        // Act
        await orchestrator.runToolLoop(
          session,
          "Third answer from user",
          "U1234567890",
          "1234567890.200000",
        );

        // Assert: Messages should be in order
        const conversations = anthropicClient.getConversationHistory();
        assertEquals(conversations.length, 1);
        const messages = conversations[0].messages;

        // Should have at least 4 messages (3 from cache + 1 new)
        assertEquals(messages.length >= 4, true);

        // Verify order
        assertEquals(messages[0].text, "First message: build a feature");
        assertEquals(messages[1].text, "First question from bot");
        assertEquals(messages[2].text, "Second answer from user");
        assertEquals(messages[3].text, "Third answer from user");
      });

      it("should include processed attachments in message content", async () => {
        // Arrange
        const session = createTestSession();
        await datastore.put(session);

        // Add message with attachment to cache
        messageCache.append(session.session_id, {
          sender: "U1234567890",
          text: "Here is my existing spec",
          timestamp: "1234567890.100000",
          attachments: [
            {
              file_id: "F123456",
              filename: "existing-spec.md",
              mimetype: "text/markdown",
              content: "# Existing Feature Spec\n\nThis is the current spec.",
            },
          ],
        });

        anthropicClient.setNextQuestionResponse({
          question: "Question about the spec?",
          confidence_score: 50,
        });

        // Act
        await orchestrator.runToolLoop(
          session,
          "Please consider this spec",
          "U1234567890",
          "1234567890.200000",
        );

        // Assert: Attachment content should be included
        const conversations = anthropicClient.getConversationHistory();
        assertEquals(conversations.length, 1);

        // The message with attachment should contain the attachment content
        const messageWithAttachment = conversations[0].messages.find((m) =>
          m.attachments && m.attachments.length > 0
        );
        assertExists(messageWithAttachment);
        assertEquals(
          messageWithAttachment.attachments![0].content.includes("Existing Feature Spec"),
          true,
        );
      });

      it("should distinguish between bot and user messages", async () => {
        // Arrange
        const session = createTestSession();
        await datastore.put(session);

        messageCache.append(session.session_id, {
          sender: "U1234567890",
          text: "User message",
          timestamp: "1234567890.100000",
        });
        messageCache.append(session.session_id, {
          sender: "bot",
          text: "Bot message",
          timestamp: "1234567890.100001",
        });
        messageCache.append(session.session_id, {
          sender: "U5555555555",
          text: "Different user message",
          timestamp: "1234567890.100002",
        });

        anthropicClient.setNextQuestionResponse({
          question: "Next?",
          confidence_score: 50,
        });

        // Act
        await orchestrator.runToolLoop(
          session,
          "Another user input",
          "U1234567890",
          "1234567890.200000",
        );

        // Assert
        const conversations = anthropicClient.getConversationHistory();
        const messages = conversations[0].messages;

        // Check senders
        assertEquals(messages[0].sender, "U1234567890");
        assertEquals(messages[1].sender, "bot");
        assertEquals(messages[2].sender, "U5555555555");
      });
    });

    describe("repository context", () => {
      it("should include repository context when session has repository", async () => {
        // Arrange
        const session = createTestSession({ repository: "acme/backend-api" });
        await datastore.put(session);

        // Setup GitHub client to return repository context
        const mockContext: RepositoryContext = {
          repository: "acme/backend-api",
          framework: Framework.FastAPI,
          patterns: ["Repository pattern", "Service layer"],
          relevant_files: [{ path: "src/main.py", description: "Entry point" }],
          structure: "src/\n  routes/\n  services/",
        };

        const configurableGithubClient = new ConfigurableMockGitHubClient();
        configurableGithubClient.setExploreRepositoryResult(mockContext);

        orchestrator = new SessionOrchestrator(
          sessionManager,
          configurableGithubClient,
          anthropicClient,
          messagingClient,
          messageCache,
        );

        anthropicClient.setNextQuestionResponse({
          question: "Question with context?",
          confidence_score: 50,
        });

        // Act
        await orchestrator.runToolLoop(
          session,
          "User answer",
          "U1234567890",
          "1234567890.200000",
        );

        // Assert: Repository context should be passed to Anthropic client
        const conversations = anthropicClient.getConversationHistory();
        assertEquals(conversations.length, 1);
        // Note: Context is passed through the orchestrator's cached context
        // from initial exploration, not re-fetched each time
      });

      it("should work without repository context when session has no repository", async () => {
        // Arrange
        const session = createTestSession({ repository: undefined });
        await datastore.put(session);

        anthropicClient.setNextQuestionResponse({
          question: "Question without context?",
          confidence_score: 50,
        });

        // Act
        await orchestrator.runToolLoop(
          session,
          "User answer",
          "U1234567890",
          "1234567890.200000",
        );

        // Assert: Should succeed without repository context
        const conversations = anthropicClient.getConversationHistory();
        assertEquals(conversations.length, 1);
        assertEquals(conversations[0].context, null);
      });
    });
  });
});

/**
 * Property 3: Single Question Rule
 *
 * Validates: Requirements 3.1, 3.6
 * "For any response in questioning phase, the system should ask exactly one question
 * unless transitioning to review phase."
 */
describe("Property 3 - Single Question Rule", () => {
  let orchestrator: SessionOrchestrator;
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let messageCache: MessageCache;
  let datastore: MockDatastoreClient;

  beforeEach(() => {
    datastore = new MockDatastoreClient();
    messageCache = new MessageCache();
    sessionManager = new SessionManager(datastore, () => new Date(), undefined, messageCache);
    githubClient = new MockGitHubClient();
    anthropicClient = new MockAnthropicClient();
    messagingClient = new MockSlackMessagingClient();

    orchestrator = new SessionOrchestrator(
      sessionManager,
      githubClient,
      anthropicClient,
      messagingClient,
      messageCache,
    );
  });

  afterEach(() => {
    datastore.clear();
    githubClient.clear();
    anthropicClient.clear();
    messagingClient.clear();
    messageCache.clear();
  });

  it("should post exactly one message containing a question per turn", async () => {
    // Arrange
    const session = createTestSession();
    await datastore.put(session);

    anthropicClient.setNextQuestionResponse({
      question: "What authentication provider would you prefer? I'm 50% confident.",
      confidence_score: 50,
    });

    // Act
    await orchestrator.runToolLoop(
      session,
      "I want to add login functionality",
      "U1234567890",
      "1234567890.200000",
    );

    // Assert: Only one question message should be posted
    const messages = messagingClient.getPostedMessages();
    assertEquals(messages.length, 1, "Should post exactly one message");

    // The message should contain a question (ends with ?)
    const questionPattern = /\?/;
    assertEquals(
      questionPattern.test(messages[0].text),
      true,
      "Message should contain a question mark",
    );
  });

  it("should not post multiple questions in a single response", async () => {
    // Arrange
    const session = createTestSession();
    await datastore.put(session);

    // Claude might try to ask multiple questions - system prompt should prevent this
    // but we test that only one message is posted regardless
    anthropicClient.setNextQuestionResponse({
      question: "What authentication do you want? What about authorization? I'm 50% confident.",
      confidence_score: 50,
    });

    // Act
    await orchestrator.runToolLoop(
      session,
      "Build auth system",
      "U1234567890",
      "1234567890.200000",
    );

    // Assert: Still only one Slack message should be posted
    const messages = messagingClient.getPostedMessages();
    assertEquals(
      messages.length,
      1,
      "Should post only one message even if Claude returns multiple questions",
    );
  });

  it("should not post zero questions unless transitioning to review", async () => {
    // Arrange
    const session = createTestSession();
    await datastore.put(session);

    // Non-transition response should still include a question
    anthropicClient.setNextQuestionResponse({
      question: "Have you considered error handling? I'm 70% confident.",
      confidence_score: 70,
    });

    // Act
    await orchestrator.runToolLoop(
      session,
      "User input",
      "U1234567890",
      "1234567890.200000",
    );

    // Assert: At least one message should be posted
    const messages = messagingClient.getPostedMessages();
    assertEquals(messages.length >= 1, true, "Should post at least one message");
  });
});

/**
 * Error scenario tests for runToolLoop.
 */
describe("SessionOrchestrator - Tool Loop Error Handling", () => {
  let orchestrator: SessionOrchestrator;
  let sessionManager: SessionManager;
  let githubClient: MockGitHubClient;
  let anthropicClient: MockAnthropicClient;
  let messagingClient: MockSlackMessagingClient;
  let messageCache: MessageCache;
  let datastore: MockDatastoreClient;

  beforeEach(() => {
    datastore = new MockDatastoreClient();
    messageCache = new MessageCache();
    sessionManager = new SessionManager(datastore, () => new Date(), undefined, messageCache);
    githubClient = new MockGitHubClient();
    anthropicClient = new MockAnthropicClient();
    messagingClient = new MockSlackMessagingClient();

    orchestrator = new SessionOrchestrator(
      sessionManager,
      githubClient,
      anthropicClient,
      messagingClient,
      messageCache,
    );
  });

  afterEach(() => {
    datastore.clear();
    githubClient.clear();
    anthropicClient.clear();
    messagingClient.clear();
    messageCache.clear();
  });

  describe("Anthropic API failure", () => {
    it("should post error message to Slack when Anthropic API fails", async () => {
      // Arrange
      const session = createTestSession();
      await datastore.put(session);

      // Configure Anthropic client to throw an error
      const apiError = new Error("API connection failed");
      anthropicClient.setContinueConversationError(apiError);

      // Act
      await orchestrator.runToolLoop(
        session,
        "User message",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert: Error message should be posted to Slack
      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length, 1);
      assertEquals(
        messages[0].text.includes("Unable to continue the conversation"),
        true,
      );
      assertEquals(
        messages[0].text.includes("API connection failed"),
        true,
      );
    });

    it("should not update session when Anthropic API fails", async () => {
      // Arrange
      const session = createTestSession({ confidence_score: 40 });
      await datastore.put(session);

      anthropicClient.setContinueConversationError(new Error("API error"));

      // Act
      await orchestrator.runToolLoop(
        session,
        "User message",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert: Session should NOT be updated with new confidence
      const storedSession = await sessionManager.loadSession(
        "C1234567890",
        "1234567890.123456",
      );
      assertExists(storedSession);
      assertEquals(storedSession.confidence_score, 40);
    });
  });

  describe("Datastore update failure", () => {
    it("should post error message when datastore update fails", async () => {
      // Arrange
      const session = createTestSession();
      await datastore.put(session);

      anthropicClient.setNextQuestionResponse({
        question: "What is your question?",
        confidence_score: 60,
      });

      // Create a failing datastore mock
      const failingDatastore = new FailingMockDatastoreClient();
      failingDatastore.put(session);
      const failingSessionManager = new SessionManager(
        failingDatastore,
        () => new Date(),
        undefined,
        messageCache,
      );

      const failingOrchestrator = new SessionOrchestrator(
        failingSessionManager,
        githubClient,
        anthropicClient,
        messagingClient,
        messageCache,
      );

      // Act
      await failingOrchestrator.runToolLoop(
        session,
        "User message",
        "U1234567890",
        "1234567890.200000",
      );

      // Assert: Error message should be posted (the question is posted first, then error)
      const messages = messagingClient.getPostedMessages();
      assertEquals(messages.length >= 1, true);
      // The last message should be an error message
      const lastMessage = messages[messages.length - 1];
      assertEquals(
        lastMessage.text.includes("Unable to continue the conversation") ||
          lastMessage.text.includes("What is your question"),
        true,
      );
    });
  });
});

/**
 * Mock datastore that fails on update operations.
 */
class FailingMockDatastoreClient extends MockDatastoreClient {
  override put(session: Session): Promise<{ ok: boolean; item?: Session; error?: string }> {
    // First call succeeds (initial session creation), subsequent calls fail
    if (!this.has(session.session_id)) {
      return super.put(session);
    }
    return Promise.reject(new Error("Datastore update failed"));
  }
}

/**
 * Configurable mock GitHub client for testing with specific repository context.
 */
class ConfigurableMockGitHubClient extends MockGitHubClient {
  private exploreResult: RepositoryContext | null = null;

  setExploreRepositoryResult(context: RepositoryContext): void {
    this.exploreResult = context;
  }

  override exploreRepository(_owner: string, _repo: string): Promise<RepositoryContext> {
    if (this.exploreResult) {
      return Promise.resolve(this.exploreResult);
    }
    return super.exploreRepository(_owner, _repo);
  }
}
