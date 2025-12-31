// ABOUTME: Slack app manifest defining the Regent Slack Bot configuration.
// ABOUTME: Specifies app name, scopes, workflows, datastores, and bot user settings.

import { Manifest } from "deno-slack-sdk/mod.ts";
import { SessionsDatastore } from "./src/datastores/sessions.ts";
import { SlashCommandWorkflow } from "./workflows/slash-command-workflow.ts";
import { MessageEventWorkflow } from "./workflows/message-event-workflow.ts";
import { ExplorationCallbackWorkflow } from "./workflows/exploration-callback-workflow.ts";

export default Manifest({
  name: "regent-slackbot",
  description: "Collaborative specification development through conversational AI in Slack",
  icon: "assets/icon.png",
  workflows: [SlashCommandWorkflow, MessageEventWorkflow, ExplorationCallbackWorkflow],
  datastores: [SessionsDatastore],
  outgoingDomains: ["api.anthropic.com", "api.github.com"],
  botScopes: [
    "app_mentions:read",
    "canvases:write",
    "channels:history",
    "channels:read",
    "chat:write",
    "commands",
    "datastore:read",
    "datastore:write",
    "files:read",
    "files:write",
    "users:read",
  ],
});
