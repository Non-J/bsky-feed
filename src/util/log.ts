import { Database } from '../db'
import { errorLogs } from '../db/schema'

export const logError = async (db: Database, msg: unknown) => {
  console.error(`Error: ${JSON.stringify(msg)}`)

  await db.insert(errorLogs).values({
    time: new Date(),
    msg,
  })
}
