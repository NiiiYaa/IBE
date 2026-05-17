import type { PoiCategory } from '@ibe/shared'

export const POI_COLORS: Record<PoiCategory, string> = {
  restaurants: '#f97316',
  cafes:       '#b45309',
  attractions: '#3b82f6',
  museums:     '#7c3aed',
  transport:   '#8b5cf6',
  metro:       '#0891b2',
  shopping:    '#ec4899',
  wellness:    '#10b981',
  nightlife:   '#f59e0b',
  airports:    '#0f509e',
  beaches:     '#0ea5e9',
  parks:       '#16a34a',
  banks:       '#6366f1',
  medical:     '#ef4444',
  sports:      '#14b8a6',
}

// SVG symbol paths for 20×20 viewBox (white on colored circle)
export const POI_ICON_PATHS: Record<PoiCategory, string> = {
  restaurants: `<g stroke="white" stroke-width="1.3" stroke-linecap="round" fill="none"><path d="M7.5 5v3.5m1.5-3.5v3.5M8.25 8.5v6M13 5v3c0 1.4-2 1.4-2 0V5m1 3.5v6"/></g>`,
  cafes:       `<g stroke="white" stroke-width="1.25" stroke-linecap="round" fill="none"><path d="M7.5 9h5v4a2 2 0 01-2 2h-1a2 2 0 01-2-2V9zm5 1.5h1a1.5 1.5 0 000-3h-1"/><path d="M8.5 7.5c0-1 1-1 1-2m2 2c0-1 1-1 1-2"/></g>`,
  attractions: `<path fill="white" d="M10 5.5l1.25 3.8H15l-3 2.2 1.1 3.5L10 12.8l-3.1 2.2 1.1-3.5-3-2.2h3.75z"/>`,
  museums:     `<g stroke="white" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M5 15h10M10 5l5 3H5z"/><path d="M7 8v7m3-7v7m3-7v7"/></g>`,
  transport:   `<g stroke="white" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"><rect x="5.5" y="5.5" width="9" height="7.5" rx="1"/><path d="M5.5 9.5h9M7 5.5V4m6 1.5V4M7.5 13v2m5-2v2"/><circle cx="7.5" cy="11.5" r="0.75" fill="white"/><circle cx="12.5" cy="11.5" r="0.75" fill="white"/></g>`,
  metro:       `<g stroke="white" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"><rect x="6" y="5" width="8" height="8.5" rx="2"/><path d="M6 9.5h8M8.5 13.5v2m3-2v2M8.5 7.5h3"/><circle cx="8.5" cy="11.5" r="0.75" fill="white"/><circle cx="11.5" cy="11.5" r="0.75" fill="white"/></g>`,
  shopping:    `<g stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M6.5 8h7l-1 7H7.5L6.5 8z"/><path d="M8.75 8V6.5a1.25 1.25 0 012.5 0V8"/></g>`,
  wellness:    `<path fill="white" d="M10 15C10 15 4.5 11.4 4.5 8a3.5 3.5 0 013.5-3.5c.9 0 1.7.4 2 1 .3-.6 1.1-1 2-1A3.5 3.5 0 0115.5 8c0 3.4-5.5 7-5.5 7z"/>`,
  nightlife:   `<g stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M7 5h6l-2.5 5.5H9.5L7 5zM10 10.5v4.5M8 15h4"/></g>`,
  airports:    `<path fill="white" d="M10.75 5a.75.75 0 00-1.5 0v3.25L4.5 11v1.5L9.25 11V15L8 16v.75l2-.63 2 .63V16l-1.25-1v-4l4.75 1.5V11l-4.75-2.75V5z"/>`,
  beaches:     `<g stroke="white" stroke-width="1.25" stroke-linecap="round" fill="none"><circle cx="10" cy="7.5" r="2" fill="white"/><path d="M10 4.5V3M13.2 5.3l1-1M15 7.5h1.5M13.2 9.7l1 1M10 10.5v1M6.8 9.7l-1 1M5 7.5H3.5M6.8 5.3l-1-1"/><path d="M5 13.5c1.3-1.3 2.5-1.3 3.5 0s2.2 1.3 3.5 0 2.3-1.3 3.5 0"/></g>`,
  parks:       `<path fill="white" d="M10 4.5L6.5 10H9v5.5h2V10h2.5L10 4.5z"/>`,
  banks:       `<g stroke="white" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M5 15h10M10 5l5.5 3H4.5L10 5z"/><path d="M7 8v7m3-7v7m3-7v7"/></g>`,
  medical:     `<path fill="white" d="M8.5 5.5h3v3h3v3h-3v3h-3v-3h-3v-3h3z"/>`,
  sports:      `<g stroke="white" stroke-width="1.3" stroke-linecap="round" fill="none"><path d="M6.5 9.5h7M8 6.5v7M12 6.5v7"/><rect x="6.5" y="6.5" width="7" height="7" rx="0.5"/></g>`,
}

export function poiIconSvg(cat: PoiCategory, size = 20): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="${size}" height="${size}"><circle cx="10" cy="10" r="9" fill="${POI_COLORS[cat]}" stroke="white" stroke-width="1.2"/>${POI_ICON_PATHS[cat]}</svg>`
}
