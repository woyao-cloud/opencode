// ── Patch Service ──────────────────────────────────────────
// Parse and apply structured patches for file add/delete/update.

import { Effect, Context, Layer } from "effect"
import * as fs from "node:fs"
import * as path from "node:path"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "patch" })

// ── Types ─────────────────────────────────────────────────

export type Hunk =
  | { type: "add"; path: string; contents: string }
  | { type: "delete"; path: string }
  | { type: "update"; path: string; move_path?: string; chunks: UpdateFileChunk[] }

export interface UpdateFileChunk {
  old_lines: string[]
  new_lines: string[]
  change_context?: string
  is_end_of_file?: boolean
}

export interface AffectedPaths {
  added: string[]
  modified: string[]
  deleted: string[]
}

// ── Service Shape ─────────────────────────────────────────

export interface PatchShape {
  readonly parse: (patchText: string) => Hunk[]
  readonly apply: (hunks: Hunk[], cwd: string) => Effect.Effect<AffectedPaths, Error>
  readonly applyPatch: (patchText: string, cwd: string) => Effect.Effect<AffectedPaths, Error>
}

export class PatchService extends Context.Service<PatchService, PatchShape>()("@miniopencode/Patch") {}

// ── Parser ────────────────────────────────────────────────

const BEGIN_MARKER = "*** Begin Patch"
const END_MARKER = "*** End Patch"

