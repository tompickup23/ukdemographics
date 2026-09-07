import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const findings = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/findings" }),
  schema: z.object({
    headline: z.string(),
    date: z.string(),
    // The revision date of the article itself, not of the data snapshot behind it.
    // 86-areas-minority-wbi-2051.md carried this from 13 August 2026 and Astro
    // stripped it silently, because an undeclared key is dropped rather than
    // rejected: the correction notice was in the body and nowhere in the metadata.
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "updated must be an ISO date, YYYY-MM-DD").optional(),
    // Which build of the projection model the figures in this piece were checked
    // against, e.g. "v8.0". Only set it once the numbers have been re-verified.
    model_version: z.string().optional(),
    category: z.enum(["demographics", "projections", "fertility", "schools", "housing", "health", "migration", "validation", "crime", "social-care", "send"]),
    stat_value: z.string(),
    stat_label: z.string(),
    content_type: z.enum(["finding", "article"]).default("finding"),
    verdict: z.enum(["alert", "critical", "resolved", "info"]).default("info"),
    source_url: z.string().url(),
    source_label: z.string().default("Source"),
    summary: z.string(),
    sr_article_id: z.string().optional(),
    sr_published: z.boolean().default(false),
    video_url: z.string().optional(),
    video_poster: z.string().optional()
  })
});

export const collections = { findings };
