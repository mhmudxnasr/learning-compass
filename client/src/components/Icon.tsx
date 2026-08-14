import { ComponentChildren } from 'preact'

export type IconName = 'home' | 'library' | 'learn' | 'map' | 'settings' | 'search' | 'capture' | 'queue' | 'inbox' | 'rss' | 'source' | 'file' | 'book' | 'collection' | 'archive' | 'note' | 'recall' | 'path' | 'branch' | 'balance' | 'close' | 'more' | 'chevron' | 'external' | 'check' | 'clock' | 'sync' | 'menu' | 'back' | 'trash' | 'edit' | 'spark' | 'sun' | 'moon' | 'palette'

const paths: Record<IconName, ComponentChildren> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9.5 20v-6h5v6"/></>,
  library: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z"/></>,
  learn: <><path d="m3 8 9-5 9 5-9 5z"/><path d="M7 11v5c2.8 2.1 7.2 2.1 10 0v-5M21 9v6"/></>,
  map: <><circle cx="6" cy="6" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="m8 6 8-.7M7 8l4 9m6-10-4 10"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.96 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15.04 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.96a1.7 1.7 0 0 0-.34-1.87L4.2 7.03 7.03 4.2l.06.06A1.7 1.7 0 0 0 8.96 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.04 1.52 1.7 1.7 0 0 0 1.87-.34l.06-.06 2.83 2.83-.06.06a1.7 1.7 0 0 0-.34 1.87A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  capture: <path d="M12 5v14M5 12h14"/>,
  queue: <><path d="M5 6h14M5 12h14M5 18h9"/><circle cx="18" cy="18" r="2"/></>,
  inbox: <><path d="M4 5h16v14H4z"/><path d="M4 13h4l2 3h4l2-3h4"/></>,
  rss: <><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></>,
  source: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></>,
  file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></>,
  book: <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z"/><path d="M5 4v16a3 3 0 0 1 3-3h11"/></>,
  collection: <><path d="M4 7h6l2 2h8v11H4z"/><path d="M4 7V4h6l2 2h8v3"/></>,
  archive: <><path d="M4 7h16v13H4zM3 3h18v4H3z"/><path d="M9 11h6"/></>,
  note: <><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  recall: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6M12 8v5l3 2"/></>,
  path: <><circle cx="5" cy="18" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="19" cy="17" r="2"/><path d="m6.5 16.7 4.2-8.9m2.7 0 4.3 7.5"/></>,
  branch: <><path d="M6 4v16M6 9h5a4 4 0 0 0 4-4V4M6 15h5a4 4 0 0 1 4 4v1"/></>,
  balance: <><path d="M12 3v18M5 7h14M5 7l-3 6h6zM19 7l-3 6h6z"/><path d="M7 21h10"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  external: <><path d="M14 5h5v5M19 5l-8 8"/><path d="M18 13v6H5V6h6"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  sync: <><path d="M20 7h-5V2M4 17h5v5"/><path d="M18.4 5.6A8 8 0 0 0 5 9m.6 9.4A8 8 0 0 0 19 15"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  back: <path d="m15 18-6-6 6-6"/>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/><path d="M10 11v6M14 11v6"/></>,
  edit: <><path d="m4 20 4.5-1 10-10-3.5-3.5-10 10z"/><path d="m13.5 7 3.5 3.5"/></>,
  spark: <><path d="m12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2z"/><path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6z"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></>,
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>,
  palette: <><path d="M12 2a10 10 0 1 0 10 10c0-1.5-1-2-2-2h-2a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.5A2.5 2.5 0 0 0 21 3.5 10 10 0 0 0 12 2Z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/></>,
}

export function Icon({ name, size = 20, class: classProp, className }: { name: IconName; size?: number; class?: string; className?: string }) {
  const extraClass = classProp || className || ''
  return <svg class={`icon ${extraClass}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths[name]}</svg>
}
