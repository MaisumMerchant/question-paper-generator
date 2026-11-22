function shuffle(items, random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Paper generation uses recent past papers first; important-book questions are
// eligible only as a fallback within a chapter/section quota.
export function isPaperEligible(question) {
  return (question.source === 'past_paper' && Number.isInteger(question.year) && question.year >= 2022)
    || question.source === 'important_book';
}

export function allocatePaperQuestions(candidates, count, percentages = {}, random = Math.random, balanceEvenly = true) {
  return allocateQuestions(candidates.filter(isPaperEligible), count, percentages, random, balanceEvenly, true);
}

// Allocate each section independently, then randomly sample within its quotas.
// Automatic mode ignores rounded display percentages: all chapters weigh equally.
export function allocateQuestions(candidates, count, percentages = {}, random = Math.random, balanceEvenly = true, preferRecent = false) {
  const unique = [...new Map(candidates.map((question) => [question.id, question])).values()];
  const target = Math.min(Math.max(0, Math.floor(Number(count) || 0)), unique.length);
  if (!target) return [];
  const byChapter = new Map();
  for (const question of unique) {
    if (!byChapter.has(question.chapter)) byChapter.set(question.chapter, []);
    byChapter.get(question.chapter).push(question);
  }
  const chapters = [...byChapter.keys()];
  const quotas = new Map(chapters.map((chapter) => [chapter, 0]));
  const weight = (chapter) => balanceEvenly ? 1 : Math.max(0, Number(percentages[chapter]) || 0);
  let remaining = target;
  while (remaining > 0) {
    const eligible = chapters.filter((chapter) => quotas.get(chapter) < byChapter.get(chapter).length);
    if (!eligible.length) break;
    const totalWeight = eligible.reduce((sum, chapter) => sum + weight(chapter), 0);
    // Shuffle before sorting so tied remainders do not always favor the first chapter.
    const shares = shuffle(eligible, random).map((chapter) => {
      const ideal = remaining * (totalWeight ? weight(chapter) / totalWeight : 1 / eligible.length);
      const slots = Math.min(Math.floor(ideal), byChapter.get(chapter).length - quotas.get(chapter));
      return { chapter, slots, remainder: ideal - Math.floor(ideal) };
    });
    for (const { chapter, slots } of shares) {
      quotas.set(chapter, quotas.get(chapter) + slots);
      remaining -= slots;
    }
    for (const { chapter } of shares.sort((a, b) => b.remainder - a.remainder)) {
      if (!remaining) break;
      if (quotas.get(chapter) < byChapter.get(chapter).length) {
        quotas.set(chapter, quotas.get(chapter) + 1);
        remaining -= 1;
      }
    }
  }
  return shuffle(chapters.flatMap((chapter) => {
    const pool = byChapter.get(chapter);
    const ordered = preferRecent
      ? [...shuffle(pool.filter((q) => q.source === 'past_paper'), random),
         ...shuffle(pool.filter((q) => q.source === 'important_book'), random)]
      : shuffle(pool, random);
    return ordered.slice(0, quotas.get(chapter));
  }), random);
}
