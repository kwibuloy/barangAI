import type { Category } from './types'

/**
 * "Help me describe it": short questions per category with tap-to-add answers, so residents add the details staff
 * need (how deep, how big, since when) that a photo cannot show. Each answer is inserted as one sentence.
 */
export type Prompt = { question: string; answers: string[] }

const since: Prompt = {
  question: 'Since when?',
  answers: ['It started today.', 'It has been like this for a few days.', 'It has been like this for over a week.'],
}

export const describePrompts: Record<Category, Prompt[]> = {
  flooding: [
    {
      question: 'How deep?',
      answers: ['The water is ankle-deep.', 'The water is knee-deep.', 'The water is waist-deep.'],
    },
    {
      question: 'Can vehicles pass?',
      answers: ['Cars can still pass.', 'Only large vehicles can pass.', 'No vehicles can pass.'],
    },
    since,
  ],
  potholes: [
    {
      question: 'How wide?',
      answers: ['It is about fist-sized.', 'It is about a tyre wide.', 'It is wider than a car.'],
    },
    {
      question: 'How deep?',
      answers: ['It is shallow.', 'It is about ankle-deep.', 'It is deeper than a hand.'],
    },
    {
      question: 'Where on the road?',
      answers: ['It is in the middle of the road.', 'It is near the edge of the road.', 'It is on the sidewalk.'],
    },
  ],
  fallen_trees: [
    { question: 'How big?', answers: ['A large branch fell.', 'A whole tree fell.'] },
    {
      question: 'What does it block or touch?',
      answers: [
        'It blocks the road.',
        'It blocks the sidewalk.',
        'It is resting on power lines.',
        'It fell on a house or vehicle.',
      ],
    },
  ],
  broken_streetlights: [
    {
      question: 'What is wrong?',
      answers: ['The light stays off at night.', 'The light flickers.', 'The pole is damaged or leaning.'],
    },
    since,
  ],
  exposed_wiring: [
    {
      question: 'What do you see?',
      answers: [
        'The wire is sparking.',
        'The wire is hanging low.',
        'The wire is on the ground.',
        'The wire is near water.',
      ],
    },
    since,
  ],
  uncollected_garbage: [
    {
      question: 'How much?',
      answers: ['There are a few bags.', 'There is a large pile.', 'It is spilling onto the road.'],
    },
    {
      question: 'How long?',
      answers: ['It missed one collection.', 'It has not been collected for over a week.'],
    },
    { question: 'Other problems?', answers: ['It smells bad.', 'It attracts animals or flies.'] },
  ],
  damaged_signage: [
    {
      question: 'What is wrong?',
      answers: [
        'The sign is bent.',
        'The sign has fallen.',
        'The sign is faded or hard to read.',
        'The sign is missing.',
      ],
    },
    {
      question: 'Which sign?',
      answers: ['It is a traffic sign.', 'It is a street name sign.', 'It is a warning sign.'],
    },
  ],
  other: [since, { question: 'Is it getting worse?', answers: ['It is getting worse.', 'It has stayed the same.'] }],
}

/** Adds the answer to the description, replacing another answer to the same question; tapping it again removes it. */
export function toggleAnswer(description: string, answers: string[], answer: string) {
  const chosen = description.includes(answer)
  const rest = answers
    .reduce((text, other) => text.replace(other, ''), description)
    .replace(/ {2,}/g, ' ')
    .trim()
  if (chosen) return rest
  return rest ? `${rest} ${answer}` : answer
}
