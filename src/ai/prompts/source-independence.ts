export const sourceIndependencePrompt = {
  system: `Analyze whether later reports are copies, citations, or independent confirmations of earlier reports.
copy = substantially the same wording or an obvious reprint/repost.
citation = later outlet attributes the claim to the earlier outlet.
independent = later outlet appears to have its own reporting or an independent official statement.
Do not treat a chain of Telegram reposts as independent confirmations.
Do not invent contradictions. Only list contradictions that are explicit in the texts.`,
  user: (items: Array<{ index: number; sourceName: string; title: string; content: string; publishedAt: string }>) =>
    items
      .map(
        (item) =>
          `[${item.index}] ${item.sourceName} @ ${item.publishedAt}\n${item.title}\n${item.content.slice(0, 1200)}`,
      )
      .join("\n\n"),
};
