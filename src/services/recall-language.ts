const letters = (value: unknown) => String(value || '').match(/\p{L}/gu) || []
const arabicLetters = (value: unknown) => String(value || '').match(/\p{Script=Arabic}/gu) || []

export function isArabicRecallText(value: unknown): boolean {
  const all = letters(value)
  return all.length > 0 && arabicLetters(value).length / all.length >= 0.5
}

export function validateArabicRecall(question: unknown, answer: unknown): string | null {
  if (!isArabicRecallText(question) || !isArabicRecallText(answer)) {
    return 'Recall questions and answers must be written primarily in Arabic; precise technical terms may remain in their original language.'
  }
  return null
}
