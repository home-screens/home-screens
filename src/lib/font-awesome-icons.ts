/**
 * Curated catalog of common Font Awesome 6 free icons for the Icon module
 * picker. Names match the Font Awesome 6 free package exactly — paste them
 * into `<i class="fa-solid fa-${name}">` (or `fa-brands` for `kind: 'brands'`)
 * and they render.
 *
 * This is intentionally a hand-curated subset (~280 entries) rather than
 * the full ~2000-icon catalog: we want a fast, scannable picker, and free
 * users only have access to a subset of icons in the regular/light styles
 * anyway. Power users can paste any class string into the "Custom class"
 * advanced input as a fallback.
 *
 * `kw` are search keywords that aren't already in the icon name itself,
 * so typing "search" finds `magnifying-glass` and "home" finds `house`.
 */
import { logger } from '@/lib/logger';

const log = logger('icon-picker');

export type FaIconKind = 'solid' | 'regular' | 'brands';

export interface FaIconEntry {
  name: string;
  /**
   * Primary style for picker preview and the auto-applied style on pick.
   * Picking the icon flips IconConfig.style to this value, guaranteeing
   * the rendered class string (`fa-${kind} fa-${name}`) matches a woff2
   * file that actually contains the glyph.
   */
  kind: FaIconKind;
  /**
   * All free styles available for this icon. For most solid icons this is
   * `['solid']`; some have `['solid', 'regular']`; brands are `['brands']`.
   * Used to validate that a user-selected style is supported by the icon.
   */
  styles?: readonly FaIconKind[];
  /** Extra search aliases. Tokens already in `name` are searched automatically. */
  kw?: readonly string[];
  /** Display-only group label for the picker. */
  cat: FaCategory;
}

export type FaCategory =
  | 'Popular'
  | 'General'
  | 'Arrows'
  | 'Communication'
  | 'Time & Date'
  | 'Weather'
  | 'Devices'
  | 'Files'
  | 'Media'
  | 'Shopping'
  | 'Travel'
  | 'Food'
  | 'Sports'
  | 'Charts'
  | 'Security'
  | 'Symbols'
  | 'People'
  | 'Brands'
  | 'All';

