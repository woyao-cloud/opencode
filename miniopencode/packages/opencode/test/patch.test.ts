import { describe, expect, it } from "bun:test"
import { parsePatch } from "../src/patch/index"

describe("patch parser", () => {
  it("parses add file hunk", () => {
    const patch = [
      "*** Begin Patch",
      '*** Add File: hello.txt',
      "+Hello, world!",
      "+Second line",
      "*** End Patch",
    ].join("\n")

    const hunks = parsePatch(patch)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toEqual({
      type: "add",
      path: "hello.txt",
      contents: "Hello, world!\nSecond line",
    })
  })

  it("parses delete file hunk", () => {
    const patch = [
      "*** Begin Patch",
      "*** Delete File: old.txt",
      "*** End Patch",
    ].join("\n")

    const hunks = parsePatch(patch)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toEqual({ type: "delete", path: "old.txt" })
  })

  it("parses update file hunk with chunks", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: test.txt",
      "@@",
      "-old line",
      "+new line",
      " unchanged",
      "@@",
      "-another old",
      "+another new",
      "*** End Patch",
    ].join("\n")

    const hunks = parsePatch(patch)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].type).toBe("update")
    if (hunks[0].type === "update") {
      expect(hunks[0].path).toBe("test.txt")
      expect(hunks[0].chunks).toHaveLength(2)
      // Context lines (prefixed with space) appear in both old_lines and new_lines
      expect(hunks[0].chunks[0].old_lines).toEqual(["old line", "unchanged"])
      expect(hunks[0].chunks[0].new_lines).toEqual(["new line", "unchanged"])
      expect(hunks[0].chunks[1].old_lines).toEqual(["another old"])
      expect(hunks[0].chunks[1].new_lines).toEqual(["another new"])
    }
  })

  it("parses multiple hunks", () => {
    const patch = [
      "*** Begin Patch",
      "*** Add File: new.txt",
      "+content",
      "*** Delete File: old.txt",
      "*** End Patch",
    ].join("\n")

    const hunks = parsePatch(patch)
    expect(hunks).toHaveLength(2)
    expect(hunks[0].type).toBe("add")
    expect(hunks[1].type).toBe("delete")
  })

  it("throws on missing markers", () => {
    expect(() => parsePatch("no markers here")).toThrow("Invalid patch format")
  })

  it("parses update with move", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: old/path.ts",
      "*** Move to: new/path.ts",
      "@@",
      "-old code",
      "+new code",
      "*** End Patch",
    ].join("\n")

    const hunks = parsePatch(patch)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].type).toBe("update")
    if (hunks[0].type === "update") {
      expect(hunks[0].path).toBe("old/path.ts")
      expect(hunks[0].move_path).toBe("new/path.ts")
    }
  })

  it("strips heredoc wrapper", () => {
    const patch = [
      "cat <<'EOF'",
      "*** Begin Patch",
      "*** Add File: heredoc.txt",
      "+heredoc content",
      "*** End Patch",
      "EOF",
    ].join("\n")

    const hunks = parsePatch(patch)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].type).toBe("add")
  })
})
