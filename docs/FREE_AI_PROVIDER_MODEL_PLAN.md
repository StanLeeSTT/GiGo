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
