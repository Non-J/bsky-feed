import Sqlite from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export const createDb = (location: string) => {
  const client = new Sqlite(location)
  client.pragma('journal_mode = WAL')
  return drizzle({ client, schema })
}

export type Database = ReturnType<typeof createDb>
