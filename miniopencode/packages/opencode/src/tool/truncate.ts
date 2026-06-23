export function truncateOutput(output: string, maxLength: number): string {
  if (output.length <= maxLength) return output

  const half = Math.floor(maxLength / 2)
  const head = output.slice(0, half)
  const tail = output.slice(output.length - half)
  return `${head}\n\n... [truncated ${output.length - maxLength} characters] ...\n\n${tail}`
}

export function truncateLines(output: string, maxLines: number): string {
  const lines = output.split("\n")
  if (lines.length <= maxLines) return output

  const half = Math.floor(maxLines / 2)
  const head = lines.slice(0, half)
  const tail = lines.slice(lines.length - half)
  return `${head.join("\n")}\n\n... [truncated ${lines.length - maxLines} lines] ...\n\n${tail.join("\n")}`
}