export const FA_ICONS: readonly FaIconEntry[] = [
  // Popular ---------------------------------------------------------------
  { name: 'house', cat: 'Popular', kind: 'solid', kw: ['home', 'main'] },
  { name: 'magnifying-glass', cat: 'Popular', kind: 'solid', kw: ['search', 'find', 'zoom', 'lookup'] },
  { name: 'gear', cat: 'Popular', kind: 'solid', kw: ['settings', 'cog', 'preferences', 'options'] },
  { name: 'user', cat: 'Popular', kind: 'solid', kw: ['profile', 'person', 'account'] },
  { name: 'bell', cat: 'Popular', kind: 'solid', kw: ['notification', 'alert', 'reminder'] },
  { name: 'envelope', cat: 'Popular', kind: 'solid', kw: ['email', 'mail', 'message', 'letter'] },
  { name: 'heart', cat: 'Popular', kind: 'solid', kw: ['like', 'love', 'favorite'] },
  { name: 'star', cat: 'Popular', kind: 'solid', kw: ['favorite', 'rating'] },
  { name: 'check', cat: 'Popular', kind: 'solid', kw: ['done', 'tick', 'ok', 'yes'] },
  { name: 'xmark', cat: 'Popular', kind: 'solid', kw: ['close', 'cancel', 'remove', 'x', 'delete'] },
  { name: 'plus', cat: 'Popular', kind: 'solid', kw: ['add', 'new', 'create'] },
  { name: 'minus', cat: 'Popular', kind: 'solid', kw: ['remove', 'subtract', 'collapse'] },
  { name: 'eye', cat: 'Popular', kind: 'solid', kw: ['view', 'show', 'visible', 'look'] },
  { name: 'lock', cat: 'Popular', kind: 'solid', kw: ['secure', 'private', 'closed'] },
  { name: 'trash', cat: 'Popular', kind: 'solid', kw: ['delete', 'bin', 'remove', 'garbage'] },
  { name: 'pen', cat: 'Popular', kind: 'solid', kw: ['edit', 'write', 'compose'] },
  { name: 'pen-to-square', cat: 'Popular', kind: 'solid', kw: ['edit', 'pencil', 'modify'] },
  { name: 'cloud', cat: 'Popular', kind: 'solid', kw: ['weather', 'storage', 'upload'] },
  { name: 'circle-info', cat: 'Popular', kind: 'solid', kw: ['info', 'help', 'about'] },
  { name: 'circle-question', cat: 'Popular', kind: 'solid', kw: ['help', 'question', 'support', 'faq'] },
  { name: 'circle-check', cat: 'Popular', kind: 'solid', kw: ['done', 'success', 'ok'] },
  { name: 'circle-xmark', cat: 'Popular', kind: 'solid', kw: ['error', 'failed', 'cancel'] },
  { name: 'triangle-exclamation', cat: 'Popular', kind: 'solid', kw: ['warning', 'caution', 'alert', 'danger'] },
  { name: 'lightbulb', cat: 'Popular', kind: 'solid', kw: ['idea', 'tip', 'hint', 'on'] },

  // General UI -----------------------------------------------------------
  { name: 'bookmark', cat: 'General', kind: 'solid', kw: ['save', 'tag'] },
  { name: 'flag', cat: 'General', kind: 'solid', kw: ['report', 'mark'] },
  { name: 'tag', cat: 'General', kind: 'solid', kw: ['label', 'price'] },
  { name: 'tags', cat: 'General', kind: 'solid', kw: ['labels', 'categories'] },
  { name: 'paperclip', cat: 'General', kind: 'solid', kw: ['attach', 'attachment', 'clip'] },
  { name: 'link', cat: 'General', kind: 'solid', kw: ['url', 'chain', 'connect'] },
  { name: 'link-slash', cat: 'General', kind: 'solid', kw: ['disconnect', 'break', 'unlink'] },
  { name: 'share-nodes', cat: 'General', kind: 'solid', kw: ['share', 'network'] },
  { name: 'download', cat: 'General', kind: 'solid', kw: ['save', 'export'] },
  { name: 'upload', cat: 'General', kind: 'solid', kw: ['import', 'send'] },
  { name: 'eye-slash', cat: 'General', kind: 'solid', kw: ['hide', 'invisible'] },
  { name: 'unlock', cat: 'General', kind: 'solid', kw: ['open', 'secure'] },
  { name: 'key', cat: 'General', kind: 'solid', kw: ['password', 'access'] },
  { name: 'gears', cat: 'General', kind: 'solid', kw: ['settings', 'mechanics'] },
  { name: 'sliders', cat: 'General', kind: 'solid', kw: ['controls', 'mixer', 'adjust'] },
  { name: 'filter', cat: 'General', kind: 'solid', kw: ['funnel', 'narrow'] },
  { name: 'bars', cat: 'General', kind: 'solid', kw: ['menu', 'hamburger', 'navicon'] },
  { name: 'list', cat: 'General', kind: 'solid', kw: ['bullet', 'menu'] },
  { name: 'list-check', cat: 'General', kind: 'solid', kw: ['todo', 'tasks', 'checklist'] },
  { name: 'grip', cat: 'General', kind: 'solid', kw: ['drag', 'handle', 'reorder'] },
  { name: 'ellipsis', cat: 'General', kind: 'solid', kw: ['more', 'menu', 'options'] },
  { name: 'ellipsis-vertical', cat: 'General', kind: 'solid', kw: ['more', 'menu', 'options'] },
  { name: 'expand', cat: 'General', kind: 'solid', kw: ['fullscreen', 'enlarge'] },
  { name: 'compress', cat: 'General', kind: 'solid', kw: ['shrink', 'minimize'] },
  { name: 'rotate', cat: 'General', kind: 'solid', kw: ['refresh', 'reload', 'sync'] },
  { name: 'arrows-rotate', cat: 'General', kind: 'solid', kw: ['refresh', 'reload', 'sync'] },
  { name: 'pen-nib', cat: 'General', kind: 'solid', kw: ['write', 'draw'] },
  { name: 'pencil', cat: 'General', kind: 'solid', kw: ['edit', 'write'] },
  { name: 'highlighter', cat: 'General', kind: 'solid', kw: ['marker', 'edit'] },
  { name: 'eraser', cat: 'General', kind: 'solid', kw: ['delete', 'remove', 'clear'] },
  { name: 'magnet', cat: 'General', kind: 'solid', kw: ['attract'] },
  { name: 'thumbtack', cat: 'General', kind: 'solid', kw: ['pin', 'attach'] },
  { name: 'palette', cat: 'General', kind: 'solid', kw: ['color', 'paint', 'art'] },
  { name: 'paintbrush', cat: 'General', kind: 'solid', kw: ['paint', 'brush', 'art'] },
  { name: 'wrench', cat: 'General', kind: 'solid', kw: ['tool', 'fix', 'settings'] },
  { name: 'screwdriver-wrench', cat: 'General', kind: 'solid', kw: ['tools', 'maintenance'] },
  { name: 'hammer', cat: 'General', kind: 'solid', kw: ['tool', 'build', 'fix'] },
  { name: 'broom', cat: 'General', kind: 'solid', kw: ['clean', 'sweep'] },
  { name: 'qrcode', cat: 'General', kind: 'solid', kw: ['barcode', 'scan', 'qr'] },
  { name: 'barcode', cat: 'General', kind: 'solid', kw: ['scan', 'product'] },
  { name: 'cube', cat: 'General', kind: 'solid', kw: ['box', '3d'] },
  { name: 'boxes-stacked', cat: 'General', kind: 'solid', kw: ['inventory', 'storage'] },

  // Arrows & Navigation --------------------------------------------------
  { name: 'arrow-up', cat: 'Arrows', kind: 'solid' },
  { name: 'arrow-down', cat: 'Arrows', kind: 'solid' },
  { name: 'arrow-left', cat: 'Arrows', kind: 'solid' },
  { name: 'arrow-right', cat: 'Arrows', kind: 'solid' },
  { name: 'arrow-up-right-from-square', cat: 'Arrows', kind: 'solid', kw: ['external', 'open', 'link'] },
  { name: 'arrow-right-from-bracket', cat: 'Arrows', kind: 'solid', kw: ['logout', 'signout', 'exit'] },
  { name: 'arrow-right-to-bracket', cat: 'Arrows', kind: 'solid', kw: ['login', 'signin', 'enter'] },
  { name: 'arrow-up-from-bracket', cat: 'Arrows', kind: 'solid', kw: ['share', 'send'] },
  { name: 'chevron-up', cat: 'Arrows', kind: 'solid' },
  { name: 'chevron-down', cat: 'Arrows', kind: 'solid' },
  { name: 'chevron-left', cat: 'Arrows', kind: 'solid', kw: ['back', 'previous'] },
  { name: 'chevron-right', cat: 'Arrows', kind: 'solid', kw: ['next', 'forward'] },
  { name: 'angle-up', cat: 'Arrows', kind: 'solid' },
  { name: 'angle-down', cat: 'Arrows', kind: 'solid' },
  { name: 'angle-left', cat: 'Arrows', kind: 'solid' },
  { name: 'angle-right', cat: 'Arrows', kind: 'solid' },
  { name: 'caret-up', cat: 'Arrows', kind: 'solid' },
  { name: 'caret-down', cat: 'Arrows', kind: 'solid' },
  { name: 'caret-left', cat: 'Arrows', kind: 'solid' },
  { name: 'caret-right', cat: 'Arrows', kind: 'solid' },
  { name: 'rotate-left', cat: 'Arrows', kind: 'solid', kw: ['undo', 'back'] },
  { name: 'rotate-right', cat: 'Arrows', kind: 'solid', kw: ['redo', 'forward'] },
  { name: 'arrows-up-down', cat: 'Arrows', kind: 'solid', kw: ['vertical', 'resize'] },
  { name: 'arrows-left-right', cat: 'Arrows', kind: 'solid', kw: ['horizontal', 'resize'] },
  { name: 'up-down-left-right', cat: 'Arrows', kind: 'solid', kw: ['move', 'drag'] },
  { name: 'location-arrow', cat: 'Arrows', kind: 'solid', kw: ['direction', 'navigation'] },

  // Communication --------------------------------------------------------
  { name: 'phone', cat: 'Communication', kind: 'solid', kw: ['call', 'telephone'] },
  { name: 'phone-flip', cat: 'Communication', kind: 'solid', kw: ['call', 'phone'] },
  { name: 'comment', cat: 'Communication', kind: 'solid', kw: ['chat', 'message', 'speech'] },
  { name: 'comments', cat: 'Communication', kind: 'solid', kw: ['chat', 'discussion'] },
  { name: 'comment-dots', cat: 'Communication', kind: 'solid', kw: ['chat', 'typing'] },
  { name: 'message', cat: 'Communication', kind: 'solid', kw: ['chat', 'sms', 'reply'] },
  { name: 'at', cat: 'Communication', kind: 'solid', kw: ['email', 'mention'] },
  { name: 'paper-plane', cat: 'Communication', kind: 'solid', kw: ['send', 'submit'] },
  { name: 'inbox', cat: 'Communication', kind: 'solid', kw: ['mail', 'messages'] },
  { name: 'rss', cat: 'Communication', kind: 'solid', kw: ['feed', 'subscribe'] },
  { name: 'bullhorn', cat: 'Communication', kind: 'solid', kw: ['announce', 'megaphone'] },
  { name: 'tower-broadcast', cat: 'Communication', kind: 'solid', kw: ['signal', 'tower', 'radio'] },

  // Time & Date ----------------------------------------------------------
  { name: 'clock', cat: 'Time & Date', kind: 'solid', kw: ['time', 'watch'] },
  { name: 'calendar', cat: 'Time & Date', kind: 'solid', kw: ['date', 'schedule'] },
  { name: 'calendar-day', cat: 'Time & Date', kind: 'solid', kw: ['today'] },
  { name: 'calendar-days', cat: 'Time & Date', kind: 'solid', kw: ['month'] },
  { name: 'calendar-week', cat: 'Time & Date', kind: 'solid', kw: ['week'] },
  { name: 'calendar-check', cat: 'Time & Date', kind: 'solid', kw: ['scheduled', 'done', 'event'] },
  { name: 'calendar-xmark', cat: 'Time & Date', kind: 'solid', kw: ['canceled', 'missed'] },
  { name: 'calendar-plus', cat: 'Time & Date', kind: 'solid', kw: ['add event'] },
  { name: 'hourglass', cat: 'Time & Date', kind: 'solid', kw: ['wait', 'time'] },
  { name: 'hourglass-half', cat: 'Time & Date', kind: 'solid', kw: ['wait', 'progress'] },
  { name: 'hourglass-end', cat: 'Time & Date', kind: 'solid', kw: ['done', 'expired'] },
  { name: 'stopwatch', cat: 'Time & Date', kind: 'solid', kw: ['timer', 'time'] },
  { name: 'business-time', cat: 'Time & Date', kind: 'solid', kw: ['work', 'office hours'] },
  { name: 'clock-rotate-left', cat: 'Time & Date', kind: 'solid', kw: ['history', 'past', 'rewind', 'undo'] },

  // Weather --------------------------------------------------------------
  { name: 'sun', cat: 'Weather', kind: 'solid', kw: ['day', 'bright', 'light'] },
  { name: 'moon', cat: 'Weather', kind: 'solid', kw: ['night', 'dark'] },
  { name: 'cloud-sun', cat: 'Weather', kind: 'solid', kw: ['partly cloudy', 'day'] },
  { name: 'cloud-moon', cat: 'Weather', kind: 'solid', kw: ['partly cloudy', 'night'] },
  { name: 'cloud-rain', cat: 'Weather', kind: 'solid', kw: ['rain', 'showers'] },
  { name: 'cloud-showers-heavy', cat: 'Weather', kind: 'solid', kw: ['heavy rain', 'storm'] },
  { name: 'cloud-bolt', cat: 'Weather', kind: 'solid', kw: ['thunderstorm', 'lightning'] },
  { name: 'cloud-sun-rain', cat: 'Weather', kind: 'solid' },
  { name: 'cloud-moon-rain', cat: 'Weather', kind: 'solid' },
  { name: 'snowflake', cat: 'Weather', kind: 'solid', kw: ['snow', 'cold', 'winter'] },
  { name: 'wind', cat: 'Weather', kind: 'solid', kw: ['breeze', 'air'] },
  { name: 'temperature-high', cat: 'Weather', kind: 'solid', kw: ['hot', 'thermometer'] },
  { name: 'temperature-low', cat: 'Weather', kind: 'solid', kw: ['cold', 'thermometer'] },
  { name: 'droplet', cat: 'Weather', kind: 'solid', kw: ['water', 'rain', 'humidity'] },
  { name: 'umbrella', cat: 'Weather', kind: 'solid', kw: ['rain', 'cover'] },
  { name: 'smog', cat: 'Weather', kind: 'solid', kw: ['fog', 'haze', 'pollution'] },
  { name: 'tornado', cat: 'Weather', kind: 'solid', kw: ['storm', 'twister'] },
  { name: 'fire', cat: 'Weather', kind: 'solid', kw: ['flame', 'hot'] },
  { name: 'icicles', cat: 'Weather', kind: 'solid', kw: ['cold', 'frozen'] },
  { name: 'rainbow', cat: 'Weather', kind: 'solid' },

  // Devices --------------------------------------------------------------
  { name: 'desktop', cat: 'Devices', kind: 'solid', kw: ['computer', 'pc', 'monitor'] },
  { name: 'laptop', cat: 'Devices', kind: 'solid', kw: ['computer', 'notebook'] },
  { name: 'mobile-screen', cat: 'Devices', kind: 'solid', kw: ['phone', 'cell'] },
  { name: 'tablet-screen-button', cat: 'Devices', kind: 'solid', kw: ['ipad', 'pad'] },
  { name: 'tv', cat: 'Devices', kind: 'solid', kw: ['television', 'screen'] },
  { name: 'display', cat: 'Devices', kind: 'solid', kw: ['monitor', 'screen'] },
  { name: 'headphones', cat: 'Devices', kind: 'solid', kw: ['audio', 'music'] },
  { name: 'microphone', cat: 'Devices', kind: 'solid', kw: ['mic', 'audio', 'record'] },
  { name: 'microphone-slash', cat: 'Devices', kind: 'solid', kw: ['mute', 'mic off'] },
  { name: 'camera', cat: 'Devices', kind: 'solid', kw: ['photo'] },
  { name: 'video', cat: 'Devices', kind: 'solid', kw: ['camera', 'record'] },
  { name: 'gamepad', cat: 'Devices', kind: 'solid', kw: ['controller', 'gaming'] },
  { name: 'keyboard', cat: 'Devices', kind: 'solid', kw: ['typing'] },
  { name: 'computer-mouse', cat: 'Devices', kind: 'solid', kw: ['cursor', 'pointer'] },
  { name: 'server', cat: 'Devices', kind: 'solid', kw: ['hosting', 'database'] },
  { name: 'database', cat: 'Devices', kind: 'solid', kw: ['storage', 'data'] },
  { name: 'hard-drive', cat: 'Devices', kind: 'solid', kw: ['storage', 'disk', 'hdd'] },
  { name: 'plug', cat: 'Devices', kind: 'solid', kw: ['power', 'electric'] },
  { name: 'power-off', cat: 'Devices', kind: 'solid', kw: ['shutdown', 'switch'] },
  { name: 'wifi', cat: 'Devices', kind: 'solid', kw: ['network', 'wireless', 'internet'] },
  { name: 'signal', cat: 'Devices', kind: 'solid', kw: ['cellular', 'bars', 'reception'] },
  { name: 'satellite-dish', cat: 'Devices', kind: 'solid', kw: ['receiver', 'broadcast'] },
  { name: 'robot', cat: 'Devices', kind: 'solid', kw: ['ai', 'bot', 'automation'] },
  { name: 'memory', cat: 'Devices', kind: 'solid', kw: ['ram', 'chip'] },
  { name: 'microchip', cat: 'Devices', kind: 'solid', kw: ['cpu', 'processor'] },
  { name: 'battery-full', cat: 'Devices', kind: 'solid', kw: ['power', 'charge'] },
  { name: 'battery-empty', cat: 'Devices', kind: 'solid', kw: ['low power'] },
  { name: 'plug-circle-bolt', cat: 'Devices', kind: 'solid', kw: ['charging', 'fast charge'] },

  // Files ----------------------------------------------------------------
  { name: 'file', cat: 'Files', kind: 'solid', kw: ['document'] },
  { name: 'file-lines', cat: 'Files', kind: 'solid', kw: ['document', 'text'] },
  { name: 'file-pdf', cat: 'Files', kind: 'solid' },
  { name: 'file-image', cat: 'Files', kind: 'solid', kw: ['picture'] },
  { name: 'file-video', cat: 'Files', kind: 'solid', kw: ['movie'] },
  { name: 'file-audio', cat: 'Files', kind: 'solid', kw: ['sound', 'music'] },
  { name: 'file-zipper', cat: 'Files', kind: 'solid', kw: ['archive', 'compressed', 'zip'] },
  { name: 'file-code', cat: 'Files', kind: 'solid', kw: ['source'] },
  { name: 'file-csv', cat: 'Files', kind: 'solid', kw: ['spreadsheet'] },
  { name: 'file-excel', cat: 'Files', kind: 'solid', kw: ['spreadsheet', 'xls'] },
  { name: 'file-word', cat: 'Files', kind: 'solid', kw: ['doc'] },
  { name: 'file-powerpoint', cat: 'Files', kind: 'solid', kw: ['ppt', 'presentation'] },
  { name: 'file-arrow-down', cat: 'Files', kind: 'solid', kw: ['download', 'save'] },
  { name: 'file-arrow-up', cat: 'Files', kind: 'solid', kw: ['upload'] },
  { name: 'folder', cat: 'Files', kind: 'solid', kw: ['directory'] },
  { name: 'folder-open', cat: 'Files', kind: 'solid' },
  { name: 'folder-tree', cat: 'Files', kind: 'solid', kw: ['hierarchy', 'directory'] },
  { name: 'book', cat: 'Files', kind: 'solid' },
  { name: 'book-open', cat: 'Files', kind: 'solid' },
  { name: 'newspaper', cat: 'Files', kind: 'solid', kw: ['news', 'paper'] },
  { name: 'note-sticky', cat: 'Files', kind: 'solid', kw: ['note', 'memo'] },
  { name: 'clipboard', cat: 'Files', kind: 'solid', kw: ['copy', 'paste'] },

  // Media ----------------------------------------------------------------
  { name: 'play', cat: 'Media', kind: 'solid' },
  { name: 'pause', cat: 'Media', kind: 'solid' },
  { name: 'stop', cat: 'Media', kind: 'solid' },
  { name: 'forward', cat: 'Media', kind: 'solid', kw: ['next'] },
  { name: 'backward', cat: 'Media', kind: 'solid', kw: ['previous'] },
  { name: 'forward-fast', cat: 'Media', kind: 'solid', kw: ['skip', 'next'] },
  { name: 'backward-fast', cat: 'Media', kind: 'solid', kw: ['skip', 'previous'] },
  { name: 'forward-step', cat: 'Media', kind: 'solid', kw: ['next track'] },
  { name: 'backward-step', cat: 'Media', kind: 'solid', kw: ['previous track'] },
  { name: 'volume-high', cat: 'Media', kind: 'solid', kw: ['loud', 'sound'] },
  { name: 'volume-low', cat: 'Media', kind: 'solid', kw: ['quiet', 'sound'] },
  { name: 'volume-xmark', cat: 'Media', kind: 'solid', kw: ['mute', 'silent'] },
  { name: 'music', cat: 'Media', kind: 'solid', kw: ['note', 'song'] },
  { name: 'film', cat: 'Media', kind: 'solid', kw: ['movie', 'video'] },
  { name: 'image', cat: 'Media', kind: 'solid', kw: ['picture', 'photo'] },
  { name: 'images', cat: 'Media', kind: 'solid', kw: ['gallery', 'photos'] },
  { name: 'photo-film', cat: 'Media', kind: 'solid', kw: ['gallery', 'media'] },
  { name: 'podcast', cat: 'Media', kind: 'solid', kw: ['audio', 'broadcast'] },
  { name: 'shuffle', cat: 'Media', kind: 'solid', kw: ['random'] },
  { name: 'repeat', cat: 'Media', kind: 'solid', kw: ['loop'] },
  { name: 'closed-captioning', cat: 'Media', kind: 'solid', kw: ['cc', 'subtitles'] },

  // Shopping -------------------------------------------------------------
  { name: 'cart-shopping', cat: 'Shopping', kind: 'solid', kw: ['cart', 'buy', 'checkout'] },
  { name: 'cart-plus', cat: 'Shopping', kind: 'solid', kw: ['add to cart'] },
  { name: 'bag-shopping', cat: 'Shopping', kind: 'solid', kw: ['bag', 'buy'] },
  { name: 'store', cat: 'Shopping', kind: 'solid', kw: ['shop', 'market'] },
  { name: 'credit-card', cat: 'Shopping', kind: 'solid', kw: ['payment', 'visa', 'card'] },
  { name: 'dollar-sign', cat: 'Shopping', kind: 'solid', kw: ['money', 'usd', 'price'] },
  { name: 'euro-sign', cat: 'Shopping', kind: 'solid', kw: ['money', 'eur'] },
  { name: 'sterling-sign', cat: 'Shopping', kind: 'solid', kw: ['money', 'gbp', 'pound'] },
  { name: 'yen-sign', cat: 'Shopping', kind: 'solid', kw: ['money', 'jpy'] },
  { name: 'money-bill', cat: 'Shopping', kind: 'solid', kw: ['cash', 'money'] },
  { name: 'money-bill-wave', cat: 'Shopping', kind: 'solid', kw: ['cash', 'money'] },
  { name: 'receipt', cat: 'Shopping', kind: 'solid', kw: ['bill', 'invoice'] },
  { name: 'gift', cat: 'Shopping', kind: 'solid', kw: ['present', 'reward'] },
  { name: 'ticket', cat: 'Shopping', kind: 'solid', kw: ['pass', 'event'] },
  { name: 'percent', cat: 'Shopping', kind: 'solid', kw: ['discount', 'sale'] },
  { name: 'sack-dollar', cat: 'Shopping', kind: 'solid', kw: ['money bag', 'cash'] },
  { name: 'piggy-bank', cat: 'Shopping', kind: 'solid', kw: ['savings', 'money'] },
  { name: 'wallet', cat: 'Shopping', kind: 'solid', kw: ['money', 'pay'] },
  { name: 'hand-holding-dollar', cat: 'Shopping', kind: 'solid', kw: ['donate', 'pay'] },

  // Travel ---------------------------------------------------------------
  { name: 'car', cat: 'Travel', kind: 'solid', kw: ['vehicle', 'auto'] },
  { name: 'taxi', cat: 'Travel', kind: 'solid', kw: ['cab', 'uber'] },
  { name: 'bus', cat: 'Travel', kind: 'solid' },
  { name: 'train', cat: 'Travel', kind: 'solid', kw: ['rail'] },
  { name: 'train-subway', cat: 'Travel', kind: 'solid', kw: ['metro', 'underground'] },
  { name: 'plane', cat: 'Travel', kind: 'solid', kw: ['flight', 'airplane'] },
  { name: 'plane-arrival', cat: 'Travel', kind: 'solid', kw: ['landing'] },
  { name: 'plane-departure', cat: 'Travel', kind: 'solid', kw: ['takeoff'] },
  { name: 'ship', cat: 'Travel', kind: 'solid', kw: ['boat', 'vessel'] },
  { name: 'bicycle', cat: 'Travel', kind: 'solid', kw: ['bike', 'cycling'] },
  { name: 'motorcycle', cat: 'Travel', kind: 'solid', kw: ['bike', 'motorbike'] },
  { name: 'truck', cat: 'Travel', kind: 'solid', kw: ['delivery', 'lorry'] },
  { name: 'truck-fast', cat: 'Travel', kind: 'solid', kw: ['shipping', 'delivery'] },
  { name: 'suitcase', cat: 'Travel', kind: 'solid', kw: ['luggage', 'bag'] },
  { name: 'suitcase-rolling', cat: 'Travel', kind: 'solid', kw: ['luggage', 'travel'] },
  { name: 'road', cat: 'Travel', kind: 'solid', kw: ['street', 'highway'] },
  { name: 'route', cat: 'Travel', kind: 'solid', kw: ['path', 'directions'] },
  { name: 'map', cat: 'Travel', kind: 'solid' },
  { name: 'map-location-dot', cat: 'Travel', kind: 'solid', kw: ['location', 'gps', 'find'] },
  { name: 'location-dot', cat: 'Travel', kind: 'solid', kw: ['marker', 'pin', 'place', 'gps'] },
  { name: 'location-pin', cat: 'Travel', kind: 'solid', kw: ['marker', 'place'] },
  { name: 'location-crosshairs', cat: 'Travel', kind: 'solid', kw: ['gps', 'target'] },
  { name: 'compass', cat: 'Travel', kind: 'solid', kw: ['navigation', 'direction'] },
  { name: 'anchor', cat: 'Travel', kind: 'solid', kw: ['ship', 'maritime'] },
  { name: 'gas-pump', cat: 'Travel', kind: 'solid', kw: ['fuel', 'petrol'] },
  { name: 'traffic-light', cat: 'Travel', kind: 'solid', kw: ['signal'] },
  { name: 'square-parking', cat: 'Travel', kind: 'solid', kw: ['parking', 'p sign', 'park'] },
  { name: 'helicopter', cat: 'Travel', kind: 'solid' },

  // Food -----------------------------------------------------------------
  { name: 'utensils', cat: 'Food', kind: 'solid', kw: ['fork', 'knife', 'eat', 'restaurant'] },
  { name: 'mug-hot', cat: 'Food', kind: 'solid', kw: ['coffee', 'tea', 'drink'] },
  { name: 'mug-saucer', cat: 'Food', kind: 'solid', kw: ['coffee', 'tea'] },
  { name: 'glass-water', cat: 'Food', kind: 'solid', kw: ['drink', 'hydrate'] },
  { name: 'beer-mug-empty', cat: 'Food', kind: 'solid', kw: ['beer', 'drink'] },
  { name: 'wine-glass', cat: 'Food', kind: 'solid', kw: ['wine', 'drink'] },
  { name: 'martini-glass', cat: 'Food', kind: 'solid', kw: ['cocktail', 'drink'] },
  { name: 'champagne-glasses', cat: 'Food', kind: 'solid', kw: ['toast', 'celebration'] },
  { name: 'ice-cream', cat: 'Food', kind: 'solid', kw: ['dessert'] },
  { name: 'pizza-slice', cat: 'Food', kind: 'solid' },
  { name: 'burger', cat: 'Food', kind: 'solid', kw: ['hamburger', 'food'] },
  { name: 'hotdog', cat: 'Food', kind: 'solid' },
  { name: 'cake-candles', cat: 'Food', kind: 'solid', kw: ['birthday', 'cake'] },
  { name: 'cookie', cat: 'Food', kind: 'solid' },
  { name: 'apple-whole', cat: 'Food', kind: 'solid', kw: ['fruit'] },
  { name: 'lemon', cat: 'Food', kind: 'solid', kw: ['fruit', 'citrus'] },
  { name: 'carrot', cat: 'Food', kind: 'solid', kw: ['vegetable'] },
  { name: 'drumstick-bite', cat: 'Food', kind: 'solid', kw: ['chicken', 'meat'] },
  { name: 'fish', cat: 'Food', kind: 'solid', kw: ['seafood'] },
  { name: 'bowl-rice', cat: 'Food', kind: 'solid' },
  { name: 'bowl-food', cat: 'Food', kind: 'solid', kw: ['meal', 'eat'] },
  { name: 'bread-slice', cat: 'Food', kind: 'solid' },
  { name: 'egg', cat: 'Food', kind: 'solid' },
  { name: 'cheese', cat: 'Food', kind: 'solid' },
  { name: 'pepper-hot', cat: 'Food', kind: 'solid', kw: ['chili', 'spicy'] },

  // Sports ---------------------------------------------------------------
  { name: 'futbol', cat: 'Sports', kind: 'solid', kw: ['soccer', 'football'] },
  { name: 'basketball', cat: 'Sports', kind: 'solid' },
  { name: 'baseball', cat: 'Sports', kind: 'solid' },
  { name: 'football', cat: 'Sports', kind: 'solid', kw: ['american football'] },
  { name: 'volleyball', cat: 'Sports', kind: 'solid' },
  { name: 'golf-ball-tee', cat: 'Sports', kind: 'solid', kw: ['golf'] },
  { name: 'table-tennis-paddle-ball', cat: 'Sports', kind: 'solid', kw: ['ping pong'] },
  { name: 'hockey-puck', cat: 'Sports', kind: 'solid' },
  { name: 'dumbbell', cat: 'Sports', kind: 'solid', kw: ['gym', 'workout', 'weight'] },
  { name: 'person-running', cat: 'Sports', kind: 'solid', kw: ['run', 'exercise'] },
  { name: 'person-biking', cat: 'Sports', kind: 'solid', kw: ['cycling'] },
  { name: 'person-swimming', cat: 'Sports', kind: 'solid', kw: ['swim'] },
  { name: 'person-skiing', cat: 'Sports', kind: 'solid', kw: ['ski'] },
  { name: 'person-hiking', cat: 'Sports', kind: 'solid', kw: ['hike', 'walk'] },
  { name: 'medal', cat: 'Sports', kind: 'solid', kw: ['award', 'win'] },
  { name: 'trophy', cat: 'Sports', kind: 'solid', kw: ['award', 'win', 'champion'] },
  { name: 'ranking-star', cat: 'Sports', kind: 'solid', kw: ['rank', 'leaderboard'] },

  // Charts ---------------------------------------------------------------
  { name: 'chart-simple', cat: 'Charts', kind: 'solid', kw: ['bars', 'graph'] },
  { name: 'chart-bar', cat: 'Charts', kind: 'solid', kw: ['graph', 'analytics'] },
  { name: 'chart-line', cat: 'Charts', kind: 'solid', kw: ['graph', 'trend', 'analytics'] },
  { name: 'chart-pie', cat: 'Charts', kind: 'solid', kw: ['graph', 'analytics'] },
  { name: 'chart-area', cat: 'Charts', kind: 'solid', kw: ['graph'] },
  { name: 'chart-column', cat: 'Charts', kind: 'solid', kw: ['graph', 'bars'] },
  { name: 'square-poll-vertical', cat: 'Charts', kind: 'solid', kw: ['poll', 'vote', 'bars'] },
  { name: 'square-poll-horizontal', cat: 'Charts', kind: 'solid', kw: ['poll', 'vote', 'bars'] },
  { name: 'table', cat: 'Charts', kind: 'solid', kw: ['grid', 'data'] },
  { name: 'table-cells', cat: 'Charts', kind: 'solid', kw: ['grid', 'cells'] },
  { name: 'table-list', cat: 'Charts', kind: 'solid', kw: ['rows', 'list'] },
  { name: 'arrow-trend-up', cat: 'Charts', kind: 'solid', kw: ['rise', 'gain', 'increase'] },
  { name: 'arrow-trend-down', cat: 'Charts', kind: 'solid', kw: ['fall', 'loss', 'decrease'] },

  // Security -------------------------------------------------------------
  { name: 'shield', cat: 'Security', kind: 'solid', kw: ['protect', 'safe'] },
  { name: 'shield-halved', cat: 'Security', kind: 'solid', kw: ['protect', 'safe', 'security'] },
  { name: 'fingerprint', cat: 'Security', kind: 'solid', kw: ['biometric', 'identity'] },
  { name: 'user-shield', cat: 'Security', kind: 'solid', kw: ['protect', 'admin'] },
  { name: 'user-secret', cat: 'Security', kind: 'solid', kw: ['anonymous', 'spy'] },
  { name: 'user-lock', cat: 'Security', kind: 'solid', kw: ['private'] },
  { name: 'mask', cat: 'Security', kind: 'solid', kw: ['anonymous', 'hide'] },
  { name: 'ban', cat: 'Security', kind: 'solid', kw: ['block', 'forbidden', 'no'] },
  { name: 'shield-virus', cat: 'Security', kind: 'solid', kw: ['antivirus'] },

  // Symbols --------------------------------------------------------------
  { name: 'fire-flame-curved', cat: 'Symbols', kind: 'solid', kw: ['hot', 'streak'] },
  { name: 'bolt', cat: 'Symbols', kind: 'solid', kw: ['lightning', 'fast', 'flash'] },
  { name: 'leaf', cat: 'Symbols', kind: 'solid', kw: ['nature', 'plant', 'eco'] },
  { name: 'seedling', cat: 'Symbols', kind: 'solid', kw: ['plant', 'grow'] },
  { name: 'tree', cat: 'Symbols', kind: 'solid', kw: ['nature'] },
  { name: 'bug', cat: 'Symbols', kind: 'solid', kw: ['error', 'insect'] },
  { name: 'ghost', cat: 'Symbols', kind: 'solid', kw: ['halloween'] },
  { name: 'skull', cat: 'Symbols', kind: 'solid', kw: ['death', 'danger'] },
  { name: 'crown', cat: 'Symbols', kind: 'solid', kw: ['king', 'queen', 'royal'] },
  { name: 'gem', cat: 'Symbols', kind: 'solid', kw: ['diamond', 'jewel'] },
  { name: 'brain', cat: 'Symbols', kind: 'solid', kw: ['thinking', 'mind'] },
  { name: 'dragon', cat: 'Symbols', kind: 'solid' },
  { name: 'infinity', cat: 'Symbols', kind: 'solid', kw: ['unlimited', 'forever'] },
  { name: 'recycle', cat: 'Symbols', kind: 'solid', kw: ['eco', 'environment'] },
  { name: 'biohazard', cat: 'Symbols', kind: 'solid', kw: ['danger', 'hazmat'] },
  { name: 'radiation', cat: 'Symbols', kind: 'solid', kw: ['nuclear', 'danger'] },
  { name: 'atom', cat: 'Symbols', kind: 'solid', kw: ['science', 'physics'] },
  { name: 'virus', cat: 'Symbols', kind: 'solid', kw: ['covid', 'disease'] },
  { name: 'paw', cat: 'Symbols', kind: 'solid', kw: ['pet', 'animal'] },
  { name: 'cat', cat: 'Symbols', kind: 'solid' },
  { name: 'dog', cat: 'Symbols', kind: 'solid' },
  { name: 'feather', cat: 'Symbols', kind: 'solid', kw: ['light', 'bird'] },
  { name: 'circle', cat: 'Symbols', kind: 'solid' },
  { name: 'square', cat: 'Symbols', kind: 'solid' },
  { name: 'diamond', cat: 'Symbols', kind: 'solid' },
  { name: 'heart-circle-check', cat: 'Symbols', kind: 'solid' },

  // People ---------------------------------------------------------------
  { name: 'users', cat: 'People', kind: 'solid', kw: ['group', 'people'] },
  { name: 'user-group', cat: 'People', kind: 'solid', kw: ['team', 'members'] },
  { name: 'circle-user', cat: 'People', kind: 'solid', kw: ['profile', 'avatar', 'user-circle'] },
  { name: 'user-tie', cat: 'People', kind: 'solid', kw: ['business', 'manager'] },
  { name: 'user-doctor', cat: 'People', kind: 'solid', kw: ['medical', 'health'] },
  { name: 'user-graduate', cat: 'People', kind: 'solid', kw: ['student', 'school'] },
  { name: 'user-nurse', cat: 'People', kind: 'solid', kw: ['medical', 'health'] },
  { name: 'user-astronaut', cat: 'People', kind: 'solid', kw: ['space'] },
  { name: 'user-ninja', cat: 'People', kind: 'solid' },
  { name: 'baby', cat: 'People', kind: 'solid', kw: ['infant', 'kid'] },
  { name: 'child', cat: 'People', kind: 'solid', kw: ['kid'] },
  { name: 'hand', cat: 'People', kind: 'solid' },
  { name: 'hand-fist', cat: 'People', kind: 'solid', kw: ['punch'] },
  { name: 'hand-peace', cat: 'People', kind: 'solid', kw: ['victory'] },
  { name: 'hand-spock', cat: 'People', kind: 'solid', kw: ['vulcan', 'star trek'] },
  { name: 'thumbs-up', cat: 'People', kind: 'solid', kw: ['like', 'approve'] },
  { name: 'thumbs-down', cat: 'People', kind: 'solid', kw: ['dislike'] },
  { name: 'face-smile', cat: 'People', kind: 'solid', kw: ['happy', 'emoji'] },
  { name: 'face-frown', cat: 'People', kind: 'solid', kw: ['sad', 'emoji'] },
  { name: 'face-meh', cat: 'People', kind: 'solid', kw: ['neutral', 'emoji'] },
  { name: 'face-grin', cat: 'People', kind: 'solid', kw: ['happy', 'emoji'] },
  { name: 'face-laugh', cat: 'People', kind: 'solid', kw: ['lol', 'emoji'] },
  { name: 'face-angry', cat: 'People', kind: 'solid', kw: ['mad', 'emoji'] },
  { name: 'face-sad-tear', cat: 'People', kind: 'solid', kw: ['crying', 'emoji'] },
  { name: 'face-surprise', cat: 'People', kind: 'solid', kw: ['shock', 'emoji'] },

  // Brands (free) --------------------------------------------------------
  { name: 'github', cat: 'Brands', kind: 'brands', kw: ['git', 'code'] },
  { name: 'gitlab', cat: 'Brands', kind: 'brands', kw: ['git'] },
  { name: 'bitbucket', cat: 'Brands', kind: 'brands', kw: ['git'] },
  { name: 'google', cat: 'Brands', kind: 'brands' },
  { name: 'facebook', cat: 'Brands', kind: 'brands' },
  { name: 'facebook-f', cat: 'Brands', kind: 'brands' },
  { name: 'twitter', cat: 'Brands', kind: 'brands' },
  { name: 'x-twitter', cat: 'Brands', kind: 'brands', kw: ['x', 'twitter'] },
  { name: 'instagram', cat: 'Brands', kind: 'brands' },
  { name: 'tiktok', cat: 'Brands', kind: 'brands' },
  { name: 'youtube', cat: 'Brands', kind: 'brands' },
  { name: 'linkedin', cat: 'Brands', kind: 'brands' },
  { name: 'linkedin-in', cat: 'Brands', kind: 'brands' },
  { name: 'slack', cat: 'Brands', kind: 'brands' },
  { name: 'discord', cat: 'Brands', kind: 'brands' },
  { name: 'reddit', cat: 'Brands', kind: 'brands' },
  { name: 'whatsapp', cat: 'Brands', kind: 'brands' },
  { name: 'telegram', cat: 'Brands', kind: 'brands' },
  { name: 'snapchat', cat: 'Brands', kind: 'brands' },
  { name: 'pinterest', cat: 'Brands', kind: 'brands' },
  { name: 'twitch', cat: 'Brands', kind: 'brands' },
  { name: 'spotify', cat: 'Brands', kind: 'brands' },
  { name: 'apple', cat: 'Brands', kind: 'brands' },
  { name: 'apple-pay', cat: 'Brands', kind: 'brands' },
  { name: 'google-pay', cat: 'Brands', kind: 'brands' },
  { name: 'paypal', cat: 'Brands', kind: 'brands' },
  { name: 'stripe', cat: 'Brands', kind: 'brands' },
  { name: 'cc-visa', cat: 'Brands', kind: 'brands', kw: ['credit card'] },
  { name: 'cc-mastercard', cat: 'Brands', kind: 'brands', kw: ['credit card'] },
  { name: 'cc-amex', cat: 'Brands', kind: 'brands', kw: ['credit card', 'american express'] },
  { name: 'cc-discover', cat: 'Brands', kind: 'brands', kw: ['credit card'] },
  { name: 'amazon', cat: 'Brands', kind: 'brands' },
  { name: 'ebay', cat: 'Brands', kind: 'brands' },
  { name: 'shopify', cat: 'Brands', kind: 'brands' },
  { name: 'bitcoin', cat: 'Brands', kind: 'brands', kw: ['btc', 'crypto'] },
  { name: 'ethereum', cat: 'Brands', kind: 'brands', kw: ['eth', 'crypto'] },
  { name: 'microsoft', cat: 'Brands', kind: 'brands' },
  { name: 'windows', cat: 'Brands', kind: 'brands' },
  { name: 'android', cat: 'Brands', kind: 'brands' },
  { name: 'linux', cat: 'Brands', kind: 'brands' },
  { name: 'ubuntu', cat: 'Brands', kind: 'brands' },
  { name: 'redhat', cat: 'Brands', kind: 'brands' },
  { name: 'docker', cat: 'Brands', kind: 'brands' },
  { name: 'react', cat: 'Brands', kind: 'brands' },
  { name: 'angular', cat: 'Brands', kind: 'brands' },
  { name: 'vuejs', cat: 'Brands', kind: 'brands', kw: ['vue'] },
  { name: 'node-js', cat: 'Brands', kind: 'brands', kw: ['nodejs', 'node'] },
  { name: 'python', cat: 'Brands', kind: 'brands' },
  { name: 'php', cat: 'Brands', kind: 'brands' },
  { name: 'html5', cat: 'Brands', kind: 'brands', kw: ['html'] },
  { name: 'css3', cat: 'Brands', kind: 'brands', kw: ['css', 'css3-alt'] },
  { name: 'js', cat: 'Brands', kind: 'brands', kw: ['javascript'] },
  { name: 'sass', cat: 'Brands', kind: 'brands' },
  { name: 'npm', cat: 'Brands', kind: 'brands' },
  { name: 'yarn', cat: 'Brands', kind: 'brands' },
  { name: 'git', cat: 'Brands', kind: 'brands' },
  { name: 'aws', cat: 'Brands', kind: 'brands', kw: ['amazon web services'] },
  { name: 'digital-ocean', cat: 'Brands', kind: 'brands' },
  { name: 'cloudflare', cat: 'Brands', kind: 'brands' },
  { name: 'dropbox', cat: 'Brands', kind: 'brands' },
  { name: 'google-drive', cat: 'Brands', kind: 'brands' },
  { name: 'figma', cat: 'Brands', kind: 'brands' },
  { name: 'sketch', cat: 'Brands', kind: 'brands' },
  { name: 'dribbble', cat: 'Brands', kind: 'brands' },
  { name: 'behance', cat: 'Brands', kind: 'brands' },
  { name: 'codepen', cat: 'Brands', kind: 'brands' },
  { name: 'stack-overflow', cat: 'Brands', kind: 'brands' },
  { name: 'wordpress', cat: 'Brands', kind: 'brands' },
  { name: 'medium', cat: 'Brands', kind: 'brands', kw: ['blog'] },
  { name: 'mastodon', cat: 'Brands', kind: 'brands' },
  { name: 'threads', cat: 'Brands', kind: 'brands' },
];

