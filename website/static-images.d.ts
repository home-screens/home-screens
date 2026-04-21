// Ambient declarations for static image imports.
// next/image-types/global provides these at runtime, but only via the
// gitignored next-env.d.ts, which isn't generated until `next dev`/`next build`
// runs — so a standalone `tsc --noEmit` (e.g. in CI) can't see them.

declare module '*.png' {
  const content: import('next/image').StaticImageData
  export default content
}

declare module '*.jpg' {
  const content: import('next/image').StaticImageData
  export default content
}

declare module '*.jpeg' {
  const content: import('next/image').StaticImageData
  export default content
}

declare module '*.gif' {
  const content: import('next/image').StaticImageData
  export default content
}

declare module '*.webp' {
  const content: import('next/image').StaticImageData
  export default content
}

declare module '*.avif' {
  const content: import('next/image').StaticImageData
  export default content
}

declare module '*.ico' {
  const content: import('next/image').StaticImageData
  export default content
}

declare module '*.bmp' {
  const content: import('next/image').StaticImageData
  export default content
}

declare module '*.svg' {
  const content: string
  export default content
}
