import http from 'http'
import events from 'events'
import express from 'express'
import { DidResolver, MemoryCache } from '@atproto/identity'
import { createServer } from './lexicon'
import feedGeneration from './methods/feed-generation'
import describeGenerator from './methods/describe-generator'
import { createDb, type Database } from './db'
import { FirehoseSubscription } from './subscription'
import { AppContext, Config } from './config'
import wellKnown from './well-known'
import { Agent } from '@atproto/api'
import DataLoader from 'dataloader'
import { LRUCache } from 'lru-cache'

export class FeedGenerator {
  public app: express.Application
  public server?: http.Server
  public db: Database
  public firehose: FirehoseSubscription
  public cfg: Config

  constructor(
    app: express.Application,
    db: Database,
    firehose: FirehoseSubscription,
    cfg: Config,
  ) {
    this.app = app
    this.db = db
    this.firehose = firehose
    this.cfg = cfg
  }

  static create(cfg: Config) {
    const app = express()
    const db = createDb(cfg.sqliteLocation)
    const atpAgent = new Agent(new URL('https://public.api.bsky.app'))
    const firehose = new FirehoseSubscription(
      db,
      atpAgent,
      cfg.subscriptionEndpoint,
    )

    const followingLoader = new DataLoader<string, string[]>(
      async (actor: string[]) => {
        if (actor.length !== 1) throw new Error('Unexpected actor length')

        const result: string[] = []
        let cursor: string | undefined = undefined
        while (true) {
          const chunk = await atpAgent.getFollows({
            actor: actor[0],
            limit: 100,
            cursor: cursor,
          })

          result.push(...chunk.data.follows.map((f) => f.did))

          if (chunk.data.cursor) {
            cursor = chunk.data.cursor
          } else {
            break
          }
        }

        return [result]
      },
      {
        maxBatchSize: 1,
        cacheMap: new LRUCache<string, any>({
          max: 10000,
          ttl: 1000 * 60 * 3,
        }),
      },
    )

    const didCache = new MemoryCache()
    const didResolver = new DidResolver({
      plcUrl: 'https://plc.directory',
      didCache,
    })

    const server = createServer({
      validateResponse: true,
      payload: {
        jsonLimit: 100 * 1024, // 100kb
        textLimit: 100 * 1024, // 100kb
        blobLimit: 5 * 1024 * 1024, // 5mb
      },
    })

    const ctx: AppContext = {
      db,
      didResolver,
      cfg,
      agent: atpAgent,
      followingLoader
    }
    feedGeneration(server, ctx)
    describeGenerator(server, ctx)
    app.use(server.xrpc.router)
    app.use(wellKnown(ctx))

    return new FeedGenerator(app, db, firehose, cfg)
  }

  async start(): Promise<http.Server> {
    this.firehose.run(this.cfg.subscriptionReconnectDelay)
    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost)
    await events.once(this.server, 'listening')
    return this.server
  }
}

export default FeedGenerator
