type ZipEntry = { path: string; bytes: Uint8Array<ArrayBuffer> }
const encoder = new TextEncoder()
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  return crc >>> 0
})

// Store entries without compression: PDFs are already compressed, and the archive
// remains portable without adding a ZIP dependency to the application.
export function buildZip(entries: ZipEntry[]) {
  if (entries.length > 65535) throw new Error('Too many files for this download.')
  const chunks: Array<Uint8Array<ArrayBuffer>> = []
  const directory: Array<Uint8Array<ArrayBuffer>> = []
  const paths = new Set<string>()
  let offset = 0
  for (const entry of entries) {
    if (
      !entry.path ||
      entry.path.startsWith('/') ||
      entry.path.includes('\\') ||
      entry.path.split('/').some((part) => !part || part === '.' || part === '..') ||
      paths.has(entry.path)
    )
      throw new Error('Invalid or duplicate archive path.')
    paths.add(entry.path)
    const name = encoder.encode(entry.path)
    if (name.length > 65535) throw new Error('Archive filename is too long.')
    let crc = 0xffffffff
    for (const byte of entry.bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]
    crc = (crc ^ 0xffffffff) >>> 0
    const header = new Uint8Array(30 + name.length)
    const local = new DataView(header.buffer)
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true)
    local.setUint16(12, 33, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, entry.bytes.length, true)
    local.setUint32(22, entry.bytes.length, true)
    local.setUint16(26, name.length, true)
    header.set(name, 30)
    const central = new Uint8Array(46 + name.length)
    const view = new DataView(central.buffer)
    view.setUint32(0, 0x02014b50, true)
    view.setUint16(4, 20, true)
    central.set(header.slice(4, 30), 6)
    view.setUint32(42, offset, true)
    central.set(name, 46)
    chunks.push(header, entry.bytes)
    directory.push(central)
    offset += header.length + entry.bytes.length
  }
  const directorySize = directory.reduce((sum, bytes) => sum + bytes.length, 0)
  const end = new Uint8Array(22)
  const view = new DataView(end.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(8, entries.length, true)
  view.setUint16(10, entries.length, true)
  view.setUint32(12, directorySize, true)
  view.setUint32(16, offset, true)
  return new Blob([...chunks, ...directory, end], { type: 'application/zip' })
}
