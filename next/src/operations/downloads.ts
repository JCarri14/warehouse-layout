export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob), a = document.createElement('a')
  a.href = url; a.download = [...name.replace(/[<>:"/\\|?*]/g, '_')].map(c => c.charCodeAt(0) < 32 ? '_' : c).join('')
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
