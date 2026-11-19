# GiGo Free AI Provider and Model Plan

**Prepared:** 2026-11-19  
**Policy:** zero-budget first; no provider may incur paid usage without explicit owner approval.

This plan preserves the five providers selected for GiGo: Google Gemini, Groq, Alibaba Cloud Qwen, Zhipu AI GLM, and OpenRouter. Provider selection is not a claim that all five have unlimited free service. Free tiers, eligible models, quotas and regional availability change; verify the provider console before enabling a model.

## Recommended starting models

| Provider | Starting model ID | OpenAI-compatible base URL | Intended use | Free-access qualification |
|---|---|---|---|---|
| Google Gemini | `gemini-2.5-flash` (or a newer Flash model only after its free-tier status is verified) | `https://generativelanguage.googleapis.com/v1beta/openai/` | General assistant, research synthesis, long documents and multimodal work | Free tier applies only to eligible models and has rate limits. Google states free-tier prompts/responses may be used to improve products; do not send confidential/sensitive material unless the owner accepts those terms. |
| Groq | `openai/gpt-oss-120b` | `https://api.groq.com/openai/v1` | Fast responses, tool calling, drafting and coding support | Free-plan limits are model-specific and organization-level. Check the account's Free Plan Limits page. Never rotate keys to bypass a 429. |
| Alibaba Cloud Model Studio (Qwen) | `qwen3.8-27b` | Singapore workspace endpoint: `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | Research, reasoning, coding and long-form product creation | Free quota is regional/model-specific, generally valid for 90 days. Only eligible Singapore-region models with International deployment scope qualify. Complete account information, activate Singapore Model Studio, confirm the model has quota, and enable **Free Quota Only** before use. Replace {WorkspaceId} with the workspace ID shown in the console. |
| Zhipu AI (GLM / BigModel.cn) | `glm-4.7-flash` | `https://open.bigmodel.cn/api/paas/v4` | Reasoning, coding, Chinese/English writing and an independent fallback | Zhipu announced GLM-4.7-Flash as free to call through its BigModel.cn platform. Check current account/model access and rate limits in the official console. This is not BigModel.io; do not substitute an unrelated reseller endpoint. |
| OpenRouter | `openrouter/free` | `https://openrouter.ai/api/v1` | Model diversity and fallback when another provider is unavailable | Routes to eligible free models. Free variants currently have request limits (including 50/day and 20/minute under the published free-variant policy); limits and available models can change. Check selected model capabilities, especially tool calling. |

## Why these five

- **Gemini:** strong general-purpose reasoning, synthesis, multimodal support and large-context workflows.
- **Groq:** low-latency inference and a separate provider for responsive assistant turns.
- **Qwen:** an additional model family for technical reasoning, coding and detailed content/product work.
- **GLM:** a distinct reasoning/coding family with a specifically announced free Flash model.
- **OpenRouter:** a single integration to a changing catalogue of alternative models, including free choices.

These are complementary model/provider options, not five equal or guaranteed sources of free capacity. Quotas remain controlled by each provider.

## Key and quota rules

1. Store credentials only in the Cloudflare Worker secret `AI_PROVIDER_POOL`; never commit secrets to GitHub or put them in browser JavaScript/chat.
2. Start with one key per provider. Add second/third keys only for legitimate project/environment separation and only where the provider permits it.
3. Multiple keys normally share account, organisation, project or model quotas. They do not create extra free quota and must never be used to evade rate limits.
4. Set each entry's `freeOnly: true` and `enabled: true`. Do not configure a paid model and label it free.
5. For Alibaba Qwen, enable **Free Quota Only** in the Singapore console before making requests; its free quota otherwise can fall through to pay-as-you-go after exhaustion.
6. For all providers, inspect model price/eligibility and console limits before enabling. Do not rely on an old model ID or a third-party model list.
7. Provider fallback is for outages and genuine capacity differences. On HTTP 429, GiGo cools down that provider instead of cycling through its keys.
8. Keep user-sensitive data out of providers whose free-tier terms permit prompt/output use for product improvement unless the owner has reviewed and accepted the terms.

## Important integration checks before enabling a model

GiGo's current router sends OpenAI-compatible `/chat/completions` requests and may include function/tool definitions. A model being listed by a provider does **not** prove that it supports the exact tool-calling schema GiGo uses.

For each model, test separately:
- authentication and correct regional endpoint;
- one plain text completion;
- a function/tool call with a harmless read-only workspace tool;
- a multi-turn tool result round trip;
- streaming only if/when the UI requires it;
- quota exhaustion and 429 handling;
- provider response usage fields and usage-ledger recording.

Do not enable a model for assistant tool execution until those tests pass. A model that can answer text-only may remain available for text-only tasks, but must not be selected for tool-required turns.

## Official references

