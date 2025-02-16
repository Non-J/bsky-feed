import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { sql, SQLWrapper, desc, inArray, and, lt } from 'drizzle-orm'
import { MediaSourceType } from '../types'
import { posts as postsTable } from '../db/schema'

// max 15 chars
export const shortname = 'flw-media-only'

export const handler = async (
  requesterDid: string,
  ctx: AppContext,
  params: QueryParams,
) => {
  try {
    const followings = await ctx.followingLoader.load(requesterDid)

    const withCursor = ctx.db.$with('wc').as(
      ctx.db
        .select({
          uri: postsTable.uri,
          cursor:
            sql<string>`(printf('%x',${postsTable.indexed})||'.'||${postsTable.cid})`.as(
              'cursor',
            ),
        })
        .from(postsTable)
        .where(
          and(
            inArray(postsTable.author, followings),
            inArray(postsTable.mediaSourceType, [
              MediaSourceType.media,
              MediaSourceType.mediaRepost,
              MediaSourceType.linkToMediaSites,
            ]),
          ),
        ),
    )

    const result = await ctx.db
      .with(withCursor)
      .select()
      .from(withCursor)
      .orderBy(desc(withCursor.cursor))
      .where(params.cursor ? lt(withCursor.cursor, params.cursor) : undefined)
      .limit(params.limit)

    const feed = result.map((row) => ({
      post: row.uri,
    }))

    let cursor: string | undefined
    const last = result.at(-1)
    if (last) {
      cursor = last.cursor
    }

    return {
      cursor,
      feed,
    }
  } catch (err) {
    console.log(err)
    return {
      feed: [],
    }
  }
}
