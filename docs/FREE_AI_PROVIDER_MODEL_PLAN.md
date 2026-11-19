# GiGo Free AI Provider and Model Plan

**Prepared:** 2026-11-19  
**Policy:** zero-budget first; no provider may incur paid usage without explicit owner approval.

This is the current provider plan for GiGo. Alibaba Cloud Qwen has been removed because account activation requires a payment card the owner cannot provide. The replacement provider set is Google Gemini, Groq, Zhipu AI GLM, OpenRouter, Cloudflare Workers AI, and NVIDIA NIM. This is a configuration plan only: **no provider API key has yet been added to the Cloudflare Worker or verified by GiGo**.

## Recommended provider/model choices

| Provider | Starting model ID | OpenAI-compatible base URL | Intended use | Free-access qualification |
|---|---|---|---|---|
| Google Gemini | `gemini-2.5-flash` (or a newer Flash model only after its free-tier status is verified) | `https://generativelanguage.googleapis.com/v1beta/openai/` | General assistant, research synthesis, long documents and multimodal work | Free tier applies only to eligible models and has rate limits. Google states free-tier prompts/responses may be used to improve products; do not send confidential/sensitive material unless the owner accepts those terms. |
| Groq | `openai/gpt-oss-120b` | `https://api.groq.com/openai/v1` | Fast responses, tool calling, drafting and coding support | Free-plan limits are model-specific and organization-level. Check the account's Free Plan Limits page. Never rotate keys to bypass a 429. |
| Zhipu AI (GLM / BigModel.cn) | `glm-4.7-flash` | `https://open.bigmodel.cn/api/paas/v4` | Reasoning, coding, Chinese/English writing and an independent fallback | Zhipu announced GLM-4.7-Flash as free to call through its BigModel.cn platform. Check current account/model access and rate limits in the official console. This is not BigModel.io; do not substitute an unrelated reseller endpoint. |
| OpenRouter | `openrouter/free` | `https://openrouter.ai/api/v1` | Model diversity and fallback when another provider is unavailable | Routes to eligible free models. Free variants have request limits and model availability changes; check selected model capabilities, especially tool calling. |
| Cloudflare Workers AI | `@cf/zai-org/glm-4.7-flash` | `https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1` | Cloudflare-native inference route; additional reasoning/coding and fallback capacity | Workers Free plan documents a 10,000-Neuron daily allocation. On Workers Free, requests fail after the daily allocation is exhausted rather than silently becoming paid. This allocation is shared across Workers AI usage and resets daily. Do not upgrade to a paid plan without approval. |
| NVIDIA NIM | `nvidia/nemotron-3-ultra-550b-a55b` | `https://integrate.api.nvidia.com/v1` | High-capability reasoning, coding, planning, long-context and agent/tool workflows | NVIDIA's model page currently labels the hosted endpoint as a free prototype endpoint. Treat it as rate-limited/prototype capacity, not guaranteed production quota. Check current NVIDIA account/model terms and limits. |

## Why these providers

- **Gemini:** general-purpose reasoning, synthesis and multimodal capability.
- **Groq:** low-latency inference for responsive assistant turns.
- **GLM:** a separate reasoning/coding model family.
- **OpenRouter:** a single integration to a changing catalogue of alternative models, including eligible free choices.
- **Cloudflare Workers AI:** a provider route close to GiGo's existing Cloudflare infrastructure, with a documented free Workers allocation.
- **NVIDIA Nemotron 3 Ultra:** a strong candidate for complex reasoning, coding, planning and agentic workflows. NVIDIA documents a 1M-token context window and function-calling support for this model.

These are complementary model/provider options, not six equal or guaranteed sources of free capacity. Quotas remain controlled by each provider and may change.

## Key and quota rules

