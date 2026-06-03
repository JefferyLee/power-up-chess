// Generate the "share" PNG for the castle sign.
//
// Produces a 1200x630 image (standard social-card size): warm gradient
// background, title, tagline, a few key feature lines, the public URL,
// and a QR code that decodes to the same URL. Returned as a Blob so the
// caller can download it via an <a download> link.

import QRCode from 'qrcode'

const W = 1200
const H = 630
const SHARE_URL = 'https://power-up-chess-dev.web.app'

export async function generateShareImage(): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new Error('generateShareImage requires a browser context.')
  }
  const canvas = document.createElement('canvas')
  const qrCanvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable.')

  // Background gradient — castle gate at twilight.
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#1a1530')
  bg.addColorStop(0.55, '#2a2150')
  bg.addColorStop(1, '#1f1a3a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Subtle amber wash on the left edge — torchlight glow.
  const glow = ctx.createRadialGradient(180, 280, 40, 180, 280, 380)
  glow.addColorStop(0, 'rgba(244, 194, 102, 0.20)')
  glow.addColorStop(1, 'rgba(244, 194, 102, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // Inner border — thin gold rule.
  ctx.strokeStyle = 'rgba(244, 194, 102, 0.55)'
  ctx.lineWidth = 2
  ctx.strokeRect(28, 28, W - 56, H - 56)

  // Title.
  ctx.fillStyle = '#f4c266'
  ctx.font = '700 64px "Cinzel", Georgia, serif'
  ctx.textBaseline = 'top'
  ctx.fillText('POWER UP CASTLE', 72, 80)

  // Tagline.
  ctx.fillStyle = '#ece9ff'
  ctx.font = '400 24px "Helvetica Neue", Arial, sans-serif'
  ctx.fillText('A warm, safe home where kids learn chess by playing.', 72, 162)

  // Feature lines.
  const features = [
    '5,300+ puzzles that adapt to your level — six themed plots, daily quests, master + legend tiers',
    'Play friends privately by room link — 5-min blitz to 1-day correspondence',
    'Practice with Lucy or Luca, two AI hosts who chat about your moves',
    'Forest Adventure + Wizard’s Duel — playful side games that earn castle points',
    'The Great Hall — moderated lobby chat. No DMs, no public matchmaking, display names only.',
    '[NEW] Chess Basics — 5 short interactive lessons that take first-timers from zero',
    '[NEW] Story Library — 108 chess stories, read or listened to in Lucy or Luca’s voice',
    '[NEW] Theme Shop — collect piece sets (Cburnett, Fantasy, Glowing Crystal) with castle points',
    '[NEW] Knight’s Hop — learn each piece by playing AS it, one chess-legal hop at a time',
  ]
  // Feature lines — tighter than v1 because the list grew to 9.
  // [NEW] prefix renders as a gold pill before the line text so the
  // recent additions read at a glance.
  ctx.font = '400 17px "Helvetica Neue", Arial, sans-serif'
  let y = 210
  const lineSpacing = 32
  for (const raw of features) {
    const isNew = raw.startsWith('[NEW] ')
    const text = isNew ? raw.slice(6) : raw
    drawBullet(ctx, 80, y + 9, isNew)
    let xCursor = 110
    if (isNew) {
      xCursor = drawNewPill(ctx, xCursor, y + 2)
    }
    ctx.fillStyle = isNew ? '#f1e6c8' : '#d8d2f0'
    ctx.font = '400 17px "Helvetica Neue", Arial, sans-serif'
    wrapText(ctx, text, xCursor, y, W - xCursor - 240, 22)
    y += lineSpacing
  }

  // Footer — ages note + URL.
  ctx.fillStyle = 'rgba(244, 194, 102, 0.85)'
  ctx.font = '400 18px "Helvetica Neue", Arial, sans-serif'
  ctx.fillText('Ages 8–12 · every chess level', 72, H - 92)
  ctx.fillStyle = '#f4c266'
  ctx.font = '600 24px "Helvetica Neue", Arial, sans-serif'
  ctx.fillText(SHARE_URL.replace(/^https?:\/\//, ''), 72, H - 62)

  // QR code on the right.
  const qrSize = 200
  await renderQrInto(qrCanvas, SHARE_URL, qrSize)
  const qrX = W - qrSize - 72
  const qrY = H - qrSize - 72
  // White backing so the QR contrast survives the dark gradient.
  ctx.fillStyle = '#fff'
  ctx.fillRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20)
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize)

  // "Scan to visit" label above the QR.
  ctx.fillStyle = 'rgba(236, 233, 255, 0.75)'
  ctx.font = '400 16px "Helvetica Neue", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Scan to visit', qrX + qrSize / 2, qrY - 30)
  ctx.textAlign = 'left'

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob returned null.'))
      },
      'image/png',
      0.95,
    )
  })
}

async function renderQrInto(
  target: HTMLCanvasElement,
  data: string,
  size: number,
): Promise<void> {
  target.width = size
  target.height = size
  await QRCode.toCanvas(target, data, {
    width: size,
    margin: 1,
    color: { dark: '#1a1530', light: '#ffffff' },
  })
}

function drawBullet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bright = false,
): void {
  ctx.save()
  ctx.fillStyle = bright ? '#ffd86b' : '#f4c266'
  ctx.beginPath()
  ctx.arc(x, y, bright ? 5 : 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Draws a small gold "NEW" pill and returns the next x cursor. */
function drawNewPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): number {
  const text = 'NEW'
  ctx.save()
  ctx.font = '700 12px "Helvetica Neue", Arial, sans-serif'
  const metrics = ctx.measureText(text)
  const padX = 8
  const w = metrics.width + padX * 2
  const h = 18
  // Pill background
  const grad = ctx.createLinearGradient(x, y, x + w, y + h)
  grad.addColorStop(0, '#f4c266')
  grad.addColorStop(1, '#ef9a3f')
  ctx.fillStyle = grad
  roundRect(ctx, x, y, w, h, 9)
  ctx.fill()
  // Pill text
  ctx.fillStyle = '#1a1530'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + padX, y + h / 2 + 1)
  ctx.textBaseline = 'top'
  ctx.restore()
  return x + w + 8
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

/** Word-wrap helper. Returns the y of the last line for layout chaining. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(' ')
  let line = ''
  let cursorY = y
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    const metrics = ctx.measureText(candidate)
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, cursorY)
      line = word
      cursorY += lineHeight
    } else {
      line = candidate
    }
  }
  if (line) ctx.fillText(line, x, cursorY)
  return cursorY
}

/** Trigger a browser download for the produced share image. */
export async function downloadShareImage(filename = 'power-up-castle.png'): Promise<void> {
  const blob = await generateShareImage()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke after the browser has had a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
