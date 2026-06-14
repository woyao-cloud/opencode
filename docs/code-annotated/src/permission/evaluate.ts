/**
 * permission/evaluate - 权限规则评估引擎：基于通配符匹配的权限规则评估
 *
 * 功能概述：
 * - 对权限请求进行多规则集评估
 * - 支持通配符匹配（权限名和模式）
 * - 最后匹配规则优先，默认返回 "ask"
 *
 * 核心导出：
 * - evaluate：评估权限请求并返回匹配规则
 *
 * 架构位置：权限模块核心引擎，被 permission/index.ts 服务层调用。
 * 上游依赖：util/wildcard（通配符匹配）
 */
import { Wildcard } from "@/util/wildcard"

type Rule = {
  permission: string
  pattern: string
  action: "allow" | "deny" | "ask"
}

export function evaluate(permission: string, pattern: string, ...rulesets: Rule[][]): Rule {
  const rules = rulesets.flat()
  const match = rules.findLast(
    (rule) => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern),
  )
  return match ?? { action: "ask", permission, pattern: "*" }
}
