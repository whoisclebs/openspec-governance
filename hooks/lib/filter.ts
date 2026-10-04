/** True when every word of `query` appears in one of `fields`, ignoring case; an empty query matches. */
export const matchesQuery = (query: string, ...fields: readonly (string | null | undefined)[]): boolean => {
  const words = query.toLowerCase().split(/\s+/).filter(word => word !== '')
  if (words.length === 0) return true

  const haystack = fields.join(' ').toLowerCase()
  return words.every(word => haystack.includes(word))
}
