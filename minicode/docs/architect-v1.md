# 增加规划agnent builder agent and reviewer agent


Current Architecture:
- CLI: yargs with 2 commands (run and serve)
- Bootstrapping: Effect Layer system
- run command has two modes: singleShot and interactive
- interactive uses LLM.generate with tools via maxSteps
- Tools are defined inline (not using the Effect-based tool registry)
- Session persists to SQLite
What the user wants:
A proper multi-agent build system where:
1. A Planner agent creates a structured plan
2. Build agents execute the plan in parallel
3. The system handles multi-file generation reliably
Let me design this:
Architecture Proposal
┌─────────────────────────────────────────────┐
│                 CLI (yargs)                  │
│  run  │  serve  │  plan  │  build [NEW]      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│               Agent Runtime                  │
│  ┌────────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Planner    │  │ Builder  │  │ Reviewer │ │
│  │ Agent      │  │ Agent(s) │  │ Agent    │ │
│  └────────────┘  └──────────┘  └──────────┘ │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│              Tool System                     │
│  ┌────────┐  ┌────────┐  ┌────────┐         │
│  │ Read   │  │ Write  │  │ Bash   │  ...    │
│  └────────┘  └────────┘  └────────┘         │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           LLM Runtime (@minicode/llm)       │
└─────────────────────────────────────────────┘
Key Components to Build:
1. Plan System: A structured plan format (file list, dependencies, status)
2. Planner Agent: Takes user request → generates structured plan with file specs
3. Build Agent(s): Execute individual items from the plan
4. Plan/Build CLI commands: New CLI commands for the workflow
5. Parallel execution: Execute independent file writes concurrently
6. Review step: Optional review agent to validate output
Let me think about the implementation approach:
For minicode, I don't want to over-engineer this. The key insight is:
Problem: generateText with maxSteps can't handle creating 6+ files because:
- Each tool call = 1 round trip to the LLM
- Context grows with each tool result
- Models tend to stop after 3-5 steps
Solution: Decouple planning from execution.
1. First, a Planner LLM call generates a structured spec (list of files with content/dependencies)
2. Then, write all files using Bun.write directly (no LLM round trips)
This is similar to how AI coding tools work: the "architect" plans, then the "engineer" codes.



# v2

修正后的架构设计
┌─────────────────────────────────────────────────────┐
│                     CLI (yargs)                       │
│  run    │   plan   │   build   │   review   │ serve  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  ACP Message Bus                     │
│  (agent-to-agent communication via message passing)  │
└───┬──────────┬──────────┬──────────┬────────────────┘
    │          │          │          │
┌───▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼──────────┐
│Planner │ │Builder │ │Builder │ │Reviewer      │
│Agent   │ │Agent 1 │ │Agent 2 │ │Agent         │
│(产生   │ │(写文件) │ │(写文件) │ │(验证+反馈)   │
│ SubPlan)│ │        │ │        │ │              │
└───┬────┘ └───┬────┘ └───┬────┘ └───┬──────────┘
    │          │          │          │
    └──────────┴──────────┴──────────┘
                         │
              ┌──────────▼──────────┐
              │    Tool Registry    │
              │  read │ write │ bash│
              └─────────────────────┘
建议的分步迭代路径
按照"从简单到完整，每步都可运行"的原则：
| Step | 实现内容 | 学到的东西 |
|---|---|---|
| 1 | Plan Schema + Plan 生成 tool | Effect Schema 设计、Plan 的数据建模 |
| 2 | Builder SubAgent（单文件 → 多文件并行） | SubAgent 模式、并行 task queue |
| 3 | ACP Message Bus 层 | Agent 间通信协议 |
| 4 | Reviewer Agent + Review Loop | 反馈循环、条件分支 |
| 5 | 完整的 CLI 管道命令 | Pipeline 编排、状态机 |
Step 1 是 Plan 的数据定义 + build_files tool（即我原来规划的核心），这步之后立刻就能解决贪吃蛇多文件问题。后续逐步加 ACP 和 SubAgent。