/** Look up an icon's `kind` from its name in the loaded catalog (or curated fallback). */
export function getFaIconKind(name: string): FaIconKind | undefined {
  return getFullFaCatalog().find((i) => i.name === name)?.kind;
}

/** Look up an icon's full free `styles` array; returns `[kind]` as a fallback for curated entries that haven't been merged with the manifest yet. */
export function getFaIconStyles(name: string): readonly FaIconKind[] | undefined {
  const entry = getFullFaCatalog().find((i) => i.name === name);
  if (!entry) return undefined;
  return entry.styles ?? [entry.kind];
}

const STYLE_PREFIX: Record<FaIconKind, string> = {
  solid: 'fa-solid',
  regular: 'fa-regular',
  brands: 'fa-brands',
};

const STYLE_CLASS_RE = /\b(fa-solid|fa-regular|fa-brands|fa-classic|fas|far|fab)\b/;

/**
 * Build the Font Awesome class string for an `<i>` element.
 *
 * FA 7's CSS sets `font-family` only when the element has a style class
 * (`fa-solid`, `fa-regular`, `fa-brands`, ...) — bare `fa-house` sets the
 * codepoint via `--fa` but no font-family, so the glyph won't render and
 * the codepoint shows as fallback text. To make this safe regardless of
 * how the user typed the input:
 *
 *   - Bare name "house"          → "fa fa-solid fa-house"
 *   - Prefixed "fa-house"        → "fa fa-solid fa-house"  (style added)
 *   - Full "fa-solid fa-house"   → "fa fa-solid fa-house"  (passthrough + bare fa)
 *   - Legacy "fas fa-house"      → "fa fas fa-house"       (passthrough)
 *
 * The bare `fa` class is load-bearing: the `.module-weight-override` rule in
 * globals.css excludes `.fa` elements so a forced module font weight cannot
 * swap or blank glyphs (FA selects the glyph variant via font-weight). It
 * also serves as defense if a user pastes something exotic — at minimum the
 * font-family rule still matches.
 *
 * Used by both `IconModule` (runtime render) and `IconPicker` (preview
 * + grid) so what the user previews is exactly what renders on the display.
 */
