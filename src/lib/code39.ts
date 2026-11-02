// Standard Code 39 narrow/wide patterns, ordered by the alphabet below.
// Each nine-bit pattern alternates bars and spaces, starting with a bar.
// Pattern reference: https://github.com/zxing/zxing/blob/master/core/src/main/java/com/google/zxing/oned/Code39Reader.java
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%'
const patterns = [
  0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064,
  0x109, 0x049, 0x148, 0x019, 0x118, 0x058, 0x00d, 0x10c, 0x04c, 0x01c,
  0x103, 0x043, 0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016,
  0x181, 0x0c1, 0x1c0, 0x091, 0x190, 0x0d0, 0x085, 0x184, 0x0c4, 0x0a8,
  0x0a2, 0x08a, 0x02a,
]
const startStop = 0x094

export type BarcodeBar = { x: number; width: number }

export function encodeCode39(value: string): { bars: BarcodeBar[]; width: number } | null {
  // Long codes become too dense on a 75 mm label to scan reliably.
  if (!value || value.length > 15 || [...value].some(char => !alphabet.includes(char))) return null
  const bars: BarcodeBar[] = []
  let x = 10 // quiet zone in narrow-module widths
  const text = `*${value}*`
  for (const char of text) {
    const pattern = char === '*' ? startStop : patterns[alphabet.indexOf(char)]
    for (let i = 0; i < 9; i++) {
      const width = pattern & (1 << (8 - i)) ? 2.5 : 1
      if (i % 2 === 0) bars.push({ x, width })
      x += width
    }
    x += 1 // narrow inter-character space
  }
  return { bars, width: x + 10 }
}
