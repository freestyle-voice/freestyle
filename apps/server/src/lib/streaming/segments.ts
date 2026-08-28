/**
 * Merge a newly finalized segment into the accumulated transcript.
 *
 * The containment checks handle providers that occasionally resend the full
 * transcript so far instead of a delta. `dedupOverlapWords > 0` additionally
 * drops words repeated verbatim across the join boundary — only enable it
 * where overlap is a known provider artifact (e.g. ElevenLabs repeats the
 * tail of the previous segment after an auto-commit), because it can swallow
 * words the speaker genuinely repeated.
 */
export function mergeFinalSegment(
  prev: string,
  next: string,
  dedupOverlapWords = 0,
): string {
  const p = prev.trim();
  const n = next.trim();
  if (!n) return p;
  if (!p) return n;
  if (n === p) return p;
  if (n.startsWith(p)) return n;
  if (p.startsWith(n)) return p;

  if (dedupOverlapWords > 0) {
    const prevWords = p.split(/\s+/);
    const nextWords = n.split(/\s+/);
    const maxOverlap = Math.min(
      dedupOverlapWords,
      prevWords.length,
      nextWords.length,
    );
    let overlapLen = 0;
    for (let i = 1; i <= maxOverlap; i++) {
      const tail = prevWords.slice(-i).join(" ").toLowerCase();
      const head = nextWords.slice(0, i).join(" ").toLowerCase();
      if (tail === head) overlapLen = i;
    }
    if (overlapLen > 0) {
      return `${p} ${nextWords.slice(overlapLen).join(" ")}`.trim();
    }
  }
  return `${p} ${n}`;
}

/** Compose the live preview shown while a partial is still in flight. */
export function previewText(accumulated: string, partial: string): string {
  const a = accumulated.trim();
  const p = partial.trim();
  if (!p) return a;
  if (!a) return p;
  if (p.startsWith(a)) return p;
  if (a.startsWith(p)) return a;
  return `${a} ${p}`.trim();
}