export function buildIconClass(rawName: string, kind: FaIconKind): string {
  const trimmed = rawName.trim();
  if (!trimmed) return '';
  const hasStyleClass = STYLE_CLASS_RE.test(trimmed);
  if (hasStyleClass) return `fa ${trimmed}`;
  if (trimmed.startsWith('fa-')) return `fa ${STYLE_PREFIX[kind]} ${trimmed}`;
  return `fa ${STYLE_PREFIX[kind]} fa-${trimmed}`;
}

/**
 * Decide which `IconConfig.style` to apply when the user picks an icon
 * from the catalog. Keeps the user's current style if the picked icon
 * supports it (e.g. switching between solid/regular for the ~170 icons
 * that ship in both); otherwise snaps to the icon's primary kind so the
 * rendered class string matches a woff2 that actually has the glyph.
 */
export function pickStyleForIcon(
  currentStyle: FaIconKind,
  supportedStyles: readonly FaIconKind[],
  primaryKind: FaIconKind,
): FaIconKind {
  return supportedStyles.includes(currentStyle) ? currentStyle : primaryKind;
}

// ───────────────────────────────────────────────────────────────────────
// Full catalog loader
//
// The curated FA_ICONS list above is what the picker shows on first paint.
// When the user opens the picker we fetch the full Font Awesome free
// catalog (~1,970 icons) from /font-awesome/icons-slim.json — generated at
// `npm install` by scripts/copy-font-awesome.mjs. The asset is local to
// the Next.js public/ directory, so no CDN; the kiosk works offline.
//
// Curated entries keep their hand-picked category + keyword aliases when
// merged in; everything else falls into the 'Brands' or 'All' bucket.
// ───────────────────────────────────────────────────────────────────────

