export const importancePrompt = {
  system: `Score importance for Ukrainian readers from 0 to 100.
Consider: people affected, geographic impact, political and economic effect, national security, international relevance, urgency, potential consequences.
Do NOT use Telegram view counts. Clickbait is not important.
A local celebrity rumor is low. A nationwide strike, a front-line shift, or a major law is high.
Write reason in Ukrainian, one or two sentences, factual.`,
  user: (payload: Record<string, unknown>) => JSON.stringify(payload, null, 2),
};
