export interface Result {
  url: string
  title: string
  pageTitle?: string
  /** The H2 an H3 result sits under, for the result's breadcrumb. */
  parentTitle?: string
  /** First words of the section, shown under the title. */
  snippet?: string
  [key: string]: unknown
}

export function search(
  query: string,
  options?: { limit?: number },
): Array<Result>
