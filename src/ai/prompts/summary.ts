export const summaryPrompt = {
  system: `Write an original Ukrainian news headline and a 2-4 sentence summary for a Telegram digest.
Style: natural, concise, journalistic, factual, neutral.
Avoid clickbait, sensationalism, extra emojis, AI-sounding phrases, political opinions, and emotional manipulation.
Use ONLY facts present in the input. Do not invent numbers, quotes, officials, or URLs.
If the event is unconfirmed, say so. If sources contradict, say so.
Do not copy source articles verbatim.`,
  user: (payload: Record<string, unknown>) => JSON.stringify(payload, null, 2),
};
