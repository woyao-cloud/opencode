/**
 * Demo 03: Layer Dependency Resolution Algorithm (Topological Sort)
 *
 * 展示 Layer 依赖解析的核心算法 —— 拓扑排序。
 * Effect-TS 的 Layer 系统在构建时需要按照依赖顺序初始化服务，
 * 这本质上是一个有向无环图（DAG）的拓扑排序问题。
 *
 * 关键概念：
 * - Layer<RIn, E, ROut> 表示需要 RIn 依赖、可能失败于 E、提供 ROut 服务
 * - 多个 Layer 可以通过 Layer.provide 或 Layer.merge 组合
 * - 运行时需要按照拓扑顺序初始化（先初始化被依赖的，再初始化依赖者）
 * - 循环依赖在构建时会被检测并报错
 * - 每个 Layer 的初始化是 memoized 的（只初始化一次）
 */

import { Effect } from "effect"

// ============================================================
// 简化版 Layer 依赖解析器（仅供理解，非生产代码）
// ============================================================

/**
 * 服务标识 —— 模拟 Context.Tag
 *
 * 每个服务有一个唯一的 key，Layer 通过 Tag 声明提供什么、需要什么。
 */
interface ServiceTag<T> {
  readonly key: string
  readonly _serviceType: T // phantom type for type safety
}

const createTag = <T>(key: string): ServiceTag<T> => ({ key } as any)

/**
 * 简化的 Layer 数据结构
 *
 * 真实的 Effect-TS Layer 使用更复杂的编码（支持 memoization、
 * scope 管理、finalization 等），这里简化核心概念。
 */
interface SimplifiedLayer {
  readonly name: string
  readonly provides: Set<string>     // 这个 Layer 提供的服务 key
  readonly requires: Set<string>     // 这个 Layer 需要的服务 key
}

/**
 * 拓扑排序 —— Kahn 算法
 *
 * 用于计算 Layer 的正确初始化顺序。
 * 时间复杂度 O(V + E)，空间复杂度 O(V + E)。
 *
 * 算法步骤：
 * 1. 计算每个节点的入度（被多少其他节点依赖）
 * 2. 将入度为 0 的节点加入队列
 * 3. 依次处理队列中的节点，减少其依赖者的入度
 * 4. 如果处理完所有节点，则存在有效的拓扑序
 * 5. 如果还有节点未处理，说明存在循环依赖
 */
const topologicalSort = (layers: SimplifiedLayer[]): SimplifiedLayer[] | null => {
  // 构建邻接表和入度
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, SimplifiedLayer[]>()
  const layerByName = new Map<string, SimplifiedLayer>()

  // 初始化
  for (const layer of layers) {
    layerByName.set(layer.name, layer)
    if (!inDegree.has(layer.name)) {
      inDegree.set(layer.name, 0)
    }
    if (!adjacency.has(layer.name)) {
      adjacency.set(layer.name, [])
    }
  }

  // 构建依赖图
  for (const layer of layers) {
    for (const required of layer.requires) {
      // 找到提供该服务的 Layer
      for (const provider of layers) {
        if (provider.provides.has(required)) {
          // provider → layer（provider 必须在 layer 之前初始化）
          adjacency.get(provider.name)!.push(layer)
          inDegree.set(layer.name, (inDegree.get(layer.name) || 0) + 1)
        }
      }
    }
  }

  // Kahn 算法
  const queue: SimplifiedLayer[] = []
  const result: SimplifiedLayer[] = []

  // 所有入度为 0 的节点入队
  for (const [name, degree] of inDegree) {
    if (degree === 0) {
      queue.push(layerByName.get(name)!)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)

    for (const dependent of adjacency.get(current.name) || []) {
      const newDegree = (inDegree.get(dependent.name) || 1) - 1
      inDegree.set(dependent.name, newDegree)
      if (newDegree === 0) {
        queue.push(dependent)
      }
    }
  }

  // 检查是否有循环依赖
  if (result.length !== layers.length) {
    const unresolved = layers.filter((l) => !result.includes(l))
    console.error(`❌ 检测到循环依赖！未解析的 Layer: ${unresolved.map((l) => l.name).join(", ")}`)
    return null
  }

  return result
}

/**
 * 检测循环依赖
 *
 * 使用 DFS 检测图中是否存在环。
 * 白-灰-黑 三色标记法。
 */
const detectCycle = (layers: SimplifiedLayer[]): string[] | null => {
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  const layerByName = new Map<string, SimplifiedLayer>()
  const path: string[] = []

  for (const layer of layers) {
    layerByName.set(layer.name, layer)
    color.set(layer.name, WHITE)
  }

  const dfs = (name: string): boolean => {
    color.set(name, GRAY)
    path.push(name)

    const layer = layerByName.get(name)!
    for (const required of layer.requires) {
      // 找到提供该服务的 Layer
      for (const provider of layers) {
        if (provider.provides.has(required)) {
          const providerColor = color.get(provider.name)!
          if (providerColor === GRAY) {
            // 发现环！
            path.push(provider.name)
            return true
          }
          if (providerColor === WHITE && dfs(provider.name)) {
            return true
          }
        }
      }
    }

    path.pop()
    color.set(name, BLACK)
    return false
  }

  for (const layer of layers) {
    if (color.get(layer.name) === WHITE) {
      if (dfs(layer.name)) {
        return path
      }
    }
  }

  return null
}

