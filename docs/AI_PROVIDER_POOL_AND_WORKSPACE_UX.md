# GiGo AI Provider Pool and Workspace Interface

**Status:** Foundation implementation committed; live providers and voice quality not yet verified.

## Multi-provider, multi-key configuration

The Worker reads the secret `AI_PROVIDER_POOL` as a JSON array. Each entry represents one authorised provider credential and model configuration:

```json
[
  {
    "provider": "groq",
    "keyId": "groq-project-a",
    "baseUrl": "https://api.groq.com/openai/v1",
    "model": "PROVIDER_MODEL_ID",
    "apiKey": "SECRET_VALUE",
    "freeOnly": true,
    "enabled": true,
    "priority": 1
  },
  {
    "provider": "groq",
    "keyId": "groq-project-b",
    "baseUrl": "https://api.groq.com/openai/v1",
    "model": "PROVIDER_MODEL_ID",
    "apiKey": "ANOTHER_SECRET_VALUE",
    "freeOnly": true,
    "enabled": true,
    "priority": 2
  },
  {
    "provider": "gemini",
    "keyId": "gemini-project-a",
    "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
    "model": "PROVIDER_MODEL_ID",
    "apiKey": "SECRET_VALUE",
    "freeOnly": true,
    "enabled": true,
    "priority": 3
  }
]
```

- Only entries with `freeOnly: true` and `enabled: true` are eligible.
- Keep the complete JSON string in the Cloudflare Worker secret named `AI_PROVIDER_POOL`; never commit it to Git.
- Multiple credentials from the same provider are supported. They must be legitimately authorised, separately provisioned where required, and used in accordance with the provider's terms.
- A provider HTTP 429 response is not bypassed by cycling keys. GiGo cools down that provider for the current Worker isolate and moves to a different provider. This is not a mechanism to evade account or project quotas.
- Invalid credentials (401/403), transient network failures and provider 5xx responses may fall through to another configured credential/provider.
- The protected endpoint `GET /api/v1/assistant/providers` returns provider names, key counts and model names only. It never returns API keys.
- Legacy `AI_API_BASE_URL`, `AI_API_KEY`, `AI_MODEL` configuration remains supported as a temporary single-provider fallback.

The router assumes an OpenAI-compatible chat-completions endpoint and function-calling support. Not every model/provider supports tool calls equally. Confirm each model's API compatibility and free pricing before adding it. Never rely on a model name alone to establish that a request is free.

## Workspace interface

Separate authenticated pages are available for:
- Overview
- AI Assistant
- Projects
- Tasks
- Research & Opportunities
- Product Studio
- Partner Finder
- Leads & CRM
- Offer Builder
- Marketing Studio
- Outreach Studio
- Launch Planner
- Commerce & Fulfilment
- Creative Studio
- Customer Success
- Analytics
- Learning & Accountability
- Settings & AI Providers

Projects and Tasks have real manual forms backed by the existing authenticated APIs. The assistant has its own ocean-blue neural visual design and uses the same project/task tools. Other module pages are currently dedicated workspaces/placeholders: they are not yet connected to module-specific storage or execution. Do not represent them as operational until their backend actions are implemented and tested.

## Voice interface

The assistant page includes a browser-based voice conversation prototype:
- speech recognition via `SpeechRecognition` / `webkitSpeechRecognition` when the browser exposes it;
- recognised text is sent through the same authenticated assistant chat endpoint;
- assistant replies are spoken using browser `speechSynthesis`;
- microphone access and browser/device voice availability are required.

This is a prototype, not yet a guaranteed high-accuracy transcription service. Browser speech recognition support, language coverage, accent handling, privacy behaviour and quality vary. A dedicated server-side speech-to-text adapter and voice-quality evaluation are still required before calling the voice system production-grade.

## Verification still required

1. GitHub TypeScript CI must pass on the latest commit.
2. Cloudflare must deploy the latest `main` branch.
3. Confirm each page route loads on mobile and desktop.
4. Confirm manual project/task create/list/status update.
5. Configure one eligible free provider, then test plain chat.
6. Test function calling separately for each model before enabling it in the pool.
7. Test provider failure handling, quota behaviour and key isolation.
8. Test microphone permissions, recognition quality, TTS and interruption handling on the target Android browser.
