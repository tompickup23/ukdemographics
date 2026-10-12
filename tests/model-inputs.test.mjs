import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readlinkSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { linkInput, loadManifest, selectInputs, verifyInput } from "../scripts/model/lib/inputs.mjs";

/**
 * The model's input manifest (data/model/INPUTS.json) and the link script that
 * reads it. The real inputs are not in CI, so these tests check the manifest's
 * shape and run the link and verify steps against a temporary store, including
 * a planted byte change that must be caught.
 */
describe("model input manifest", () => {
  const manifest = loadManifest("data/model/INPUTS.json");

  it("names every input with a store, a path and a sha256", () => {
    expect(manifest.inputs.length).toBeGreaterThan(10);
    for (const input of manifest.inputs) {
      expect(input.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(input.bytes).toBeGreaterThan(0);
      expect(manifest.stores[input.store]).toBeDefined();
      expect(input.path.startsWith("data/")).toBe(true);
      expect(Array.isArray(input.models)).toBe(true);
    }
  });

  it("covers every file the forward model reads", () => {
    const paths = new Set(manifest.inputs.map((i) => i.path));
    for (const p of [
      "data/model/base_single_year_2021.json",
      "data/raw/census_2011_ethnicity_age/dc2101ew_ethnicity_sex_age_la.csv",
      "data/raw/newethpop/extracted/2DataArchive/OutputData/Population/Population2011_LEEDS2.csv",
      "data/raw/snpp/2022 SNPP Population persons.csv",
    ]) {
      expect(paths.has(p), p).toBe(true);
    }
  });

  it("selects by model tag", () => {
    const v81 = selectInputs(manifest, { model: "v8.1" });
    expect(v81.length).toBeGreaterThan(0);
    expect(v81.every((i) => i.models.includes("v8.1"))).toBe(true);
  });
});

describe("link and verify", () => {
  function fixture() {
    const root = mkdtempSync(path.join(os.tmpdir(), "ukd-inputs-"));
    const store = path.join(root, "store");
    const repo = path.join(root, "repo");
    mkdirSync(path.join(store, "raw/x"), { recursive: true });
    mkdirSync(repo, { recursive: true });
    const bytes = Buffer.from("code,value\nE06000001,1\n");
    writeFileSync(path.join(store, "raw/x/input.csv"), bytes);
    const manifest = {
      stores: { s: { default: store, env: "UKD_TEST_STORE_UNSET" } },
      inputs: [
        {
          id: "x",
          path: "data/raw/x/input.csv",
          store: "s",
          storePath: "raw/x/input.csv",
          sha256: createHash("sha256").update(bytes).digest("hex"),
          bytes: bytes.length,
          models: ["v8.1"],
        },
      ],
    };
    return { root, store, repo, manifest };
  }

  it("links a held file into the checkout and verifies it", async () => {
    const { repo, store, manifest } = fixture();
    const res = linkInput(manifest, manifest.inputs[0], repo, {});
    expect(res.status).toBe("linked");
    const local = path.join(repo, "data/raw/x/input.csv");
    expect(lstatSync(local).isSymbolicLink()).toBe(true);
    expect(readlinkSync(local)).toBe(path.join(store, "raw/x/input.csv"));
    expect((await verifyInput(manifest.inputs[0], repo)).ok).toBe(true);
    expect(linkInput(manifest, manifest.inputs[0], repo, {}).status).toBe("already_linked");
  });

  it("fails when the held bytes change", async () => {
    const { repo, store, manifest } = fixture();
    linkInput(manifest, manifest.inputs[0], repo, {});
    writeFileSync(path.join(store, "raw/x/input.csv"), "code,value\nE06000001,2\n");
    const v = await verifyInput(manifest.inputs[0], repo);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("sha256_mismatch");
  });

  it("never replaces a file already in the checkout", async () => {
    const { repo, manifest } = fixture();
    mkdirSync(path.join(repo, "data/raw/x"), { recursive: true });
    writeFileSync(path.join(repo, "data/raw/x/input.csv"), "something else\n");
    const res = linkInput(manifest, manifest.inputs[0], repo, {});
    expect(res.status).toBe("present");
    expect(lstatSync(path.join(repo, "data/raw/x/input.csv")).isSymbolicLink()).toBe(false);
    expect((await verifyInput(manifest.inputs[0], repo)).reason).toBe("sha256_mismatch");
  });

  it("reports a held copy that is missing", () => {
    const { repo, manifest } = fixture();
    const missing = { ...manifest.inputs[0], storePath: "raw/x/absent.csv" };
    expect(linkInput(manifest, missing, repo, {}).status).toBe("held_missing");
  });

  it("rejects a manifest entry without a hash", () => {
    const { root, manifest } = fixture();
    delete manifest.inputs[0].sha256;
    const file = path.join(root, "bad.json");
    writeFileSync(file, JSON.stringify(manifest));
    expect(() => loadManifest(file)).toThrow(/sha256/);
  });
});