// ============================================================
// 演示：Layer 依赖解析
// ============================================================

console.log("=".repeat(60))
console.log("Demo 03: Layer 依赖解析算法（拓扑排序）")
console.log("=".repeat(60))

console.log("\n--- 场景：服务依赖图 ---")
console.log("Database ← Config")
console.log("Repository ← Database")
console.log("Service  ← Repository + Config")
console.log("")

// 定义简化的 Layer 图
const configLayer: SimplifiedLayer = {
  name: "ConfigLayer",
  provides: new Set(["Config"]),
  requires: new Set()
}

const dbLayer: SimplifiedLayer = {
  name: "DatabaseLayer",
  provides: new Set(["Database"]),
  requires: new Set(["Config"])
}

const repoLayer: SimplifiedLayer = {
  name: "RepositoryLayer",
  provides: new Set(["Repository"]),
  requires: new Set(["Database"])
}

const serviceLayer: SimplifiedLayer = {
  name: "ServiceLayer",
  provides: new Set(["Service"]),
  requires: new Set(["Repository", "Config"])
}

const allLayers = [configLayer, dbLayer, repoLayer, serviceLayer]

// 执行拓扑排序
const sorted = topologicalSort(allLayers)

if (sorted) {
  console.log("✅ 拓扑排序结果（正确的初始化顺序）:")
  sorted.forEach((layer, i) => {
    console.log(`  ${i + 1}. ${layer.name} (提供: [${[...layer.provides].join(", ")}])`)
  })
}

// 演示循环依赖检测
console.log("\n--- 循环依赖检测 ---")

const cyclicLayers: SimplifiedLayer[] = [
  { name: "LayerA", provides: new Set(["A"]), requires: new Set(["B"]) },
  { name: "LayerB", provides: new Set(["B"]), requires: new Set(["A"]) }
]

const cycle = detectCycle(cyclicLayers)
if (cycle) {
  console.log(`❌ 检测到循环依赖: ${cycle.join(" → ")}`)
}

const sortedCyclic = topologicalSort(cyclicLayers)
console.log(`拓扑排序结果: ${sortedCyclic === null ? "null（循环依赖无法排序）" : "成功"}`)

// ============================================================
// 演示：使用真实 Effect-TS Layer 系统
// ============================================================

console.log("\n--- 真实 Effect-TS Layer 依赖解析演示 ---")

/**
 * 使用简单的服务接口和 Context.make 演示 Layer 依赖解析
 *
 * 真实的 Effect-TS 内部会自动执行拓扑排序来解析 Layer 依赖图，
 * Layer.provide 在构建时按依赖顺序组合 Layer。
 */

// 定义服务接口
interface Config {
  readonly dbUrl: string
}

interface Database {
  readonly query: (sql: string) => Effect.Effect<readonly string[]>
}

// 使用 Effect.gen 和直接提供依赖来展示依赖链
const configEffect = Effect.sync((): Config => {
  console.log("  ⚙️  初始化 Config...")
  return { dbUrl: "postgres://localhost:5432/mydb" }
})

const dbEffect = (config: Config): Effect.Effect<Database> =>
  Effect.sync(() => {
    console.log(`  🔌 使用配置连接数据库: ${config.dbUrl}`)
    return {
      query: (sql: string): Effect.Effect<readonly string[]> =>
        Effect.sync(() => {
          console.log(`  📊 执行查询: ${sql}`)
          return ["row1", "row2"]
        })
    }
  })

// 模拟 Layer 依赖解析：手动按依赖顺序组合
const program = Effect.gen(function* () {
  console.log("▶️  程序启动（手动按依赖顺序初始化，模拟拓扑排序结果）")

  // Step 1: 初始化 Config（入度为 0，最先初始化）
  const config = yield* configEffect

  // Step 2: 初始化 Database（依赖 Config，第二步初始化）
  const db = yield* dbEffect(config)

  // Step 3: 使用服务
  const rows = yield* db.query("SELECT * FROM users")
  console.log(`  ✅ 查询结果: [${rows.join(", ")}]`)
})

Effect.runPromise(program)

// ============================================================
// 知识点总结
// ============================================================
console.log("\n📚 关键概念:")
console.log("1. Layer 依赖关系构成有向无环图（DAG）")
console.log("2. 拓扑排序确定正确的初始化顺序")
console.log("3. Kahn 算法（BFS）和 DFS 都可以实现拓扑排序")
console.log("4. 循环依赖在构建时被检测并报错")
console.log("5. Effect-TS 运行时自动处理 Layer 的 memoization 和 scope")
