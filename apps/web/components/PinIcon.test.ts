import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PinIcon } from './PinIcon'

describe('PinIcon', () => {
  it.each([1, 2])('draws whole pixels at scale %i, with the base across the bottom of its haloed box', (scale) => {
    const svg = renderToStaticMarkup(createElement(PinIcon, { operator: 'lime', scale }))
    expect(svg).toContain(`width="${14 * scale}" height="${15 * scale}" viewBox="-1 -1 14 15"`)
    expect(svg).toContain('shape-rendering="crispEdges"')
    expect(svg).toContain('stroke="#ffffff" stroke-width="2" paint-order="stroke"')
    // The ground line spans the art's full width on its last row, so the box's bottom centre is the base's middle.
    expect(svg).toMatch(/d="[^"]*M0 12h12v1h-12z"/)
    expect(svg).toContain('>L</text>')
  })
})
