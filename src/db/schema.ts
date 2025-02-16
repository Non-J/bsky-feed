import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const posts = sqliteTable('posts', {
  uri: text().primaryKey().notNull(),
  cid: text().notNull(),
  author: text().notNull(),
  created: integer({ mode: 'timestamp' }).notNull(),
  indexed: integer({ mode: 'timestamp' }).notNull(),
  mediaSourceType: integer().notNull(),
})

export const subState = sqliteTable('subState', {
  service: text().primaryKey().notNull(),
  cursor: integer().notNull(),
})

export const errorLogs = sqliteTable('errorLogs', {
  id: integer().primaryKey({ autoIncrement: true }),
  time: integer({ mode: 'timestamp' }).notNull(),
  msg: text({ mode: 'json' }).notNull(),
})