1. Store credentials only in Cloudflare Worker secrets, preferably the existing `AI_PROVIDER_POOL` secret; never commit secrets to GitHub or put them in browser JavaScript/chat.
2. **No API keys have been added to the Worker yet.** The owner has obtained API keys/credentials from Gemini, Groq, OpenRouter, GLM and NVIDIA, and created the Cloudflare Workers AI credential, but they are not yet configured in GiGo. Do not describe any provider as live or tested until verified.
3. Start with one key per provider. Add second/third keys only for legitimate project/environment separation and only where the provider permits it.
4. Multiple keys normally share account, organisation, project or model quotas. They do not create extra free quota and must never be used to evade rate limits.
5. Set each entry's `freeOnly: true` and `enabled: true` only after confirming the exact model/route is eligible for free use. Never configure a paid model and label it free.
6. NVIDIA's hosted prototype endpoint is not a guaranteed unlimited free production service. Monitor its account limits and disable it if the free terms change.
7. Provider fallback is for outages and genuine capacity differences. On HTTP 429, GiGo cools down that provider instead of cycling through its keys.
8. Keep user-sensitive data out of providers whose free-tier terms permit prompt/output use for product improvement unless the owner has reviewed and accepted the terms.

## NVIDIA Nemotron 3 Ultra configuration reference

- Provider label: `nvidia-nim`
- Model: `nvidia/nemotron-3-ultra-550b-a55b`
- Base URL: `https://integrate.api.nvidia.com/v1`
- GiGo appends `/chat/completions`.
- Authentication: NVIDIA API key as Bearer token.
- NVIDIA's official API reference uses the OpenAI-compatible chat-completions endpoint.
- Function calling is listed as supported on the model page. GiGo must still test its exact tool schema and multi-turn tool-result round trip before using this model for tool execution.
- Use one provider-pool entry for one credential. Do not duplicate the same key two or three times to try to increase quota.

## Cloudflare Workers AI configuration reference

- Provider label: `cloudflare-workers-ai`
- Model: `@cf/zai-org/glm-4.7-flash`
- Base URL: `https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1`
- GiGo appends `/chat/completions`.
- Authentication: Cloudflare API token with the required Workers AI permissions.
- Do not upgrade the Worker to a paid plan to obtain more capacity without the owner's explicit approval.

## Important integration checks before enabling a model

GiGo's current router sends OpenAI-compatible `/chat/completions` requests and may include function/tool definitions. A model being listed by a provider does **not** prove that it supports the exact tool-calling schema GiGo uses.

For each model, test separately:
- authentication and correct endpoint;
- one plain text completion;
- a function/tool call with a harmless read-only workspace tool;
- a multi-turn tool result round trip;
- streaming only if/when the UI requires it;
- quota exhaustion and 429 handling;
- provider response usage fields and usage-ledger recording;
- confirmation that no paid fallback or billing path can be triggered.

Do not enable a model for assistant tool execution until those tests pass. A model that can answer text-only may remain available for text-only tasks, but must not be selected for tool-required turns.

## Official references

- Gemini pricing/free tier: https://ai.google.dev/gemini-api/docs/pricing
- Gemini OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai
- Groq models: https://console.groq.com/docs/models
- Groq rate limits: https://console.groq.com/docs/rate-limits
- Zhipu GLM-4.7-Flash announcement: https://www.zhipuai.cn/zh/news/148
- OpenRouter free models: https://openrouter.ai/collections/free-models
- Cloudflare Workers AI free allocation: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Cloudflare GLM-4.7-Flash model page: https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/
- Cloudflare OpenAI-compatible endpoint: https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
- NVIDIA Nemotron 3 Ultra model and free prototype endpoint: https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b
- NVIDIA Nemotron 3 Ultra API reference: https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b/apireference

## Current implementation boundary

The provider pool in `src/assistant/providers.ts` accepts multiple providers, models and keys. This plan does not claim that credentials have been configured or live model calls have succeeded. The next operational step is to add credentials securely to the Cloudflare Worker, then test each provider/model individually. The router's generic OpenAI-compatible request shape must be checked against each model, especially NVIDIA's optional thinking parameters and tool-call response format.
