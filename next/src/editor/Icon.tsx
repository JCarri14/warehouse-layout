import type { ReactNode } from 'react'
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/></>,
    cube: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, folder: <><path d="M3 7V5h7l2 3h9v11H3V7Z"/><path d="M3 10h18"/></>,
    save: <path d="M4 3h13l4 4v14H4V3ZM8 3v6h9V3M8 21v-8h9v8"/>,
    rack: <path d="M4 3v18M20 3v18M4 5h16M4 12h16M4 19h16M9 5v7M15 12v7"/>,
    zone: <><path d="m3 8 9-5 9 5-9 5-9-5Z" strokeDasharray="3 2"/><path d="m3 13 9 5 9-5M3 17l9 5 9-5"/></>,
    obstacle: <><rect x="5" y="3" width="14" height="18" rx="1"/><path d="m5 8 5-5M5 14 16 3M5 20 19 6M11 21l8-9M17 21l2-3"/></>,
    table: <path d="M3 6h18v4H3V6ZM5 10v11M19 10v11M5 17h14M8 6V3h8v3"/>,
    grid: <><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></>,
    fit: <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8h8v8H8Z"/>,
    locate: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    arrow: <path d="m8 4 8 8-8 8"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    select: <path d="m5 3 14 10-7 1-3 7-4-18Z"/>,
    hand: <path d="M8 12V5a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v8c0 4-3 7-7 7-3 0-5-2-7-5l-3-5a2 2 0 0 1 3-2l2 2Z"/>,
    duplicate: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/></>,
    rotate: <><path d="M3 10a9 9 0 1 1 3 9M3 4v6h6"/><path d="M10 10h6v6h-6Z"/></>,
    trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>,
    undo: <path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"/>,
    redo: <path d="m16 4 5 5-5 5M21 9H11a7 7 0 0 0 0 14"/>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.cube}</svg>
}
