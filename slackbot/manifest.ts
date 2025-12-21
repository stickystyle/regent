// ABOUTME: Slack app manifest defining the Regent Slack Bot configuration.
// ABOUTME: Specifies app name, scopes, workflows, and bot user settings.

import { Manifest } from "deno-slack-sdk/mod.ts";

export default Manifest({
  name: "regent-slackbot",
  description:
    "Collaborative specification development through conversational AI in Slack",
  icon: "assets/icon.png",
  workflows: [],
  outgoingDomains: ["api.anthropic.com", "api.github.com"],
  botScopes: [
    "app_mentions:read",
    "channels:history",
    "channels:read",
    "chat:write",
    "commands",
    "files:read",
    "files:write",
    "users:read",
  ],
});
