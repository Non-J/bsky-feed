import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as mediaOnly from './media-only'
import * as followingMediaOnly from './following-media-only'

type AlgoHandler = (
  requesterDid: string,
  ctx: AppContext,
  params: QueryParams,
) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [mediaOnly.shortname]: mediaOnly.handler,
  [followingMediaOnly.shortname]: followingMediaOnly.handler,
}

export default algos
