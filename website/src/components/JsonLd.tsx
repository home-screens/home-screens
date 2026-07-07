type Schema = Record<string, unknown>

/**
 * Renders one or more JSON-LD `<script>` tags. Accepts a single schema object
 * or an array of them so every structured-data call site shares one wiring.
 */
export function JsonLd({ schema }: { schema: Schema | Array<Schema> }) {
  const items = Array.isArray(schema) ? schema : [schema]
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item) }}
        />
      ))}
    </>
  )
}
