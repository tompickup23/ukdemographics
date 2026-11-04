import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * The weekly Refresh data workflow's ingest pattern. On 2 November 2026 the DHSC
 * transform failed, the run went red, and no issue was opened, because only a test
 * failure opened one. These checks keep every ingest on the same footing: secondary
 * (continue-on-error, with a restore step), logged for the issue, listed in the
 * ingest-failed issue step and the final step, and fetching with the neutral user agent.
 */

const ROOT = path.resolve(__dirname, "..");
const WORKFLOW = path.join(ROOT, ".github/workflows/refresh-data.yml");
const text = fs.readFileSync(WORKFLOW, "utf8");
const steps: Array<Record<string, any>> = parse(text).jobs.refresh.steps;

const fetchSteps = steps.filter((s) => typeof s.id === "string" && s.id.endsWith("_fetch"));
const ingests = fetchSteps.map((s) => s.id.replace(/_fetch$/, ""));
const issueStep = steps.find((s) => s.name === "Open, update or close the ingest-failed issue");
const finalStep = steps.at(-1)!;

describe("refresh-data.yml ingests", () => {
  it("has the six keyless ingests", () => {
    expect(ingests).toEqual(["sas", "births", "tb", "ctb", "asc", "send"]);
  });

  for (const id of ingests) {
    describe(id, () => {
      const fetchStep = steps.find((s) => s.id === `${id}_fetch`)!;
      const transform = steps.find((s) => s.id === id)!;
      const fetchVar = `${id.toUpperCase()}_FETCH_OUTCOME`;
      const transformVar = `${id.toUpperCase()}_OUTCOME`;

      it("fetch and transform are secondary and tee a log with pipefail", () => {
        for (const step of [fetchStep, transform]) {
          expect(step["continue-on-error"]).toBe(true);
          expect(step.shell).toBe("bash");
          expect(step.run).toMatch(/2>&1 \| tee "\$RUNNER_TEMP\/[a-z-]+-(fetch|transform)\.log"/);
        }
        expect(transform.if).toBe(`steps.${id}_fetch.outcome == 'success'`);
      });

      it("has a restore step for a failed fetch or transform", () => {
        const restore = steps.find(
          (s) => s.if === `steps.${id}_fetch.outcome == 'failure' || steps.${id}.outcome == 'failure'`
        );
        expect(restore?.run).toMatch(/git checkout -- src\/data\/live\//);
        expect(restore?.run).toMatch(/data\/raw\/manifests\//);
      });

      it("reaches the ingest-failed issue and the final step", () => {
        for (const step of [issueStep, finalStep]) {
          expect(step?.env?.[fetchVar]).toBe(`\${{ steps.${id}_fetch.outcome }}`);
          expect(step?.env?.[transformVar]).toBe(`\${{ steps.${id}.outcome }}`);
        }
        expect(finalStep.run).toContain(`$${fetchVar}`);
        // The issue step quotes the logs under the same name the fetch step writes them.
        const logName = fetchStep.run.match(/\$RUNNER_TEMP\/([a-z-]+)-fetch\.log/)[1];
        expect(transform.run).toContain(`$RUNNER_TEMP/${logName}-transform.log`);
        expect(issueStep?.run).toContain(`check ${logName} "`);
        expect(issueStep?.run).toMatch(new RegExp(`check ${logName} "[^"]+" "\\$${fetchVar}" "\\$${transformVar}"`));
      });

      it("fetches with the repo's neutral user agent", () => {
        const script = fetchStep.run.match(/node (scripts\/fetch\/[\w-]+\.mjs)/)[1];
        const source = fs.readFileSync(path.join(ROOT, script), "utf8");
        expect(source.includes("../lib/retrieval-log.mjs") || source.includes('"ukdemographics-data-fetch"')).toBe(true);
      });
    });
  }

  it("runs the issue step and the final step whatever happened before", () => {
    expect(issueStep?.if).toBe("always()");
    expect(finalStep.if).toBe("always()");
    expect(steps.indexOf(issueStep!)).toBe(steps.length - 2);
  });

  it("closes the ingest issue only when all six ingests passed", () => {
    expect(issueStep?.run).toContain(`[ "$passed" -eq ${ingests.length} ]`);
  });

  it("uses no em dash, en dash or spaced hyphen", () => {
    expect(text).not.toMatch(/[\u2013\u2014]/);
    // A spaced hyphen between words; a YAML list marker has only indentation before it.
    expect(text).not.toMatch(/\S \x2d \S/);
  });
});
