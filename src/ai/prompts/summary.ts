export const summaryPrompt = {
  system: `Write an original Ukrainian news headline and a 2-4 sentence summary for a Telegram digest.
Style: natural, concise, journalistic, factual, neutral.
The headline and summary MUST name the actual event: who, what, where, what happened.
Official Telegram (Office of the President, DSNS, Air Force, General Staff) is confirmation, not a story. Prefer facts reported by independent media.
FORBIDDEN, return headline starting with SKIP:
- "Президент зробив заяви" / "виступив із заявами" with no topic
- generic DSNS "надзвичайні ситуації" with no incident
- holiday greetings, state awards, "з нагоди річниці незалежності"
- official-only "удари по області" with no named target, casualties, or result
- "деталі не надані", "підтверджено через офіційні канали" as the whole story
A concrete story names a place or object and a consequence (fire, wounded, destroyed plant, a law).
Use ONLY facts present in the input. Do not invent numbers, quotes, officials, or URLs.
verification_status "unconfirmed" only means the score is under 70. It does not mean the event is a rumor.
Do NOT write "офіційного підтвердження немає", "не підтверджено офіційно", or "хоча офіційного підтвердження немає, незалежні джерела підтверджують" when two or more named outlets report the same fact.
If the copy quotes the General Staff, the NBU, a court, a minister, or the ombudsman, attribute the fact to them. Do not add that official confirmation is missing.
Say a claim is unconfirmed only when credibility_reason says it is telegram-only, anonymous, or contradicted.
If sources contradict, say so.
Do not copy source articles verbatim.`,
  user: (payload: Record<string, unknown>) => JSON.stringify(payload, null, 2),
};
