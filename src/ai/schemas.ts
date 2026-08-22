import { z } from "zod";

export const categorySlugSchema = z.enum([
  "ukraine",
  "war",
  "politics",
  "economy",
  "international",
  "technology",
  "society",
  "business",
  "science",
  "culture",
  "sports",
  "other",
]);

export const classificationSchema = z.object({
  category: categorySlugSchema,
  language: z.string(),
  location: z.string().nullable(),
  is_anonymous_source: z.boolean(),
  is_clickbait: z.boolean(),
});

export const duplicateDetectionSchema = z.object({
  is_same_event: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

export const groupedEventSchema = z.object({
  title: z.string(),
  summary: z.string(),
  category: categorySlugSchema,
  location: z.string().nullable(),
  event_time: z.string(),
  item_indexes: z.array(z.number().int().min(0)),
});

export const eventGroupingSchema = z.object({
  events: z.array(groupedEventSchema).min(1),
});

export const independencePairSchema = z.object({
  later_index: z.number().int().min(0),
  earlier_index: z.number().int().min(0),
  type: z.enum(["copy", "citation", "independent"]),
  reason: z.string(),
});

export const independenceSchema = z.object({
  pairs: z.array(independencePairSchema),
  anonymous_claim: z.boolean(),
  contradictions: z.array(z.string()),
});

export const credibilitySchema = z.object({
  adjustment: z.number().int().min(-10).max(10),
  status: z.enum(["confirmed", "mostly_confirmed", "unconfirmed", "contradicted"]),
  reason: z.string(),
  independent_sources: z.array(z.string()),
  has_official_confirmation: z.boolean(),
  has_contradictions: z.boolean(),
});

export const importanceSchema = z.object({
  score: z.number().int().min(0).max(100),
  reason: z.string(),
  people_affected: z.enum(["unknown", "local", "regional", "national", "international"]),
  urgency: z.enum(["low", "medium", "high"]),
});

export const summarySchema = z.object({
  headline: z.string(),
  summary: z.string(),
});

export const digestItemSchema = z.object({
  rank: z.number().int(),
  headline: z.string(),
  summary: z.string(),
});

export const digestSchema = z.object({
  title: z.string(),
  items: z.array(digestItemSchema),
  footer: z.string(),
});

export type Classification = z.infer<typeof classificationSchema>;
export type EventGrouping = z.infer<typeof eventGroupingSchema>;
export type Independence = z.infer<typeof independenceSchema>;
export type CredibilityAi = z.infer<typeof credibilitySchema>;
export type ImportanceAi = z.infer<typeof importanceSchema>;
export type SummaryAi = z.infer<typeof summarySchema>;
export type DigestAi = z.infer<typeof digestSchema>;

export const jsonSchemas = {
  classification: {
    name: "classification",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["category", "language", "location", "is_anonymous_source", "is_clickbait"],
      properties: {
        category: { type: "string", enum: categorySlugSchema.options },
        language: { type: "string" },
        location: { type: ["string", "null"] },
        is_anonymous_source: { type: "boolean" },
        is_clickbait: { type: "boolean" },
      },
    },
  },
  duplicate_detection: {
    name: "duplicate_detection",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["is_same_event", "confidence", "reason"],
      properties: {
        is_same_event: { type: "boolean" },
        confidence: { type: "number" },
        reason: { type: "string" },
      },
    },
  },
  event_grouping: {
    name: "event_grouping",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["events"],
      properties: {
        events: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "summary", "category", "location", "event_time", "item_indexes"],
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              category: { type: "string", enum: categorySlugSchema.options },
              location: { type: ["string", "null"] },
              event_time: { type: "string" },
              item_indexes: { type: "array", items: { type: "integer" } },
            },
          },
        },
      },
    },
  },
  source_independence: {
    name: "source_independence",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["pairs", "anonymous_claim", "contradictions"],
      properties: {
        pairs: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["later_index", "earlier_index", "type", "reason"],
            properties: {
              later_index: { type: "integer" },
              earlier_index: { type: "integer" },
              type: { type: "string", enum: ["copy", "citation", "independent"] },
              reason: { type: "string" },
            },
          },
        },
        anonymous_claim: { type: "boolean" },
        contradictions: { type: "array", items: { type: "string" } },
      },
    },
  },
  credibility: {
    name: "credibility",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "adjustment",
        "status",
        "reason",
        "independent_sources",
        "has_official_confirmation",
        "has_contradictions",
      ],
      properties: {
        adjustment: { type: "integer" },
        status: { type: "string", enum: ["confirmed", "mostly_confirmed", "unconfirmed", "contradicted"] },
        reason: { type: "string" },
        independent_sources: { type: "array", items: { type: "string" } },
        has_official_confirmation: { type: "boolean" },
        has_contradictions: { type: "boolean" },
      },
    },
  },
  importance: {
    name: "importance",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["score", "reason", "people_affected", "urgency"],
      properties: {
        score: { type: "integer" },
        reason: { type: "string" },
        people_affected: { type: "string", enum: ["unknown", "local", "regional", "national", "international"] },
        urgency: { type: "string", enum: ["low", "medium", "high"] },
      },
    },
  },
  summary: {
    name: "summary",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["headline", "summary"],
      properties: {
        headline: { type: "string" },
        summary: { type: "string" },
      },
    },
  },
  digest: {
    name: "digest",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "items", "footer"],
      properties: {
        title: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["rank", "headline", "summary"],
            properties: {
              rank: { type: "integer" },
              headline: { type: "string" },
              summary: { type: "string" },
            },
          },
        },
        footer: { type: "string" },
      },
    },
  },
} as const;
