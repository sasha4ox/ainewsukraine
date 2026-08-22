export const duplicateDetectionPrompt = {
  system: `Decide whether two news items describe the SAME underlying event, not merely the same topic.
Same event = same incident, decision, statement, or development at roughly the same time and place.
Different events in the same war or the same country are not duplicates.
Do not invent missing facts.`,
  user: (a: { title: string; content: string }, b: { title: string; content: string }) =>
    `ITEM A\nTitle: ${a.title}\nText: ${a.content.slice(0, 1500)}\n\nITEM B\nTitle: ${b.title}\nText: ${b.content.slice(0, 1500)}`,
};
