完整的 bun install 过程清清楚楚。让我解释发生了什么：

bun install 做了什么

1. 解析依赖树（Resolving dependencies）
Bun 从根 package.json 的 workspaces: ["packages/*"] 发现三个 workspace 包，然后逐级解析每个包的依赖：
@minicode/core     → effect@4.0.0-beta.65
@minicode/llm      → effect, @ai-sdk/openai@2.0.108, ai@5.0.204
@minicode/opencode  → effect, @effect/platform-node@0.82.0, drizzle-orm@0.44.7, yargs@18.0.0
总共解析出 90 个包声明，去重后需要安装 87 个实际包。
2. 下载与安装（Download & Extract）
Bun 从全局缓存（~/.bun/install/cache/）硬链接到 node_modules/.bun/，而不是每次都下载。这次显示 Resolved, downloaded and extracted [0] — 说明所有包已在缓存中，不需要重新下载。
3. 跳过不兼容的平台包
Bun 检测到当前是 Windows x64，自动跳过了所有其他平台的 native 模块：
Skip installing @msgpackr-extract/msgpackr-extract-darwin-arm64 - cpu & os mismatch
Skip installing @parcel/watcher-linux-x64-glibc - os mismatch
... (共 16 个跨平台包被跳过)
只安装了 @parcel/watcher-win32-x64 和 @msgpackr-extract/msgpackr-extract-win32-x64。
4. Peer 依赖警告
warn: incorrect peer dependency "effect@4.0.0-beta.65"  (×7)
这是因为 @effect/platform-node、@ai-sdk/openai 等包的 peerDependencies 声明期望 effect 的稳定版本（如 ^3.x 或 ^4.0.0），但我们用了 4.0.0-beta.65（beta 版），Bun 警告 peer 不匹配。这些警告不影响功能，因为 beta 版 API 与正式版兼容。
5. 安装结果
132 packages installed [2.63s]
Saved lockfile
- 132 个包安装到 node_modules/.bun/（Bun 的隔离安装模式，不创建顶层 symlink）
- 生成 bun.lock 锁文件
- 三个 workspace 包互相链接：@minicode/core、@minicode/llm、@minicode/opencode 通过 workspace:* 协议互相引用
6. bin 链接（需要额外步骤）
bun install 不会自动注册全局命令。需要在 install 之后执行 bun link 才能将 minicode 命令注册到 C:\Users\<you>\.bun\bin\：
bun link        # → "Success! Registered minicode"
minicode --help # → 正常输出
这就是之前"无法识别 minicode"的原因 — bun install 只装依赖，bun link 才注册命令。