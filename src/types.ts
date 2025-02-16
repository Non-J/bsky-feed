export const MediaSourceType = {
  notMedia: 0,
  media: 1,
  mediaRepost: 2,
  linkToMediaSites: 3,
} as const

export type MediaSourceTypeT = (typeof MediaSourceType)[keyof typeof MediaSourceType]
