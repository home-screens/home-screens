import { Callout } from '@/components/docs/Callout'
import { LatestImageLink } from '@/components/docs/LatestImageLink'
import { QuickLink, QuickLinks } from '@/components/docs/QuickLinks'
import { Screenshot } from '@/components/docs/Screenshot'

const tags = {
  // {% screenshot name="editor-areas" caption="..." /%} — a render listed in
  // public/images/docs/manifest.json (see Screenshot.tsx).
  screenshot: {
    selfClosing: true,
    attributes: {
      name: { type: String, required: true },
      caption: { type: String },
      alt: { type: String },
      phone: { type: Boolean, default: false },
    },
    render: Screenshot,
  },
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
