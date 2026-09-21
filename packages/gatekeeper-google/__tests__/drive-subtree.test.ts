import { describe, it, expect } from "vitest";
import { isFileInSubtree } from "../src/drive-subtree";

/** Build a getParents mock from a simple adjacency map. */
function makeGetParents(tree: Record<string, string[]>) {
  return async (id: string) => tree[id] ?? [];
}

describe("isFileInSubtree", () => {
  // ── Positive cases ────────────────────────────────────────────────────────

  it("returns true when bound folder is the direct parent", async () => {
    expect(await isFileInSubtree(["bound"], "bound", makeGetParents({}))).toBe(true);
  });

  it("returns true when bound folder is a grandparent", async () => {
    const tree = { parent: ["bound"] };
    expect(await isFileInSubtree(["parent"], "bound", makeGetParents(tree))).toBe(true);
  });

  it("returns true when bound folder is three levels up", async () => {
    const tree = { a: ["b"], b: ["c"], c: ["bound"] };
    expect(await isFileInSubtree(["a"], "bound", makeGetParents(tree))).toBe(true);
  });

  it("returns true when file has multiple parents and one is the bound folder", async () => {
    // Drive supports multi-parent (legacy) — any match is sufficient.
    expect(
      await isFileInSubtree(["otherFolder", "bound"], "bound", makeGetParents({})),
    ).toBe(true);
  });

  // ── root-bound cases ──────────────────────────────────────────────────────

  it("returns true for root-bound when file is a direct child of root", async () => {
    expect(await isFileInSubtree(["root"], "root", makeGetParents({}))).toBe(true);
  });

  it("returns true for root-bound when ancestry eventually reaches root", async () => {
    const tree = { child: ["parent"], parent: ["root"] };
    expect(await isFileInSubtree(["child"], "root", makeGetParents(tree))).toBe(true);
  });

  // ── Negative cases ────────────────────────────────────────────────────────

  it("returns false when file is not within the subtree", async () => {
    const tree = { other: ["otherRoot"] };
    expect(await isFileInSubtree(["other"], "bound", makeGetParents(tree))).toBe(false);
  });

  it("returns false for empty fileParents", async () => {
    expect(await isFileInSubtree([], "bound", makeGetParents({}))).toBe(false);
  });

  it("returns false when ancestry ends without reaching bound folder", async () => {
    const tree = { child: ["parent"] };  // parent has no parents → hits "root" guard
    expect(await isFileInSubtree(["child"], "bound", makeGetParents(tree))).toBe(false);
  });

  // ── maxDepth ──────────────────────────────────────────────────────────────

  it("stops at maxDepth — does not find bound folder 4 hops away when limit is 3", async () => {
    // file → l1 → l2 → l3 → l4 → bound  (4 hops from l1)
    const tree = { l1: ["l2"], l2: ["l3"], l3: ["l4"], l4: ["bound"] };
    expect(await isFileInSubtree(["l1"], "bound", makeGetParents(tree), 3)).toBe(false);
  });

  it("finds bound folder 4 hops away when maxDepth is 5", async () => {
    const tree = { l1: ["l2"], l2: ["l3"], l3: ["l4"], l4: ["bound"] };
    expect(await isFileInSubtree(["l1"], "bound", makeGetParents(tree), 5)).toBe(true);
  });

  // ── Safety ────────────────────────────────────────────────────────────────

  it("avoids infinite loops via visited set (cycle in parent graph)", async () => {
    const tree: Record<string, string[]> = { a: ["b"], b: ["a"] };
    expect(await isFileInSubtree(["a"], "never", makeGetParents(tree))).toBe(false);
  });

  it("skips inaccessible folders and continues checking other branches", async () => {
    let failCount = 0;
    const getParents = async (id: string): Promise<string[]> => {
      if (id === "blocked") { failCount++; throw new Error("403"); }
      if (id === "reachable") return ["bound"];
      return [];
    };
    // File has two parents: blocked (throws) and reachable (leads to bound).
    expect(await isFileInSubtree(["blocked", "reachable"], "bound", getParents)).toBe(true);
    expect(failCount).toBe(1);
  });

  it("skips inaccessible folders — returns false if no path to bound exists", async () => {
    const getParents = async (id: string): Promise<string[]> => {
      if (id === "inaccessible") throw new Error("403");
      return (({ parent: ["inaccessible"] } as Record<string, string[]>)[id]) ?? [];
    };
    expect(await isFileInSubtree(["parent"], "bound", getParents)).toBe(false);
  });
});
