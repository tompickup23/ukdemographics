import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const findings = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/findings" }),
  schema: z.object({
    headline: z.string(),
    date: z.string(),
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
