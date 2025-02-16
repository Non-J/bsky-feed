import dotenv from 'dotenv'
import FeedGenerator from './server'
import { createDb } from './db'
import { posts as postsTable } from './db/schema'
import { notInArray, desc, sql } from 'drizzle-orm'
import { MediaSourceType } from './types'
import { stat } from 'node:fs/promises'

const run = async () => {
  dotenv.config()

  setInterval(async () => {
    try {
      const db = createDb(process.env.FEEDGEN_SQLITE_LOCATION!)
      db.delete(postsTable).where(
        notInArray(postsTable.mediaSourceType, [
          MediaSourceType.media,
          MediaSourceType.mediaRepost,
          MediaSourceType.linkToMediaSites,
        ]),
      )

      await new Promise((resolve) => setTimeout(resolve, 10000))

      const dbStat = await stat(process.env.FEEDGEN_SQLITE_LOCATION!)
      const offset = 80000000

      if (dbStat.size > 1000 * 1000 * 1000 * 30) {
        const result = await db.run(
          sql`DELETE FROM ${postsTable} ORDER BY ${postsTable.indexed} DESC LIMIT -1 OFFSET ${offset}`,
        )

        console.log(
          `DB Cleanup on ${new Date().toISOString()}. Size: ${
            dbStat.size
          }, Offset: ${offset}, Changes: ${result.changes}`,
        )
      }
    } catch (e) {
      console.error(e)
    }
  }, 1000 * 60 * 15)

  const hostname = maybeStr(process.env.FEEDGEN_HOSTNAME) ?? 'example.com'
  const serviceDid =
    maybeStr(process.env.FEEDGEN_SERVICE_DID) ?? `did:web:${hostname}`
  const server = FeedGenerator.create({
    port: maybeInt(process.env.FEEDGEN_PORT) ?? 3000,
    listenhost: maybeStr(process.env.FEEDGEN_LISTENHOST) ?? 'localhost',
    sqliteLocation: maybeStr(process.env.FEEDGEN_SQLITE_LOCATION) ?? ':memory:',
    subscriptionEndpoint:
      maybeStr(process.env.FEEDGEN_SUBSCRIPTION_ENDPOINT) ??
      'wss://bsky.network',
    publisherDid:
      maybeStr(process.env.FEEDGEN_PUBLISHER_DID) ?? 'did:example:alice',
    subscriptionReconnectDelay:
      maybeInt(process.env.FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY) ?? 3000,
    hostname,
    serviceDid,
  })
  await server.start()
  console.log(
    `🤖 running feed generator at http://${server.cfg.listenhost}:${server.cfg.port}`,
  )
}

const maybeStr = (val?: string) => {
  if (!val) return undefined
  return val
}

const maybeInt = (val?: string) => {
  if (!val) return undefined
  const int = parseInt(val, 10)
  if (isNaN(int)) return undefined
  return int
}

run()
