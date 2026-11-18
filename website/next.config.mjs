import withSearch from './src/markdoc/search.mjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // The site is its own app with its own lockfile inside the hub's repo; without
  // this Next sees both lockfiles and warns that it had to guess the root.
  outputFileTracingRoot: import.meta.dirname,
  images: {
    unoptimized: true,
  },
}

export default withSearch(nextConfig)
