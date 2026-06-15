import {
  buildMemoryAuditHuman,
  buildSkillAuditHuman,
  isAuditDue,
  parseAuditVerdicts,
} from "./audit";

describe("isAuditDue", () => {
  const now = Date.parse("2026-06-15T00:00:00.000Z");

  test("is due when never audited", () => {
    expect(isAuditDue(undefined, 7, now)).toBe(true);
    expect(isAuditDue("", 7, now)).toBe(true);
  });

  test("is due when the stamp is unparseable", () => {
    expect(isAuditDue("not-a-date", 7, now)).toBe(true);
  });

  test("is not due when audited within the interval", () => {
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(isAuditDue(twoDaysAgo, 7, now)).toBe(false);
  });

  test("is due when audited longer ago than the interval", () => {
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(isAuditDue(tenDaysAgo, 7, now)).toBe(true);
  });

  test("treats exactly the interval boundary as due", () => {
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isAuditDue(sevenDaysAgo, 7, now)).toBe(true);
  });
});

describe("parseAuditVerdicts", () => {
  test("parses a valid verdict array", () => {
    const json = JSON.stringify([
      { id: "a", action: "keep", reason: "still valid" },
      { id: "b", action: "remove", reason: "duplicate of a" },
    ]);
    const result = parseAuditVerdicts(json);
    expect(result).toEqual([
      { id: "a", action: "keep", reason: "still valid" },
      { id: "b", action: "remove", reason: "duplicate of a" },
    ]);
  });

  test("strips markdown fences", () => {
    const fenced = '```json\n[{"id":"x","action":"remove","reason":"stale"}]\n```';
    expect(parseAuditVerdicts(fenced)).toEqual([{ id: "x", action: "remove", reason: "stale" }]);
  });

  test("strips reasoning <think> blocks", () => {
    const noisy = '<think>let me see</think>[{"id":"x","action":"keep","reason":""}]';
    expect(parseAuditVerdicts(noisy)).toEqual([{ id: "x", action: "keep", reason: "" }]);
  });

  test("defaults unknown actions to keep", () => {
    const json = '[{"id":"x","action":"delete","reason":"r"}]';
    expect(parseAuditVerdicts(json)[0].action).toBe("keep");
  });

  test("drops entries without an id", () => {
    const json = '[{"action":"remove"},{"id":"y","action":"remove","reason":"dup"}]';
    const result = parseAuditVerdicts(json);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("y");
  });

  test("returns empty array on malformed input", () => {
    expect(parseAuditVerdicts("not json")).toEqual([]);
    expect(parseAuditVerdicts("")).toEqual([]);
    expect(parseAuditVerdicts("{not an array}")).toEqual([]);
  });
});

describe("audit human prompt builders", () => {
  test("memory prompt includes every id and text", () => {
    const human = buildMemoryAuditHuman([
      { id: "slug-1", text: "Lives in Zurich", category: "fact", created: "2026-01-01" },
      { id: "slug-2", text: "Prefers TypeScript", category: "preference", created: "2026-02-01" },
    ]);
    expect(human).toContain("slug-1");
    expect(human).toContain("Lives in Zurich");
    expect(human).toContain("slug-2");
    expect(human).toContain("Prefers TypeScript");
    expect(human).toContain("2 memories");
  });

  test("skill prompt includes every id, name, and description", () => {
    const human = buildSkillAuditHuman([
      {
        id: "skill-1",
        name: "Weekly review",
        description: "Summarize the week",
        whenToUse: "On Fridays",
        created: "2026-01-01",
      },
    ]);
    expect(human).toContain("skill-1");
    expect(human).toContain("Weekly review");
    expect(human).toContain("Summarize the week");
    expect(human).toContain("1 skills");
  });
});
