/**
 * Picking a port for a dev server, without folklore.
 *
 * PG-18 filed "smoke defaults to 5199, which collides". The tempting fix is a
 * different magic number — and the first one tried, 5233, was already taken by
 * another agent's run on this machine, alongside 5174, 5212, 5241-5244, 5261,
 * 5277-5281, 5311-5333 and 5401-5413. Several agents work this repo at once and
 * every one of them starts a Vite server; any fixed number is a collision
 * waiting to be inherited by whoever reads the README next.
 *
 * So: ask the OS for a free one, and keep `--strictPort` so the remaining race
 * (someone grabs it in the millisecond between close and spawn) fails loudly
 * instead of pointing the run at a stranger's server.
 */
import { createServer } from 'node:net'

/** A port nothing is listening on, as of a moment ago. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

/**
 * Fails in a second, naming the port, rather than after the 20-40s the "dev
 * server never came up" loop used to take to give up on a port somebody else
 * owns.
 */
export function assertPortFree(port, hint) {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', (err) => {
      reject(
        new Error(
          err.code === 'EADDRINUSE'
            ? `Port ${port} is already in use — something else is serving there, and --strictPort ` +
              `would have made this a silent 40-second wait. ${hint ?? 'Unset PORT to get a free one automatically.'}`
            : `Port ${port} is unusable: ${err.message}`,
        ),
      )
    })
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(port)))
  })
}

/** `PORT` if set (checked), otherwise one the OS just told us is free. */
export async function resolvePort(hint) {
  if (process.env.PORT) return assertPortFree(Number(process.env.PORT), hint)
  return freePort()
}
