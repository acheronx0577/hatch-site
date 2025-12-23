# AI Provider (Grok / xAI)

This repo is configured to use **Grok (xAI)** only for LLM calls (no Gemini / OpenAI / Anthropic fallbacks).

## Required env

- `AI_DEFAULT_PROVIDER="grok"`
- `AI_MODEL_GROK="grok-4-1-fast-reasoning"` (or your preferred Grok model id)
- `XAI_API_KEY="..."` (create the key named “Hatch AI” in xAI)

## Optional env

- `XAI_BASE_URL="https://api.x.ai/v1"` (only change if xAI gives you a different base URL)
