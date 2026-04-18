import { Callout } from '@/components/docs/Callout'
import { LatestImageLink } from '@/components/docs/LatestImageLink'
import { QuickLink, QuickLinks } from '@/components/docs/QuickLinks'

const tags = {
  callout: {
    attributes: {
      title: { type: String },
      type: {
        type: String,
        default: 'note',
        matches: ['note', 'warning'],
        errorLevel: 'critical',
      },
    },
    render: Callout,
  },
  figure: {
    selfClosing: true,
    attributes: {
      src: { type: String },
      alt: { type: String },
      caption: { type: String },
      width: { type: Number },
      height: { type: Number },
    },
    render: ({ src, alt = '', caption, width, height }) => (
      <figure>
        <img src={src} alt={alt} width={width} height={height} />
        <figcaption>{caption}</figcaption>
      </figure>
    ),
  },
  'latest-image-link': {
    selfClosing: true,
    attributes: {
      label: { type: String },
    },
    render: LatestImageLink,
  },
  'quick-links': {
    render: QuickLinks,
  },
  'quick-link': {
    selfClosing: true,
    render: QuickLink,
    attributes: {
      title: { type: String },
      description: { type: String },
      icon: { type: String },
      href: { type: String },
    },
  },
}

export default tags
