set MINICODE_LOG_PRINT=1
set MINICODE_LOG_LEVEL=DEBUG 
# work well
运行单会话
```
set MINIOPENCODE_MODEL=glm-5.1:cloud
set OPENAI_API_KEY=97c5090d09d7450086d97d017651de77.yJv_ANaLOWh217NSxJN_iUbU
miniopencode run -p "hello" --base-url https://ollama.com/v1
minicode run -p "规划一个贪吃蛇游戏" --base-url https://ollama.com/v1
```
运行多会话 REPL mode

系统正常工作——CLI 解析参数、调用 LLM、错误传播都正确。只是 API key 无效导致 LLM 调用失败。用有效 key 即可：
set OPENAI_API_KEY=<你的key>
bun run packages/opencode/src/index.ts run -p "hello"

bun run packages/opencode/src/index.ts run -i


Debug: Javascript Debug Terminal
bun run packages/opencode/src/index.ts run -i