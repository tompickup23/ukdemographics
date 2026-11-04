import type { APIRoute } from "astro";
import { csvResponse, toCsv } from "../../lib/place-downloads";
import { NOT_STATED, allSeries } from "../../lib/section-dates";

export const prerender = true;

// The register behind each place-page section's "last updated" and "next
// update likely" line (src/data/lookups/release-calendar.json), with the page
// each date was read from and when.
const COLUMNS = [
  "series_id", "series", "publisher", "last_updated", "last_updated_note", "edition_read_from", "source_url",
  "next_update", "next_status", "next_url", "next_quote", "next_accessed"
];

export const GET: APIRoute = () =>
  csvResponse(
    toCsv(
      COLUMNS,
      allSeries().map((s) => ({
        series_id: s.id,
        series: s.label,
        publisher: s.publisher,
        last_updated: s.lastUpdated,
        last_updated_note: s.lastUpdatedNote ?? "",
        edition_read_from: s.editionFrom,
        source_url: s.sourceUrl,
        next_update: s.next?.stated ?? NOT_STATED,
        next_status: s.next?.status ?? "not stated",
        next_url: s.next?.url ?? s.nextChecked?.url ?? "",
        next_quote: s.next?.quote ?? s.nextChecked?.note ?? "",
        next_accessed: s.next?.accessed ?? s.nextChecked?.accessed ?? ""
      }))
    )
  );
