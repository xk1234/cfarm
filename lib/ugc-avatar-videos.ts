export function getOrderedUgcAvatarVideos<T extends { url: string }>(data: {
  assets: { ugcAvatarVideos: T[] }
  ugcAds: { avatars: string[] }
}): T[] {
  const videosByUrl = new Map(data.assets.ugcAvatarVideos.map((asset) => [asset.url, asset]))
  const orderedVideos = data.ugcAds.avatars
    .map((url) => videosByUrl.get(url))
    .filter((asset): asset is T => Boolean(asset))

  return orderedVideos.length > 0 ? orderedVideos : data.assets.ugcAvatarVideos
}
