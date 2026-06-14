/**
 * project/instance-layer - 实例 Layer 组装：组合 InstanceStore 与 InstanceBootstrap
 *
 * 功能概述：
 * - 组合 InstanceStore 默认 Layer 和 InstanceBootstrap Layer
 * - 提供最终的实例 Layer
 *
 * 核心导出：
 * - layer：组合后的实例 Effect Layer
 *
 * 架构位置：Project 模块组合层，连接存储层和引导层。
 */
import { Effect, Layer } from "effect"
import { InstanceStore } from "./instance-store"

export const layer = Layer.unwrap(
  Effect.promise(async () => {
    const { InstanceBootstrap } = await import("./bootstrap")
    return InstanceStore.defaultLayer.pipe(Layer.provide(InstanceBootstrap.defaultLayer))
  }),
)

export * as InstanceLayer from "./instance-layer"
