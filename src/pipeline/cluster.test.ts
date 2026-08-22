import assert from "node:assert/strict";
import { test } from "node:test";
import { clusterItems } from "./cluster.ts";

test("groups near-duplicate reports and keeps unrelated items apart", () => {
  process.env.DATABASE_URL = "postgresql://localhost:5432/news";
  const now = new Date();
  const clusters = clusterItems([
    {
      id: "a",
      title: "Explosions reported in Kyiv",
      content: "Explosions were heard in Kyiv overnight",
      publishedAt: now,
    },
    {
      id: "b",
      title: "Explosions heard in Kyiv",
      content: "Explosions reported in Kyiv overnight",
      publishedAt: now,
    },
    {
      id: "c",
      title: "Stock markets rise in Tokyo",
      content: "Nikkei closed higher after bank data",
      publishedAt: now,
    },
  ]);
  const grouped = clusters.map((cluster) => cluster.itemIds.sort().join(","));
  assert.ok(grouped.some((group) => group.includes("a") && group.includes("b")));
  assert.ok(grouped.some((group) => group === "c"));
});
