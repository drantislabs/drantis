# Optional Intelligence

Drantis works fully without a model provider. `IntelligenceProvider` is a vendor-neutral interface implemented by adapters for OpenAI, Anthropic, Gemini, Ollama and OpenAI-compatible endpoints.

AI may explain findings, correlate evidence, summarize Assurance Cases, reason about graph relationships, prioritize risks, suggest remediation, suggest regression tests and produce release summaries.

AI may **not** independently establish deterministic evidence, pass a control, mark an Assurance Case VERIFIED or change Release Confidence.

Repository excerpts are surrounded by a system instruction that treats them as untrusted data rather than instructions. Provider output is normalized to references that exist in the current Drantis evidence ledger; invented evidence IDs are discarded.
