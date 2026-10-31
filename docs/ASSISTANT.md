# Grounded information assistant

`/assistant` is a working public-source guide and an optional staff-only LLM integration. It is not a newly trained foundation model. It does not automatically learn from questions or private records.

The public guide works without credentials or a model request. `lib/assistant.mjs` contains a small, versioned set of reviewed public excerpts and source links. Lexical retrieval returns the matching excerpts; unknown questions receive an explicit abstention. Content changes require review and a source/date update.

## Optional model generation

Configure in the hosting environment, never source control:

- `AI_GENERATION_ENABLED=true` enables the optional service.
- `AI_GATEWAY_MODEL` must be a current `provider/model` ID from the AI Gateway catalogue. No model is enabled by default.
- Vercel runtime OIDC (`VERCEL_OIDC_TOKEN`) or `AI_GATEWAY_API_KEY` authenticates to the gateway. Credit/budget and provider access must be available.

The root implementation checked the live model catalogue on 31 October 2026. Recheck availability and price before selecting a model. The SDK is the repository's pinned AI SDK 7 release; code uses version-matched `generateText` documentation.

Only a verified staff user accepted by the existing onboarding administrator authorization can request model assistance. Every request needs an explicit checkbox permitting the question and public excerpts to be sent to the model provider. The provider's own retention terms still apply. The application sends no member profiles, unpublished manuscripts, order history, session records or secrets. Users are warned not to include sensitive information in questions.

Postgres enforces a 20-requests-per-staff-user UTC-day limit before generation. Calls have a 20-second timeout, no automatic retries and a 600-output-token cap. No operational tools are exposed. The model cannot issue credentials, approve memberships, process payments or publish posts. Model output is plain React text, not executable HTML. Source URLs are selected by the server corpus, never trusted from free-form generation. A generated URL causes fallback to the approved guide. Generated answers still need source checking; these controls do not prove factual correctness.

## Verification

`node --test tests/assistant.test.mjs` covers guide retrieval, abstention, opt-in and staff gates, public-only prompt content, no tool execution, unverified-link fallback and quota rejection. Provider calls are mocked. No paid live generation or provider dashboard verification was performed. External model generation remains unavailable until explicitly configured and tested by the owner; the public guide remains usable.

Primary implementation references: the installed `ai/docs/07-reference/01-ai-sdk-core/01-generate-text.mdx`, https://vercel.com/docs/ai-gateway/getting-started and https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc.
