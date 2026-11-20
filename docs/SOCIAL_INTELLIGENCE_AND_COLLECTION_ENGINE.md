# GiGo Social Intelligence and Collection Engine

## Product objective

Build an Apify-class social discovery and collection system inside GiGo, with the first implementation priority on Instagram, TikTok, YouTube and Facebook, followed by X and LinkedIn. The goal is not simply to download posts. GiGo should turn permitted public and owner-authorized platform data into searchable, traceable market intelligence: customer complaints, recurring questions, content trends, competitor activity, product demand signals and opportunities worth validating.

"Apify-class" describes the intended workflow breadth: reusable actors/connectors, input schemas, scheduled runs, pagination, retries, datasets, exports, monitoring and reusable collection templates. It does not mean GiGo can lawfully or technically access every account, private post, message or platform endpoint.

## Non-negotiable access rules

1. Prefer official platform APIs and documented permissions.
2. Collect public content only where the platform's terms and applicable law permit it, or content from accounts/data sources the owner has explicitly authorized.
3. Never bypass login walls, access controls, private profiles, CAPTCHAs, rate limits, paywalls or anti-bot protections. Do not use stolen cookies, session tokens or credentials.
4. Do not harvest private messages, private groups, personal contact details or sensitive personal data.
5. Respect platform deletion, retention, attribution and display requirements. Store source URL, platform, collection time, access method and relevant permission/consent context with each record.
6. Make connectors fail closed when permissions are missing. Do not silently switch to an unofficial scraper when an API denies access.
7. Use per-platform quotas, concurrency limits, exponential backoff and stop conditions. Never rotate accounts or keys to evade platform limits.
8. Social content is a discovery signal, not proof of market demand. Preserve evidence and label model-generated interpretation as analysis.

## Platform priority and realistic access

### Tier 1: Instagram

Primary use cases: public creator/business account monitoring where permitted, hashtag and media discovery, owner-authorized account insights, Reels/content performance, captions, comments and trend snapshots.

The official Instagram API is oriented around Professional accounts (Business and Creator) and authorized account workflows. Depending on the login/API product and permissions, it can support media, comments, mentions, hashtagged media and basic metadata/metrics for other Business and Creator accounts. It does not provide unrestricted access to ordinary consumer accounts or every public Instagram post. A Facebook Page linkage and approved permissions may be required for a given API path.

Initial implementation: official OAuth connection for the owner's professional account; public hashtag/business discovery only through endpoints actually available to the approved app; optional public URL collection only where allowed by Meta's terms and technical access rules.

### Tier 1: TikTok

Primary use cases: public video discovery, creator/content trend monitoring, captions/metadata and permitted engagement signals.

TikTok's Research API is not a general commercial scraping API. Its published eligibility is restricted to qualified researchers and eligible regions/organizations; commercial users and creators are not eligible for that Research Tools access. The user's location in Nigeria does not currently appear in the published eligible-region list. Other TikTok developer products have narrower scopes and require their own approval.

Initial implementation: use approved TikTok developer products only for their documented purpose; allow user-provided public URLs and permitted metadata workflows where terms allow. Do not design GiGo around the assumption that Research API access will be granted.

### Tier 1: YouTube

Primary use cases: keyword/channel/video search, channel and video metadata, public comments where enabled, playlist discovery and video transcripts only through a permitted source.

The YouTube Data API provides documented public search and metadata endpoints, but it has quota costs. Google's published default quota includes 10,000 units/day for most endpoints and a separate 100 search.list calls/day default allocation (subject to change). GiGo must track quota usage and avoid repeated broad searches. Captions/transcripts have separate access rules; public video visibility does not automatically grant API access to caption text.

Initial implementation: API-key-based public search and metadata, channel tracking, comments where available, and a separate transcript adapter only when the source and usage are permitted.

### Tier 1: Facebook

Primary use cases: public Page monitoring, owner-managed Page content, comments and Page video/Reels data where the specific endpoint permits it.

The Graph API's access to Page-owned content requires Page permissions and tokens. Access to other public Pages generally requires Meta's Page Public Content Access or related approval. A Page feed is not an unrestricted firehose of all Facebook posts, Groups or personal profiles.

Initial implementation: connect owner-managed Pages through OAuth; apply for public Page access if eligible; monitor only approved Pages and endpoints.

### Tier 2: X

Primary use cases: public post search, account monitoring and conversation signals. Access is governed by X API product tiers, rate limits and pricing. GiGo should implement this only after confirming a usable plan and current costs; never assume broad search is free.

### Tier 2: LinkedIn

Primary use cases: owner-authorized organization Page and member workflows within approved scopes. LinkedIn API access is permission- and product-program-based. Its terms explicitly restrict scraping/crawling outside official APIs. GiGo must not build a LinkedIn browser scraper or ingest third-party LinkedIn-scraped datasets.