function stripHeredoc(input: string): string {
  const heredocMatch = input.match(/^(?:cat\s+)?<<['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\1\s*$/)
  if (heredocMatch) return heredocMatch[2]
  return input
}

function parsePatchHeader(lines: string[], startIdx: number): { filePath: string; movePath?: string; nextIdx: number } | null {
  const line = lines[startIdx]

  if (line.startsWith("*** Add File:")) {
    const filePath = line.slice("*** Add File:".length).trim()
    return filePath ? { filePath, nextIdx: startIdx + 1 } : null
  }

  if (line.startsWith("*** Delete File:")) {
    const filePath = line.slice("*** Delete File:".length).trim()
    return filePath ? { filePath, nextIdx: startIdx + 1 } : null
  }

  if (line.startsWith("*** Update File:")) {
    const filePath = line.slice("*** Update File:".length).trim()
    let movePath: string | undefined
    let nextIdx = startIdx + 1
    if (nextIdx < lines.length && lines[nextIdx].startsWith("*** Move to:")) {
      movePath = lines[nextIdx].slice("*** Move to:".length).trim()
      nextIdx++
    }
    return filePath ? { filePath, movePath, nextIdx } : null
  }

  return null
}

function parseUpdateFileChunks(lines: string[], startIdx: number): { chunks: UpdateFileChunk[]; nextIdx: number } {
  const chunks: UpdateFileChunk[] = []
  let i = startIdx

  while (i < lines.length && !lines[i].startsWith("***")) {
    if (lines[i].startsWith("@@")) {
      const contextLine = lines[i].substring(2).trim()
      i++
      const oldLines: string[] = []
      const newLines: string[] = []
      let isEndOfFile = false

      while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("***")) {
        const changeLine = lines[i]
        if (changeLine === "*** End of File") {
          isEndOfFile = true
          i++
          break
        }
        if (changeLine.startsWith(" ")) {
          const content = changeLine.substring(1)
          oldLines.push(content)
          newLines.push(content)
        } else if (changeLine.startsWith("-")) {
          oldLines.push(changeLine.substring(1))
        } else if (changeLine.startsWith("+")) {
          newLines.push(changeLine.substring(1))
        }
        i++
      }

      chunks.push({ old_lines: oldLines, new_lines: newLines, change_context: contextLine || undefined, is_end_of_file: isEndOfFile || undefined })
    } else {
      i++
    }
  }

  return { chunks, nextIdx: i }
}

function parseAddFileContent(lines: string[], startIdx: number): { content: string; nextIdx: number } {
  let content = ""
  let i = startIdx
  while (i < lines.length && !lines[i].startsWith("***")) {
    if (lines[i].startsWith("+")) {
      content += lines[i].substring(1) + "\n"
    }
    i++
  }
  if (content.endsWith("\n")) content = content.slice(0, -1)
  return { content, nextIdx: i }
}

export function parsePatch(patchText: string): Hunk[] {
  const cleaned = stripHeredoc(patchText.trim())
  const lines = cleaned.split("\n")
  const hunks: Hunk[] = []
  let i = 0

  const beginIdx = lines.findIndex((line) => line.trim() === BEGIN_MARKER)
  const endIdx = lines.findIndex((line) => line.trim() === END_MARKER)

  if (beginIdx === -1 || endIdx === -1 || beginIdx >= endIdx) {
    throw new Error("Invalid patch format: missing *** Begin Patch / *** End Patch markers")
  }

  i = beginIdx + 1
  while (i < endIdx) {
    const header = parsePatchHeader(lines, i)
    if (!header) { i++; continue }

    if (lines[i].startsWith("*** Add File:")) {
      const { content: fileContent, nextIdx } = parseAddFileContent(lines, header.nextIdx)
      hunks.push({ type: "add", path: header.filePath, contents: fileContent })
      i = nextIdx
    } else if (lines[i].startsWith("*** Delete File:")) {
      hunks.push({ type: "delete", path: header.filePath })
      i = header.nextIdx
    } else if (lines[i].startsWith("*** Update File:")) {
      const { chunks, nextIdx } = parseUpdateFileChunks(lines, header.nextIdx)
      hunks.push({ type: "update", path: header.filePath, move_path: header.movePath, chunks })
      i = nextIdx
    } else i++
  }

  return hunks
}

// ── Application ───────────────────────────────────────────

function seekSequence(lines: string[], pattern: string[], startIndex: number, eof = false): number {
  if (pattern.length === 0) return -1
  const comparators: Array<(a: string, b: string) => boolean> = [
    (a, b) => a === b,
    (a, b) => a.replace(/\s+$/, "") === b.replace(/\s+$/, ""),
    (a, b) => a.trim() === b.trim(),
  ]
  if (eof) {
    const fromEnd = lines.length - pattern.length
    if (fromEnd >= startIndex) {
      for (const cmp of comparators) {
        let match = true
        for (let j = 0; j < pattern.length; j++) {
          if (!cmp(lines[fromEnd + j], pattern[j])) { match = false; break }
        }
        if (match) return fromEnd
      }
    }
  }
  for (const cmp of comparators) {
    for (let i = startIndex; i <= lines.length - pattern.length; i++) {
      let match = true
      for (let j = 0; j < pattern.length; j++) {
        if (!cmp(lines[i + j], pattern[j])) { match = false; break }
      }
      if (match) return i
    }
  }
  return -1
}

function computeReplacements(
  originalLines: string[],
  filePath: string,
  chunks: UpdateFileChunk[],
): Array<[number, number, string[]]> {
  const replacements: Array<[number, number, string[]]> = []
  let lineIndex = 0

  for (const chunk of chunks) {
    if (chunk.change_context) {
      const contextIdx = seekSequence(originalLines, [chunk.change_context], lineIndex)
      if (contextIdx === -1) throw new Error(`Failed to find context '${chunk.change_context}' in ${filePath}`)
      lineIndex = contextIdx + 1
    }
    if (chunk.old_lines.length === 0) {
      const insertionIdx = originalLines.length > 0 && originalLines[originalLines.length - 1] === ""
        ? originalLines.length - 1 : originalLines.length
      replacements.push([insertionIdx, 0, chunk.new_lines])
      continue
    }
    let pattern = chunk.old_lines
    let newSlice = chunk.new_lines
    let found = seekSequence(originalLines, pattern, lineIndex, chunk.is_end_of_file)
    if (found === -1 && pattern.length > 0 && pattern[pattern.length - 1] === "") {
      pattern = pattern.slice(0, -1)
      if (newSlice.length > 0 && newSlice[newSlice.length - 1] === "") newSlice = newSlice.slice(0, -1)
      found = seekSequence(originalLines, pattern, lineIndex, chunk.is_end_of_file)
    }
    if (found !== -1) {
      replacements.push([found, pattern.length, newSlice])
      lineIndex = found + pattern.length
    } else {
      throw new Error(`Failed to find expected lines in ${filePath}:\n${chunk.old_lines.join("\n")}`)
    }
  }
  replacements.sort((a, b) => a[0] - b[0])
  return replacements
}

function deriveNewContents(filePath: string, chunks: UpdateFileChunk[], originalText: string): string {
  let originalLines = originalText.split("\n")
  if (originalLines.length > 0 && originalLines[originalLines.length - 1] === "") originalLines.pop()

  const replacements = computeReplacements(originalLines, filePath, chunks)
  let newLines = [...originalLines]
  for (let i = replacements.length - 1; i >= 0; i--) {
    const [startIdx, oldLen, newSegment] = replacements[i]
    newLines.splice(startIdx, oldLen)
    for (let j = 0; j < newSegment.length; j++) newLines.splice(startIdx + j, 0, newSegment[j])
  }
  if (newLines.length === 0 || newLines[newLines.length - 1] !== "") newLines.push("")
  return newLines.join("\n")
}

// ── Factory ───────────────────────────────────────────────

export const makePatchService = (): PatchShape => ({
  parse: parsePatch,

  apply: (hunks, cwd): Effect.Effect<AffectedPaths, Error> =>
    Effect.try({
      try: () => {
        const added: string[] = []
        const modified: string[] = []
        const deleted: string[] = []

        for (const hunk of hunks) {
          const resolvedPath = path.resolve(cwd, hunk.type === "update" && hunk.move_path ? hunk.move_path : hunk.path)

          switch (hunk.type) {
            case "add": {
              const dir = path.dirname(resolvedPath)
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
              fs.writeFileSync(resolvedPath, hunk.contents, "utf-8")
              added.push(hunk.path)
              log.info(`Added: ${hunk.path}`)
              break
            }
            case "delete": {
              if (fs.existsSync(resolvedPath)) fs.unlinkSync(resolvedPath)
              deleted.push(hunk.path)
              log.info(`Deleted: ${hunk.path}`)
              break
            }
            case "update": {
              if (!fs.existsSync(resolvedPath)) throw new Error(`File not found for update: ${hunk.path}`)
              const originalText = fs.readFileSync(resolvedPath, "utf-8")
              const newContent = deriveNewContents(hunk.path, hunk.chunks, originalText)
              if (hunk.move_path) {
                const moveResolved = path.resolve(cwd, hunk.move_path)
                const dir = path.dirname(moveResolved)
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
                fs.writeFileSync(moveResolved, newContent, "utf-8")
                fs.unlinkSync(resolvedPath)
                modified.push(hunk.move_path)
              } else {
                fs.writeFileSync(resolvedPath, newContent, "utf-8")
                modified.push(hunk.path)
              }
              log.info(`Updated: ${hunk.path}`)
              break
            }
          }
        }

        return { added, modified, deleted } satisfies AffectedPaths
      },
      catch: (err) => new Error(`Patch application failed: ${err}`),
    }),

  applyPatch: (patchText, cwd) =>
    Effect.try({
      try: () => parsePatch(patchText),
      catch: (err) => new Error(`Patch parse failed: ${err}`),
    }).pipe(Effect.flatMap((hunks) => makePatchService().apply(hunks, cwd))),
})

// ── Layer ─────────────────────────────────────────────────

export const PatchLive = Layer.succeed(PatchService, makePatchService())

export * as Patch from "."
