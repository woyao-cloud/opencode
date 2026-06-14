/**
 * tool/truncation-dir - 截断输出目录定义
 *
 * 功能概述：
 * - 定义命令输出截断文件的存储目录路径
 *
 * 核心导出：
 * - TRUNCATION_DIR：截断输出目录路径常量
 *
 * 架构位置：工具系统实现层，被 tool/truncate.ts 引用
 */
import path from "path"
import { Global } from "@opencode-ai/core/global"

export const TRUNCATION_DIR = path.join(Global.Path.data, "tool-output")
