// ── Skill Service — Load and list agent skills ────────────────
// Skills are stored as SKILL.md files in skill directories.
// Project skills live under .opencode/skills/, user skills under
// ~/.config/opencode/skills/ or ~/.agents/skills/.

import { Effect, Context, Layer } from "effect"
import * as Path from "path"
import * as fs from "fs"
import * as Log from "@miniopencode/core/util/log"

const log = Log.create({ service: "skill" })

// ── Types ───────────────────────────────────────────────────

export interface SkillInfo {
  readonly name: string
  readonly description: string
  readonly location: string  // directory containing SKILL.md
  readonly content: string   // SKILL.md content
}

export interface SkillShape {
  readonly get: (name: string) => Effect.Effect<SkillInfo | undefined>
  readonly all: () => Effect.Effect<ReadonlyArray<SkillInfo>>
  readonly dirs: () => Effect.Effect<ReadonlyArray<string>>
}

// ── Service ─────────────────────────────────────────────────

export class SkillService extends Context.Service<SkillService, SkillShape>()("@miniopencode/Skill") {}

// ── Discovery ────────────────────────────────────────────────

function findSkillDirs(): string[] {
  const dirs: string[] = []

  // Project skills
  const projectSkillDir = Path.join(process.cwd(), ".opencode", "skills")
  if (fs.existsSync(projectSkillDir)) dirs.push(projectSkillDir)

  // User OMC skills
  const home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? ""
  if (home) {
    const userConfigDirs = [
      Path.join(home, ".config", "opencode", "skills"),
      Path.join(home, ".agents", "skills"),
      Path.join(home, ".claude", "skills"),
    ]
    for (const d of userConfigDirs) {
      if (fs.existsSync(d)) dirs.push(d)
    }
  }

  // OMC cache skills
  const cacheDir = process.env["XDG_CACHE_HOME"] ?? Path.join(home, ".cache")
  const cacheSkillDir = Path.join(cacheDir, "opencode", "skills")
  if (fs.existsSync(cacheSkillDir)) dirs.push(cacheSkillDir)

  return dirs
}

function scanSkills(baseDirs: string[]): SkillInfo[] {
  const skills: SkillInfo[] = []
  const seen = new Set<string>()

  for (const dir of baseDirs) {
    if (!fs.existsSync(dir)) continue
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillDir = Path.join(dir, entry.name)
      const skillFile = Path.join(skillDir, "SKILL.md")
      if (!fs.existsSync(skillFile)) continue

      if (seen.has(entry.name)) continue
      seen.add(entry.name)

      try {
        const content = fs.readFileSync(skillFile, "utf-8")
        // Extract description from first line after # Title
        const lines = content.split("\n")
        let description = ""
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i]!.trim()
          if (line && !line.startsWith("#")) {
            description = line
            break
          }
        }

        skills.push({
          name: entry.name,
          description,
          location: skillDir,
          content,
        })
      } catch {
        // Skip unreadable skills
      }
    }
  }

  return skills
}

// ── Factory ─────────────────────────────────────────────────

export function makeSkillService(): Effect.Effect<SkillShape> {
  return Effect.sync(() => {
    const baseDirs = findSkillDirs()

    function getAll(): SkillInfo[] {
      return scanSkills(baseDirs)
    }

    return SkillService.of({
      get: (name: string) =>
        Effect.sync(() => {
          return getAll().find((s) => s.name === name)
        }),
      all: () =>
        Effect.sync(() => getAll()),
      dirs: () =>
        Effect.sync(() => baseDirs.filter((d) => fs.existsSync(d))),
    })
  })
}

export const SkillLive = Layer.effect(SkillService, makeSkillService())

export * as Skill from "."