const FA_MANIFEST_URL = '/font-awesome/icons-slim.json';

interface FaSlimEntry {
  name: string;
  /** 'solid' | 'regular' | 'brands' — the icon's primary free style. */
  kind: string;
  /** All free styles available for this icon (e.g. ['solid'], ['solid','regular'], ['brands']). */
  styles?: string[];
  kw?: string[];
}

interface FaSlimManifest {
  version: string;
  icons: FaSlimEntry[];
}

let cachedFullCatalog: readonly FaIconEntry[] | null = null;
let inFlightLoad: Promise<readonly FaIconEntry[]> | null = null;

/** Synchronous getter — returns the full catalog if loaded, else the curated subset. */
export function getFullFaCatalog(): readonly FaIconEntry[] {
  return cachedFullCatalog ?? FA_ICONS;
}

/** O(1) lookup of curated entries when merging the slim manifest. */
const CURATED_BY_NAME = new Map<string, FaIconEntry>(FA_ICONS.map((i) => [i.name, i]));

function normalizeKind(raw: string): FaIconKind {
  if (raw === 'brands') return 'brands';
  if (raw === 'regular') return 'regular';
  return 'solid';
}

function entriesFromManifest(slim: readonly FaSlimEntry[]): FaIconEntry[] {
  const list: FaIconEntry[] = [];
  for (const entry of slim) {
    const kind = normalizeKind(entry.kind);
    const styles = (entry.styles ?? [entry.kind])
      .map(normalizeKind)
      // Dedup while preserving order so the primary `kind` shows up first.
      .filter((s, i, arr) => arr.indexOf(s) === i);
    const curated = CURATED_BY_NAME.get(entry.name);
    const kwSet = new Set<string>([...(entry.kw ?? []), ...(curated?.kw ?? [])]);
    const kw = Array.from(kwSet);
    list.push({
      name: entry.name,
      kind,
      styles,
      kw: kw.length > 0 ? kw : undefined,
      cat: curated?.cat ?? (kind === 'brands' ? 'Brands' : 'All'),
    });
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

/**
 * Load the full Font Awesome free catalog from the local /public manifest.
 * Resolves immediately if a memory cache exists; otherwise fetches the
 * slim JSON. On failure (e.g. assets weren't copied) returns the curated
 * subset for *this call* but does NOT cache the failure, so the next open
 * of the picker retries the fetch — a transient hiccup shouldn't degrade
 * the picker for the rest of the session.
 */
export function loadAllFaIcons(): Promise<readonly FaIconEntry[]> {
  if (cachedFullCatalog) return Promise.resolve(cachedFullCatalog);
  if (inFlightLoad) return inFlightLoad;

  const promise = (async () => {
    try {
      const res = await fetch(FA_MANIFEST_URL, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = await res.json() as FaSlimManifest;
      if (!Array.isArray(manifest?.icons)) {
        throw new Error('Malformed manifest: missing `icons` array');
      }
      const list = entriesFromManifest(manifest.icons);
      cachedFullCatalog = list;
      return list;
    } catch (err) {
      // Reset the in-flight slot so the next caller retries; do NOT cache
      // FA_ICONS as the catalog or we'll be stuck on the curated subset
      // for the rest of the session even if /public/font-awesome/ recovers.
      inFlightLoad = null;
      log.warn('Failed to load Font Awesome manifest; using curated subset for now.', err);
      return FA_ICONS;
    }
  })();

  inFlightLoad = promise;
  return promise;
}

/** Search across the full catalog (or curated fallback). Same matcher as searchFaIcons. */
export function searchFullCatalog(query: string, catalog: readonly FaIconEntry[]): readonly FaIconEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog;
  const tokens = q.split(/\s+/);
  return catalog.filter((icon) => {
    const haystack = [icon.name, ...(icon.kw ?? [])].join(' ').toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
