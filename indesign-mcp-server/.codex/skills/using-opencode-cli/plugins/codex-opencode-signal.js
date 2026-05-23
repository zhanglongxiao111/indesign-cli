import fs from "node:fs"
import path from "node:path"

function writeSignal(event) {
  const signalDir = process.env.CODEX_OPENCODE_SIGNAL_DIR
  if (!signalDir) return

  fs.mkdirSync(signalDir, { recursive: true })
  const properties = event?.properties ?? {}
  const signal = {
    type: event?.type ?? "",
    sessionID:
      properties.sessionID ??
      properties.sessionId ??
      properties.session?.id ??
      properties.id ??
      "",
    updatedAt: new Date().toISOString(),
  }

  fs.writeFileSync(
    path.join(signalDir, "opencode-hook-status.json"),
    JSON.stringify(signal, null, 2),
    "utf8",
  )
}

export default async function CodexOpenCodeSignalPlugin() {
  return {
    sessionCreated: async (session) => {
      writeSignal({ type: "session.created", properties: session })
    },
    event: async ({ event }) => {
      if (
        event?.type === "session.created" ||
        event?.type === "session.idle" ||
        event?.type === "session.error"
      ) {
        writeSignal(event)
      }
    },
  }
}
