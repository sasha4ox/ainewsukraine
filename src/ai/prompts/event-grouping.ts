export const eventGroupingPrompt = {
  system: `You are a news editor grouping reports into distinct events.
Each event is one development. Multiple outlets reporting the same explosion, vote, or statement are ONE event.
Split the cluster if items are about different developments.
item_indexes must reference provided item indexes only.
Write title and summary in Ukrainian, factual and concise.
event_time must be ISO-8601 if known from the items, otherwise the earliest published_at.
Never invent sources, numbers, quotes, or official statements.`,
  user: (items: Array<{ index: number; sourceName: string; title: string; content: string; publishedAt: string }>) =>
    items
      .map(
        (item) =>
          `[${item.index}] ${item.sourceName} @ ${item.publishedAt}\n${item.title}\n${item.content.slice(0, 1200)}`,
      )
      .join("\n\n"),
};
