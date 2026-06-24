import { Effect, Exit } from "effect"

const program = Effect.succeed("hello").pipe(Effect.exit)
Effect.runPromise(program).then((exit) => {
  console.log("Success exit:")
  console.log("  _tag:", exit._tag)
  console.log("  keys:", Object.keys(exit))
  console.log("  Exit.isSuccess:", Exit.isSuccess(exit))
  console.log("  Exit.isFailure:", Exit.isFailure(exit))
  if (Exit.isSuccess(exit)) {
    console.log("  getSuccess:", Exit.getSuccess(exit))
  }
})

const program2 = Effect.fail(new Error("fail")).pipe(Effect.exit)
Effect.runPromise(program2).then((exit) => {
  console.log("\nFailure exit:")
  console.log("  _tag:", exit._tag)
  console.log("  keys:", Object.keys(exit))
  console.log("  Exit.isSuccess:", Exit.isSuccess(exit))
  console.log("  Exit.isFailure:", Exit.isFailure(exit))
  if (Exit.isFailure(exit)) {
    console.log("  getCause:", Exit.getCause(exit))
  }
})
