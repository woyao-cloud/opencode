// ── HttpApi Server — Route composition and Layer wiring ─────────

import { Config as EffectConfig, Context, Effect, Layer } from "effect"
import { HttpApiBuilder, OpenApi } from "effect/unstable/httpapi"
import {
  FetchHttpClient,
  HttpMiddleware,
  HttpRouter,
  HttpServer,
  HttpServerResponse,
} from "effect/unstable/http"
import { BusLive } from "@/bus"
import { ConfigLive } from "@/config/config"
import { SessionLive } from "@/session/session"
import { PromptLive } from "@/session/prompt"
import { SessionRunStateLive } from "@/session/run-state"
import { SessionStatusLive } from "@/session/status"
import { ToolRuntimeLive } from "@/tool/registry"
import { ProviderLive } from "@/provider/index"
import { AgentLive } from "@/agent/agent"
import { PermissionLive } from "@/permission/index"
import { FileLive } from "@/file"
import { GitLive } from "@/git"
import { BackgroundJobLive } from "@/background/job"
import { StorageLive } from "@/storage"
import { MCPLive } from "@/mcp"
import { SkillLive } from "@/skill"
import { QuestionLive } from "@/question"
import { SnapshotLive } from "@/snapshot"
import { WorktreeLive } from "@/worktree"
import { lazy } from "@/util/lazy"
import { isAllowedCorsOrigin, type CorsOptions } from "@/server/cors"
import { InstanceHttpApi, RootHttpApi } from "./api"
import { PublicApi } from "./public"
import { authorizationLayer } from "./middleware/authorization"
import { disposeMiddleware } from "./lifecycle"
import { compressionLayer } from "@/server/middleware/compression"
import { corsVaryFix } from "@/server/middleware/cors-vary"
import { errorLayer } from "@/server/middleware/error"
import { fenceLayer } from "@/server/middleware/fence"
import { schemaErrorLayer } from "@/server/middleware/schema-error"
import { sessionHandlers } from "./handlers/session"
import { configHandlers } from "./handlers/config"
import { providerHandlers } from "./handlers/provider"
import { fileHandlers } from "./handlers/file"
import { projectHandlers } from "./handlers/project"
import { permissionHandlers } from "./handlers/permission"
import { questionHandlers } from "./handlers/question"
import { instanceHandlers } from "./handlers/instance"
import { globalHandlers } from "./handlers/global"

export const context = Context.makeUnsafe<unknown>(new Map())

const cors = (corsOptions?: CorsOptions) =>
  HttpRouter.middleware(
    HttpMiddleware.cors({
      allowedOrigins: (origin) => isAllowedCorsOrigin(origin, corsOptions),
      maxAge: 86_400,
    }),
    { global: true },
  )

const rootApiRoutes = HttpApiBuilder.layer(RootHttpApi).pipe(
  Layer.provide(authorizationLayer),
)

const instanceApiRoutes = HttpApiBuilder.layer(InstanceHttpApi).pipe(
  Layer.provide([
    sessionHandlers,
    configHandlers,
    providerHandlers,
    fileHandlers,
    projectHandlers,
    permissionHandlers,
    questionHandlers,
    instanceHandlers,
    globalHandlers,
  ]),
)

const docResponse = lazy(() => HttpServerResponse.jsonUnsafe(OpenApi.fromApi(PublicApi)))

const docRoute = HttpRouter.use((router) =>
  router.add("GET", "/doc", () => Effect.succeed(docResponse())),
)

export function createRoutes(
  corsOptions?: CorsOptions,
): Layer.Layer<never, EffectConfig.ConfigError, any> {
  return Layer.mergeAll(
    rootApiRoutes,
    instanceApiRoutes,
    docRoute,
    errorLayer as any,
    compressionLayer as any,
    corsVaryFix as any,
    fenceLayer as any,
    schemaErrorLayer as any,
    cors(corsOptions) as any,
    ConfigLive,
    AgentLive,
    PermissionLive,
    ProviderLive,
    SessionLive,
    PromptLive,
    SessionRunStateLive,
    SessionStatusLive,
    ToolRuntimeLive,
    FileLive,
    GitLive,
    BackgroundJobLive,
    StorageLive,
    MCPLive,
    SkillLive,
    QuestionLive,
    SnapshotLive,
    WorktreeLive,
    BusLive,
    FetchHttpClient.layer,
    HttpServer.layerServices,
  ) as any
}

export const routes = createRoutes()

export const webHandler = lazy(() =>
  HttpRouter.toWebHandler(routes, {
    disableLogger: true,
    middleware: disposeMiddleware,
  }),
)

export * as HttpApiApp from "./server"
