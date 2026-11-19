# GiGo Provider Configuration Checklist

**Current status:** Code support is committed. No AI provider API key has yet been added to the Cloudflare Worker, and no provider call has been verified.

## Provider architecture

GiGo keeps the existing multi-key provider pool in the Worker secret `AI_PROVIDER_POOL`. Two providers have dedicated Worker bindings so their credentials can be added separately without editing or replacing that JSON:
- `NVIDIA_NIM_API_KEY` (Secret), optional `NVIDIA_NIM_MODEL` (Variable)
- `CLOUDFLARE_ACCOUNT_ID` (Variable), `CLOUDFLARE_AI_TOKEN` (Secret), optional `CLOUDFLARE_AI_MODEL` (Variable)

The router merges these dedicated bindings with the existing `AI_PROVIDER_POOL`. It does not expose credentials through the provider-status endpoint. Keep all keys server-side.

## Provider pool entries

The following are model defaults to verify in each provider console before enabling. Replace every placeholder with a real credential only inside Cloudflare Worker secrets. Never commit this file or paste credentials into GitHub source code or chat.

| Provider | Suggested model | Base URL |
|---|---|---|
| Gemini | `gemini-2.5-flash` | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| Groq | `openai/gpt-oss-120b` | `https://api.groq.com/openai/v1` |
| OpenRouter | `openrouter/free` | `https://openrouter.ai/api/v1` |
| Zhipu GLM | `glm-4.7-flash` | `https://open.bigmodel.cn/api/paas/v4` |

Add the three Gemini, three Groq, three OpenRouter and three GLM keys as individual entries in the `AI_PROVIDER_POOL` JSON array. Each entry needs a unique `keyId`, its provider's base URL and model ID, `freeOnly: true`, and `enabled: true`. Do not duplicate keys. Multiple keys under one provider do not multiply quota and must never be rotated to bypass rate limits.

Example shape (fake values only):
```json
[
  {
    "provider": "gemini",
    "keyId": "gemini-1",
    "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
    "model": "gemini-2.5-flash",
    "apiKey": "REPLACE_WITH_GEMINI_KEY_1",
    "freeOnly": true,
    "enabled": true,
    "priority": 1
  },
  {
    "provider": "groq",
    "keyId": "groq-1",
    "baseUrl": "https://api.groq.com/openai/v1",
    "model": "openai/gpt-oss-120b",
    "apiKey": "REPLACE_WITH_GROQ_KEY_1",
    "freeOnly": true,
    "enabled": true,
    "priority": 4
  },
  {
    "provider": "openrouter",
    "keyId": "openrouter-1",
    "baseUrl": "https://openrouter.ai/api/v1",
    "model": "openrouter/free",
    "apiKey": "REPLACE_WITH_OPENROUTER_KEY_1",
    "freeOnly": true,
    "enabled": true,
    "priority": 7
  },
  {
    "provider": "zhipu-glm",
    "keyId": "glm-1",
    "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
    "model": "glm-4.7-flash",
    "apiKey": "REPLACE_WITH_GLM_KEY_1",
    "freeOnly": true,
    "enabled": true,
    "priority": 10
  }
]
```

Repeat the four provider objects for key 2 and key 3, changing only `keyId` and `apiKey` unless the provider console specifies a different eligible model. The complete array is stored as one Worker secret named `AI_PROVIDER_POOL`.

## Dedicated provider bindings

Set these under Cloudflare Dashboard → Workers & Pages → `gigo-api` → Settings → Variables and Secrets:

| Name | Type | Value |
|---|---|---|
| `NVIDIA_NIM_API_KEY` | Secret | NVIDIA API key |
| `NVIDIA_NIM_MODEL` | Variable (optional) | `nvidia/nemotron-3-ultra-550b-a55b` |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | Cloudflare account ID |
| `CLOUDFLARE_AI_TOKEN` | Secret | Cloudflare Workers AI API token |
| `CLOUDFLARE_AI_MODEL` | Variable (optional) | `@cf/zai-org/glm-4.7-flash` |

The default NVIDIA endpoint/model are:
- Base URL: `https://integrate.api.nvidia.com/v1`
- Model: `nvidia/nemotron-3-ultra-550b-a55b`

The default Cloudflare Workers AI endpoint is assembled by the Worker from the account ID:
- `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1`
- Model: `@cf/zai-org/glm-4.7-flash`

Do not set a paid plan or billing option to make these providers work. NVIDIA's hosted endpoint is labelled a free prototype endpoint and is subject to NVIDIA trial limits/terms. Cloudflare Workers AI Free has a daily allocation; excess usage on Workers Free fails until reset. Verify current account terms before use.

## Deployment and validation sequence

1. Add the 12 existing Gemini/Groq/OpenRouter/GLM keys to `AI_PROVIDER_POOL` in Cloudflare as one JSON secret.
2. Add the NVIDIA and Cloudflare dedicated bindings above.
3. Save/deploy the Worker and check the protected `GET /api/v1/assistant/providers` endpoint while signed in. It returns provider names, safe key IDs and model names, never API keys.
4. Test one plain chat request per provider.
5. Test harmless read-only tool calling and a multi-turn tool result round trip separately for each model.
6. Confirm usage events are recorded in `ai_usage_events`, and confirm 401/403, 429 and provider outages are handled safely.
7. Do not enable a model for tool-required turns until its tool-call test passes.

## Important safety

- Never send credentials in chat, GitHub commits, browser JavaScript or screenshots.
- Do not replace an existing `AI_PROVIDER_POOL` value without preserving its current contents. If one already exists, edit the JSON locally and add the entries; do not paste the secret into chat.
- The router cools down a provider on HTTP 429. It must not rotate same-provider keys to evade limits.
- A configured credential is not proof of a successful connection. Mark a provider operational only after a live test.
