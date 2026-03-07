// Generate PWA icons — run once: node src/lib/generateIcons.js
// Or call generatePWAIcons() from the app on first load

export function generatePWAIcon(size) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')

    // Purple gradient background
    const gradient = ctx.createLinearGradient(0, 0, size, size)
    gradient.addColorStop(0, '#6a2fa0')
    gradient.addColorStop(1, '#c4507a')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.roundRect(0, 0, size, size, size * 0.2)
    ctx.fill()

    // Emoji
    ctx.font = `${size * 0.55}px serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🌸', size / 2, size / 2 + size * 0.02)

    return canvas.toDataURL('image/png')
}
