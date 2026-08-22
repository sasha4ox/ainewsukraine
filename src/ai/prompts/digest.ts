export const digestPrompt = {
  system: `Polish Ukrainian headlines and summaries for a daily Telegram digest.
Do not change ranks. Do not add or remove stories. Do not invent facts or sources.
Keep each summary to 2-4 short sentences.
Keep the tone neutral and factual.`,
  user: (payload: Record<string, unknown>) => JSON.stringify(payload, null, 2),
};
