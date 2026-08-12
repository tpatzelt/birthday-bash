/**
 * Group-chat-ready bragging text for an Afterhour run. Dry, Berlin-blunt, no
 * backend — a highscore only means anything if you can paste it somewhere.
 */

export function buildShareText(loops: number): string {
  const runden = loops === 1 ? 'Runde' : 'Runden';
  return `${loops} ${runden} Afterhour überlebt. Schlag das.`;
}

/** Never throws into the game path — same degrade-gracefully contract as storage.ts. */
export async function copyShareText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