- Gemini pricing/free tier: https://ai.google.dev/gemini-api/docs/pricing
- Gemini OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai
- Groq models: https://console.groq.com/docs/models
- Groq rate limits: https://console.groq.com/docs/rate-limits
- Qwen OpenAI-compatible endpoint: https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope
- Qwen Singapore free quota and Free Quota Only: https://www.alibabacloud.com/help/en/model-studio/new-free-quota
- Zhipu GLM-4.7-Flash free announcement and official API guide: https://www.zhipuai.cn/zh/news/148
- OpenRouter free models and limits: https://openrouter.ai/collections/free-models

## Current implementation boundary

The provider pool in `src/assistant/providers.ts` already accepts multiple providers, models and keys. The next implementation task is to configure one credential per provider and run the tests above. The router currently uses the OpenAI-compatible chat-completions shape; provider-specific differences (including native Gemini API semantics) must be tested before production use. This document does not claim that credentials have been configured or live model calls have succeeded.


## Qwen replacement: Cloudflare Workers AI (recommended)

Because Alibaba Model Studio is asking for a payment card, do not spend more time trying to force Qwen activation. Use **Cloudflare Workers AI** as an additional provider instead. GiGo already runs on Cloudflare, and Workers AI offers a documented Free Workers allocation of **10,000 Neurons per day**. On the Workers Free plan, exceeding that daily allocation causes requests to fail until reset; it does not automatically become paid usage. Do not upgrade the Worker to a paid plan for this project without the owner's explicit approval.

Recommended model:
- Model: `@cf/zai-org/glm-4.7-flash`
- Purpose: reasoning, coding, multilingual responses and assistant tool calls.
- Official model page identifies function calling support and 131,072-token context.
- Cloudflare lists this model among those still available on the Workers Free plan (unlike some larger GLM/DeepSeek models).

OpenAI-compatible endpoint:
- Base URL: `https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1`
- GiGo appends `/chat/completions` automatically.
- Authentication: Cloudflare API token with the minimum required Workers AI permissions.
- Model ID: `@cf/zai-org/glm-4.7-flash`

The free allocation is shared across Workers AI usage, resets daily at 00:00 UTC, and is not 10,000 neurons per model. Some other models (including GLM-5.2 and newer DeepSeek V4 variants) require a paid Workers plan or prepaid AI Gateway credits. Do not select them for this zero-budget configuration.

Cloudflare official references:
- Free allocation and billing: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Model free-plan availability: https://developers.cloudflare.com/changelog/post/2026-07-28-models-require-workers-paid/
- GLM-4.7-Flash model capabilities: https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/
- OpenAI-compatible endpoint: https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/

## DeepSeek assessment

DeepSeek is an excellent model family, but the **direct DeepSeek API is not a zero-cost solution**. Its official API pricing is token-based and requests are deducted from topped-up or granted balance. The current API models are `deepseek-flash` and `deepseek-v4-pro`; do not rely on older `deepseek-chat` or `deepseek-reasoner` aliases. We can use a DeepSeek-branded model only when a third-party provider (for example, an eligible OpenRouter free route) explicitly lists a free variant and its limits are acceptable. Do not create a direct DeepSeek API key expecting free ongoing API calls.

Official pricing: https://api-docs.deepseek.com/quick_start/pricing/

## Other candidates

- **NVIDIA NIM API Catalog:** NVIDIA documents free developer-program access to NIM API endpoints for prototyping. This is a useful optional test provider, but free access is rate-limited and intended for prototyping, not a dependable production quota. Check the model's current access conditions before wiring it into GiGo: https://build.nvidia.com/explore/discover and https://docs.api.nvidia.com/nim/docs/product
- **Hugging Face Inference Providers:** free accounts receive only $0.10 monthly credits, and requests can become pay-as-you-go after credits are exhausted. This is useful for small experiments, not a meaningful free production provider: https://huggingface.co/docs/inference-providers/pricing
- **SambaNova Cloud:** its published Free plan requires adding a payment method and purchasing credits before first requests; not suitable for this no-card requirement: https://cloud.sambanova.ai/plans
- **Direct DeepSeek API:** paid per-token, not a permanent free API tier: https://api-docs.deepseek.com/quick_start/pricing/

## Revised zero-budget provider pool

Keep the user's existing credentials:
- Google Gemini: 3 keys
- Groq: 3 keys
- OpenRouter: 3 keys
- Zhipu BigModel GLM: 3 keys

Add one **Cloudflare Workers AI** credential (Cloudflare account API token + account ID) and start with `@cf/zai-org/glm-4.7-flash`. This replaces Alibaba Qwen for the moment. The same underlying GLM model family through Cloudflare is a separate inference route with a separate Cloudflare quota; it does not create more quota for the user's existing Zhipu GLM keys.

Do not add more providers just to increase the key count. First test one model from each existing provider and the Cloudflare Workers AI route for plain chat, function calling, usage reporting, 429 behaviour and no-paid-fallback enforcement. Multiple keys under one provider generally share provider/account quota and must not be rotated to evade limits.
