import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import { posts as postsTable } from './db/schema'
import { inArray, sql } from 'drizzle-orm'
import { MediaSourceType, type MediaSourceTypeT } from './types'
import { logError } from './util/log'

const mediaSiteDomains = process.env.MEDIA_SITE_DOMAINS?.split(';') ?? []

const isUrlMediaSite = (url: string): boolean => {
  const parsed = new URL(url)
  for (const site of mediaSiteDomains) {
    if (parsed.hostname.endsWith(site)) return true
  }
  return false
}

const stripHashtag = (input: string): string => {
  const idx = input.indexOf('#')
  if (idx === -1) {
    return input
  } else {
    return input.slice(0, idx)
  }
}

type PostType =
  | Awaited<ReturnType<typeof getOpsByType>>['posts']['creates'][number]
  | Awaited<ReturnType<typeof getOpsByType>>['reposts']['creates'][number]

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async checkMediaSourceType(
    post: PostType,
    isRepost: boolean,
    isRecursive?: boolean,
  ): Promise<MediaSourceTypeT> {
    let targetRepost: string | undefined

    try {
      if (isRepost) {
        targetRepost = (post.record.subject as any)['uri']
      } else if (post.record.embed) {
        const embed = post.record.embed as any
        const embedType = stripHashtag(embed['$type'])

        switch (embedType) {
          case 'app.bsky.embed.images':
          case 'app.bsky.embed.video':
            return MediaSourceType.media
          case 'app.bsky.embed.external':
            return isUrlMediaSite(embed.external.uri)
              ? MediaSourceType.linkToMediaSites
              : MediaSourceType.notMedia
          case 'app.bsky.embed.record':
            targetRepost = embed.record.uri
            break
          case 'app.bsky.embed.recordWithMedia':
            targetRepost = embed.record.record.uri
            {
              switch (stripHashtag(embed.media['$type'])) {
                case 'app.bsky.embed.images':
                case 'app.bsky.embed.video':
                  return MediaSourceType.media
                case 'app.bsky.embed.external':
                  {
                    if (isUrlMediaSite(embed.media.external.uri)) {
                      return MediaSourceType.linkToMediaSites
                    }
                  }
                  break
                default:
                  throw new Error('Unknown embed media type')
              }
            }
            break
          default:
            throw new Error('Unknown embed type')
        }
      } else {
        return MediaSourceType.notMedia
      }
    } catch (e) {
      if (e instanceof Error) {
        await logError(this.db, {
          msg: 'subscription checkMediaSourceType post extract error',
          post,
          isRepost,
          err: { name: e.name, message: e.message, cause: e.cause },
        })
      } else {
        await logError(this.db, {
          msg: 'subscription checkMediaSourceType post extract error',
          post,
          isRepost,
        })
      }

      return MediaSourceType.notMedia
    }

    if (isRecursive) return MediaSourceType.notMedia

    if (!targetRepost) {
      await logError(this.db, {
        msg: 'subscription checkMediaSourceType no targetRepost',
        post,
        isRepost,
      })

      return MediaSourceType.notMedia
    }

    const targetRepostDb = await this.db.query.posts.findFirst({
      where(fields, { eq }) {
        return eq(fields.uri, targetRepost)
      },
    })

    if (
      targetRepostDb &&
      (targetRepostDb.mediaSourceType === MediaSourceType.media ||
        targetRepostDb.mediaSourceType === MediaSourceType.linkToMediaSites)
    ) {
      return MediaSourceType.mediaRepost
    } else if (targetRepostDb) {
      return MediaSourceType.notMedia
    }

    const targetPostData = await this.postLoader.load(targetRepost)
    if (!targetPostData) return MediaSourceType.notMedia

    const targetPostType = await this.checkMediaSourceType(
      targetPostData as any,
      false,
      true,
    )
    if (
      targetPostType === MediaSourceType.media ||
      targetPostType === MediaSourceType.linkToMediaSites
    ) {
      return MediaSourceType.mediaRepost
    }

    return MediaSourceType.notMedia
  }

  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return

    const ops = await getOpsByType(evt)

    const postsToCreate: (typeof postsTable.$inferInsert)[] = []

    for (const post of ops.posts.creates) {
      const mediaSourceType = await this.checkMediaSourceType(post, false)
      postsToCreate.push({
        uri: post.uri,
        cid: post.cid,
        author: post.author,
        created: new Date(post.record.createdAt),
        indexed: new Date(),
        mediaSourceType: mediaSourceType,
      })
    }

    for (const post of ops.reposts.creates) {
      const mediaSourceType = await this.checkMediaSourceType(post, true)
      postsToCreate.push({
        uri: post.uri,
        cid: post.cid,
        author: post.author,
        created: new Date(post.record.createdAt),
        indexed: new Date(),
        mediaSourceType: mediaSourceType,
      })
    }

    const postsToDelete = [
      ...ops.posts.deletes.map((del) => del.uri),
      ...ops.reposts.deletes.map((del) => del.uri),
    ]
    if (postsToDelete.length > 0) {
      await this.db
        .delete(postsTable)
        .where(inArray(postsTable.uri, postsToDelete))
    }
    if (postsToCreate.length > 0) {
      await this.db
        .insert(postsTable)
        .values(postsToCreate)
        .onConflictDoUpdate({
          target: postsTable.uri,
          set: {
            cid: sql`excluded.cid`,
            author: sql`excluded.uri`,
            created: sql`excluded.created`,
            indexed: sql`excluded.indexed`,
            mediaSourceType: sql`excluded.mediaSourceType`,
          },
        })
    }
  }
}
