import type { Agent } from '@atproto/api'
import type { Database } from './db'
import type { DidResolver } from '@atproto/identity'
import type DataLoader from 'dataloader'

export type AppContext = {
  db: Database
  didResolver: DidResolver
  cfg: Config
  agent: Agent
  followingLoader: DataLoader<string, string[]>
}

export type Config = {
  port: number
  listenhost: string
  hostname: string
  sqliteLocation: string
  subscriptionEndpoint: string
  serviceDid: string
  publisherDid: string
  subscriptionReconnectDelay: number
}
