export const D1_IN_QUERY_CHUNK_SIZE = 75

export function chunkForD1<T>(values: T[], size = D1_IN_QUERY_CHUNK_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('D1 query chunk size must be a positive integer')
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}
