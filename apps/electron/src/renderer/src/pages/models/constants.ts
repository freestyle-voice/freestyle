/** Editorial empty-state suggestions — surfaced when no providers exist. */
export const RECOMMENDED_PROVIDERS = [
  {
    id: "groq",
    name: "Groq · whisper-v3-turbo",
    desc: "Fastest · ~$0.04/hr",
    recommended: true,
  },
  {
    id: "openai",
    name: "OpenAI · gpt-4o-mini",
    desc: "Most accurate · ~$0.18/hr",
  },
  {
    id: "deepgram",
    name: "Deepgram · nova-3",
    desc: "Streaming · ~$0.26/hr",
  },
];

export const DEFAULT_MLX_KEEP_ALIVE_MINUTES = 10;
export const MAX_MLX_KEEP_ALIVE_MINUTES = 10;
export const IS_MAC =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
