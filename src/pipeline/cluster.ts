import { loadEnv } from "../config/env.ts";
import { jaccard, shingles } from "../normalize/text.ts";

export type ClusterItem = {
  id: string;
  title: string;
  content: string;
  publishedAt: Date;
};

export type CandidateCluster = {
  itemIds: string[];
};

export function clusterItems(items: ClusterItem[]): CandidateCluster[] {
  const env = loadEnv();
  const threshold = env.CLUSTER_SIMILARITY_THRESHOLD;
  const windowMs = env.CLUSTER_TIME_WINDOW_HOURS * 60 * 60 * 1000;

  const prepared = items.map((item) => ({
    ...item,
    shingles: shingles(`${item.title} ${item.content}`),
  }));

  const parent = new Map<string, string>();
  for (const item of prepared) parent.set(item.id, item.id);

  function find(id: string): string {
    let current = id;
    while (parent.get(current) !== current) {
      current = parent.get(current) ?? current;
    }
    return current;
  }

  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }

  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const a = prepared[i];
      const b = prepared[j];
      if (Math.abs(a.publishedAt.getTime() - b.publishedAt.getTime()) > windowMs) continue;
      if (jaccard(a.shingles, b.shingles) >= threshold) union(a.id, b.id);
    }
  }

  const groups = new Map<string, string[]>();
  for (const item of prepared) {
    const root = find(item.id);
    const list = groups.get(root) ?? [];
    list.push(item.id);
    groups.set(root, list);
  }

  return [...groups.values()].map((itemIds) => ({ itemIds }));
}

export function pairwiseSimilarity(a: ClusterItem, b: ClusterItem): number {
  return jaccard(shingles(`${a.title} ${a.content}`), shingles(`${b.title} ${b.content}`));
}
