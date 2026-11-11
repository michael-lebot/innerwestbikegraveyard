/** An SVG path over every pixel of `art` whose letter is in `letters`, one rectangle per run along a row. */
export const pixels = (art: string[], letters: string) =>
  art
    .flatMap((row, y) =>
      [...row.matchAll(new RegExp(`[${letters}]+`, 'g'))].map(
        ({ index, 0: run }) => `M${index} ${y}h${run.length}v1h-${run.length}z`,
      ),
    )
    .join('')
