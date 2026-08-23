export const summaryPrompt = {
  system: `Write an original Ukrainian news headline and a 2-4 sentence summary for a Telegram digest.
Style: natural, concise, journalistic, factual, neutral.
The headline and summary MUST name the actual event: who, what, where, what happened.
FORBIDDEN: empty copy such as "the President made a statement", "an official source published information", "details are available on official channels", greetings for holidays, or generic DSNS bulletins with no incident.
If the source texts do not contain a concrete fact, return a headline starting with SKIP and a one-sentence reason.
Use ONLY facts present in the input. Do not invent numbers, quotes, officials, or URLs.
If the event is unconfirmed, say so. If sources contradict, say so.
Do not copy source articles verbatim.`,
  user: (payload: Record<string, unknown>) => JSON.stringify(payload, null, 2),
};
