import os
base = r"D:\claude-code-project\opencode.ai\opencode\minicode\packages\opencode\src"
files = {}
files["bus/bus-event.ts"] = '''import { Schema } from "effect"
export type Definition<Type extends string = string, Properties extends Schema.Top = Schema.Top> = { readonly type: Type; readonly properties: Properties }
export function define<Type extends string, Properties extends Schema.Top>(type: Type, properties: Properties): Definition<Type, Properties> { return { type, properties } }
export * as BusEvent from "./bus-event"
'''
files["bus/index.ts"] = open(os.path.join(base, "_bus_template.txt"), "r", encoding="utf-8").read() if os.path.exists(os.path.join(base, "_bus_template.txt")) else None
# Remove None entries
files = {k: v for k, v in files.items() if v is not None}
for name, content in files.items():
    path = os.path.join(base, name.replace("/", os.sep))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Wrote: {name}")