/**
 * server/init-projectors - 投影器初始化入口
 *
 * 功能概述：
 * - 启动时初始化所有投影器
 *
 * 核心导出：
 * - 无（副作用模块，执行初始化）
 *
 * 架构位置：被 server.ts 导入，调用 projectors 模块
 */

import { initProjectors } from "./projectors"

initProjectors()
