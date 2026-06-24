// ── Skill Tool — Load and inject skill instructions ───────────
// Lets the LLM load a skill's SKILL.md content into context,
// enabling specialized workflows for specific tasks.

import { Effect, Schema } from "effect"
import type { Info } from "./tool"
import type { ToolContext } from "./tool"
import { SkillService } from "@/skill/index"
import DESCRIPTION from "./skill.txt"

const Parameters = Schema.Struct({
  name: Schema.String.annotate({ description: "The skill name to load" }),
})

export const SkillTool: Info<typeof Parameters> = {
  id: "skill",
  init: () =>
    Effect.gen(function* () {
      const skill = yield* SkillService

      return {
        description: DESCRIPTION,
        parameters: Parameters,
        execute: (params: Schema.Schema.Type<typeof Parameters>, _ctx: ToolContext) =>
          Effect.gen(function* () {
            const info = yield* skill.get(params.name)
            if (!info) {
              const all = yield* skill.all()
              const available = all.map((i) => i.name).join(", ")
              return {
                title: "Skill not found",
                output: `Skill "${params.name}" not found. Available skills: ${available || "none"}`,
              }
            }

            return {
              title: `Loaded skill: ${info.name}`,
              output: [
                `<skill_content name="${info.name}">`,
                `# Skill: ${info.name}`,
                "",
                info.content.trim(),
                "",
                `Base directory: ${info.location}`,
                "</skill_content>",
              ].join("\n"),
              metadata: { name: info.name, dir: info.location },
            }
          }),
      }
    }),
}
