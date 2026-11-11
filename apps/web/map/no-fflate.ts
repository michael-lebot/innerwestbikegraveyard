// pmtiles inflates tiles with fflate only in a browser without DecompressionStream, and every browser the site
// supports has one (SPEC §12, §13). next.config.ts puts this in fflate's place: 10 KB less in the map's chunk.
export function decompressSync(): never {
  throw new Error('This browser has no DecompressionStream to inflate the tiles')
}