## Connector architecture

Each platform adapter should implement a common contract:

- `validate_config`: validate user input, OAuth scopes, API keys and allowed target types.
- `estimate_cost`: estimate API quota, request count and expected run size before starting.
- `collect`: fetch a bounded page of results and return a continuation cursor.
- `normalize`: map native records to GiGo's common social record format.
- `checkpoint`: persist cursor, last successful timestamp and deduplication state.
- `health_check`: report connected, permission_missing, quota_exhausted, rate_limited, unsupported or error.
- `delete_or_expire`: apply source deletion and retention requirements where applicable.

A connector must never report success if it returned zero records because permission was denied. Return a clear status and reason instead.

## Normalized social record

Store only the fields available and permitted for that platform:

- platform and native record ID
- content URL and canonical creator/page URL
- content type (post, short video, long video, reel, story if accessible)
- text/caption/title and hashtags
- published timestamp and collected timestamp
- public engagement counters with an observation timestamp
- comment text only when permitted and necessary
- media URL or media reference only when permitted; do not mirror copyrighted media by default
- language and coarse public location only when supplied by the platform and necessary
- connector/access method, permission context and source metadata
- raw-response reference only when retention terms allow it

Do not normalize unavailable fields as if they were known. Preserve missing/null distinctly from zero.

## GiGo intelligence built on collected data

The collection layer feeds these internal analysis capabilities:

1. Demand signals: recurring complaints, questions, workarounds, purchase intent and unmet needs.
2. Trend detection: growth in topic frequency, creators, hashtags, formats and engagement over time.
3. Competitor intelligence: products, positioning, content themes, offers and visible audience response.
4. Content intelligence: hooks, formats and themes associated with above-baseline engagement, without copying protected content.
5. Opportunity scoring: problem frequency, urgency, willingness-to-pay evidence, audience reach, competition, delivery complexity, startup cost and validation speed.
6. Validation planning: a small real-world experiment, success threshold, budget ceiling and evidence required before investing.
7. Alerts: meaningful changes and high-confidence opportunities surfaced in GiGo's Operations Centre. External contact or publication remains approval-gated.

Every opportunity must link back to the source records that support it and distinguish observed facts, platform-provided metrics, model analysis and assumptions.

## Execution and storage

- Use the existing durable job scheduler for bounded collection runs.
- One run should have a strict maximum page count, record count, time budget and API quota budget.
- Persist cursors/checkpoints so interrupted runs resume without duplicating records.
- Deduplicate by platform plus native ID; retain historical metric snapshots separately rather than overwriting trend history.
- Save normalized social items as `research_sources` with `source_type='social'` and platform-specific provenance in `metadata`, or introduce a dedicated social dataset table when query volume justifies it.
- Keep all records owner-scoped. Connector credentials must be encrypted/server-side and never returned to the browser or AI prompts.
- Keep collection and analysis separate: a failed model call must not cause the collector to refetch the same pages.
- Start with small batches because the current scheduler processes at most one AI job per minute. Collection jobs should eventually be separated from AI synthesis so network collection does not consume an AI call for every page.

## Delivery sequence

### Stage 1 — foundation
- Add connector registry and capability/status model.
- Add source provenance, quota and run telemetry.
- Add a Social Sources panel to Research.
- Support manual public URLs and approved owner account connections as distinct access modes.
- Add a connector health/status page; no fake "connected" badges.

### Stage 2 — first integrations
- YouTube public search and channel/video metadata using official API.
- Facebook owner-managed Pages through Graph API OAuth.
- Instagram professional-account connection and only the endpoints approved for the app.
- TikTok developer integration only for approved scopes; keep public URL import available where permitted.

### Stage 3 — repeatable collection
- Reusable collection templates for keywords, hashtags, accounts, channels and competitor watchlists.
- Cursor-based pagination, deduplication, retry/backoff and bounded scheduled jobs.
- Comments and transcripts only when explicitly supported and permitted.

### Stage 4 — intelligence
- Cross-platform topic clustering and trend baselines.
- Complaint/question extraction with source links.
- Competitor comparison and offer tracking.
- Opportunity scoring and test plans.
- Executive alerts and daily/weekly briefs.

### Stage 5 — X and LinkedIn
- Integrate only through approved APIs and permissions after reviewing current access costs and terms.
- LinkedIn remains API-only; no scraping outside official APIs.

## Current implementation status

This document is the approved engineering direction, not a claim that social-media connectors are already implemented. GiGo currently has Crossref/OpenAlex scholarly metadata discovery and GDELT news article metadata discovery in scheduled research scans. It does not yet have working Instagram, TikTok, YouTube, Facebook, X or LinkedIn collection connectors. The next code milestone is the connector registry and run/provenance model, followed by the first official API integrations.
