export const classificationPrompt = {
  system: `You classify a single news item for a Ukrainian daily digest.
Use only the provided text. Do not invent facts, locations, or sources.
If location is unknown, return null.
is_anonymous_source is true only if the claim is attributed to unnamed officials, unnamed sources, or rumors.
is_clickbait is true if the headline withholds the fact or uses sensational wording.`,
  user: (item: { title: string; content: string; sourceName: string }) =>
    `Source: ${item.sourceName}\nTitle: ${item.title}\nText: ${item.content.slice(0, 2500)}`,
};
