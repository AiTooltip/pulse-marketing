// Starting points only. Adding one copies it into your own list, where you can
// rename, edit or delete it like anything you typed yourself.
export const CATEGORIES = [
  ["hook", "Hook & opening"],
  ["thumbnail", "Thumbnail"],
  ["title", "Title"],
  ["structure", "Structure"],
  ["tone", "Tone & delivery"],
  ["length", "Length & pacing"],
  ["engagement", "Engagement"],
  ["posting", "Posting"],
  ["other", "Other"],
];
export const categoryLabel = (id) =>
  CATEGORIES.find(([k]) => k === id)?.[1] || "Other";

export const SUGGESTED_TACTICS = [
  ["hook", "Open with the result or payoff in the first 5 seconds"],
  ["hook", "Open with a question"],
  ["hook", "Bold claim or pattern interrupt in the opening"],
  ["thumbnail", "Face with a strong expression on the thumbnail"],
  ["thumbnail", "Text-only thumbnail"],
  ["thumbnail", "High-contrast colours on the thumbnail"],
  ["thumbnail", "Before and after thumbnail"],
  ["title", "Number in the title"],
  ["title", "Question as the title"],
  ["title", "Curiosity-gap title"],
  ["structure", "Call to action within the first 2 minutes"],
  ["structure", "Preview of the end result early on"],
  ["structure", "Chapters / timestamps"],
  ["structure", "Story arc (problem, struggle, outcome)"],
  ["tone", "Casual, conversational tone"],
  ["tone", "Speak directly to one viewer"],
  ["tone", "Humour"],
  ["length", "Under 5 minutes"],
  ["length", "8 to 12 minutes"],
  ["length", "Fast cuts / quick pacing"],
  ["engagement", "Ask a question to prompt comments"],
  ["engagement", "Pinned comment"],
  ["engagement", "End screen pointing to the next video"],
  ["posting", "Posted on a weekday morning"],
  ["posting", "Posted at the weekend"],
].map(([category, name]) => ({ category, name }));

export const SUGGESTED_STRATEGIES = [
  ["Educational how-to series", "Teach one practical skill per video so people come back for the next one."],
  ["Behind the scenes", "Show the process and the people to build trust."],
  ["Storytelling and personal narrative", "Lead with a real story, then the lesson."],
  ["Case studies and proof", "Show results from real examples."],
  ["Repurpose into clips", "Cut long videos into short clips to reach new viewers."],
  ["Community Q&A", "Answer viewer questions to deepen engagement."],
  ["Trend-led content", "React to topics people are already searching for."],
  ["Collaborations", "Make videos with other creators to borrow their audience."],
].map(([name, hypothesis]) => ({ name, hypothesis }));
