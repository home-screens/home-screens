import { describe, it, expect } from 'vitest'

import { FENCE_PLACEHOLDER_PREFIX, prepareReadme, readmeImageUrls, resolveReadmeUrl } from '../plugin-readme'

describe('prepareReadme', () => {
  it('drops the leading H1 but keeps later headings', () => {
    const { markdown } = prepareReadme('# Garmin plugin\n\nIntro.\n\n## Views\n\n- one\n')
    expect(markdown).toBe('Intro.\n\n## Views\n\n- one')
    expect(prepareReadme('Title\n=====\n\nBody').markdown).toBe('Body')
  })

  it('removes raw HTML and comments outside code', () => {
    const { markdown } = prepareReadme('<p align="center"><img src="a.png"></p>\n\n<!-- hidden -->Hello <b>bold</b> world')
    expect(markdown).toBe('Hello bold world')
  })

  it('lifts code fences out untouched and defuses Markdoc tags in prose', () => {
    const source = 'Use {% if x %} carefully.\n\n```yaml\n{% if a %}\n<b>kept</b>\n```\n\n~~~\nplain\n~~~\n'
    const { markdown, fences } = prepareReadme(source)
    expect(fences).toEqual(['{% if a %}\n<b>kept</b>', 'plain'])
    expect(markdown).toContain('Use { % if x %} carefully.')
    expect(markdown).toContain(`\`\`\`yaml\n${FENCE_PLACEHOLDER_PREFIX}0\n\`\`\``)
    expect(markdown).toContain(`~~~\n${FENCE_PLACEHOLDER_PREFIX}1\n~~~`)
  })
})

describe('resolveReadmeUrl', () => {
  const repo = 'mara/home-screens-plugin-transit'
  it('points relative paths at GitHub and leaves absolute links alone', () => {
    expect(resolveReadmeUrl('docs/setup.md', repo, 'link')).toBe('https://github.com/mara/home-screens-plugin-transit/blob/HEAD/docs/setup.md')
    expect(resolveReadmeUrl('./shots/a.png', repo, 'image')).toBe('https://raw.githubusercontent.com/mara/home-screens-plugin-transit/HEAD/shots/a.png')
    expect(resolveReadmeUrl('https://homescreens.dev/docs', repo, 'link')).toBe('https://homescreens.dev/docs')
    expect(resolveReadmeUrl('#views', repo, 'link')).toBe('#views')
    expect(resolveReadmeUrl('mailto:a@b.c', repo, 'link')).toBe('mailto:a@b.c')
  })
})

describe('readmeImageUrls', () => {
  const repo = 'mara/home-screens-plugin-transit'
  it('lists each picture once, resolved to the repo, and skips code blocks', () => {
    const source = [
      '# Transit',
      '',
      '![Departures board](screenshots/board.webp)',
      '',
      '| A | B |',
      '|---|---|',
      '| ![Compact](./screenshots/compact.webp "Compact") | ![Hosted](https://homescreens.dev/images/x.webp) |',
      '',
      '```md',
      '![not fetched](screenshots/example.webp)',
      '```',
      '',
      '![Again](screenshots/board.webp)',
    ].join('\n')
    expect(readmeImageUrls(source, repo)).toEqual([
      'https://raw.githubusercontent.com/mara/home-screens-plugin-transit/HEAD/screenshots/board.webp',
      'https://raw.githubusercontent.com/mara/home-screens-plugin-transit/HEAD/screenshots/compact.webp',
      'https://homescreens.dev/images/x.webp',
    ])
  })

  it('answers an empty list for a README without pictures', () => {
    expect(readmeImageUrls('# Plain\n\nJust words.', repo)).toEqual([])
  })
})
