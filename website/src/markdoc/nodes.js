import { nodes as defaultNodes, Tag } from '@markdoc/markdoc'
import { slugifyWithCounter } from '@sindresorhus/slugify'
import yaml from 'js-yaml'

import { MarkdocLayout } from '@/components/MarkdocLayout'
import { Fence } from '@/components/docs/Fence'

let documentSlugifyMap = new Map()

const nodes = {
  document: {
    ...defaultNodes.document,
    render: MarkdocLayout,
    transform(node, config) {
      documentSlugifyMap.set(config, slugifyWithCounter())

      return new Tag(
        this.render,
        {
          frontmatter: yaml.load(node.attributes.frontmatter),
          nodes: node.children,
        },
        node.transformChildren(config),
      )
    },
  },
  heading: {
    ...defaultNodes.heading,
    transform(node, config) {
      let slugify = documentSlugifyMap.get(config)
      let attributes = node.transformAttributes(config)
      let children = node.transformChildren(config)
      let text = children.filter((child) => typeof child === 'string').join(' ')
      let id = attributes.id ?? slugify(text)

      return new Tag(
        `h${node.attributes.level}`,
        { ...attributes, id },
        children,
      )
    },
  },
  th: {
    ...defaultNodes.th,
    attributes: {
      ...defaultNodes.th.attributes,
      scope: {
        type: String,
        default: 'col',
      },
    },
  },
  fence: {
    render: Fence,
    attributes: {
      content: { type: String, render: false, required: true },
      language: { type: String },
      // {% process=false %} on a fence stops Markdoc from parsing {% ... %}
      // sequences inside it — required for code samples containing Jinja
      // templates (Home Assistant YAML).
      process: { type: Boolean, render: false, default: true },
    },
    transform(node, config) {
      const attributes = node.transformAttributes(config)
      // Always render the raw fence text: Fence highlights a plain string,
      // and parsed children would hand it an array instead.
      return new Tag(this.render, attributes, [node.attributes.content])
    },
  },
}

export default nodes
