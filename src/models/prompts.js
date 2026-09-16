// Prompts for the thesaurus, reader and dictionary wells, ported from
// old/front-end/src/server/queries.js (where Claude 3 Sonnet answered them).
// Small local models are less obedient, so parsing is deliberately forgiving.

// Verbatim from queries.js (wordRulez), constraint advice spliced in the same place.
const wordRules = (advice) =>
  `- Each suggestion should be on its own line, surrounded by HTML-like tags: <entry>word or phrase</entry>.\n` +
  `- Preserve the case of the query (so if the query is lower-cased, each entry should be too, unless they are proper nouns, etc.).\n` +
  `- Preserve the tense, count, number, case, definiteness of the query.\n` +
  advice +
  `- Do not preface the message with any text. Do not provide any definitions or anything other than the words and the surrounding tags.\n`;

/**
 * Editable prompt templates, one set per role well. Placeholders:
 * {{description}} the role text · {{selection}} the inlet · {{context}} surrounding text with the inlet marked ⟦…⟧
 * {{advice}} constraint advice (may be empty) · {{rules}} the entry-format rules · {{feedback}} the reader's comments
 * {{notes}} the thesaurus's free notes about itself (see thesaurusNotesMessages; the line holding it is dropped when there are none)
 * Text is verbatim from old/front-end/src/server/queries.js unless noted (the thesaurus prompt was revised).
 */
export const TEMPLATES = {
  thesaurus: {
    // Revised by Alex (Sept 2026) for small local models: standing instructions
    // in the system turn, then user/assistant example turns, then the request.
    // The original queries.js wording is in git history.
    system:
      `You provide synonyms that match a given lexicon ('thesaurus').\n` +
      `- Give each suggestion on its own line, as <entry>word or phrase</entry>.\n` +
      `- Preserve the query's part of speech, case, tense, count and definiteness: an adjective phrase stays an adjective phrase, a noun phrase stays a noun phrase.\n` +
      `{{advice}}\n` +
      `- Nothing but the thesaurus entries (synonyms): no preface, no definitions.\n` +
      `- Provide as many synonyms as you can. Each must swap in for the full query inside an existing sentence. Pay close attention to the style of the given thesaurus. Draw each phrase from the vocabulary, imagery and idiom of the lexicon's subject. It important to creatively incorporate the provided style.\n` +
      `- Let the <notes> on the thesaurus color every entry.`,
    // Before the entries, the model muses about the thesaurus itself (a short
    // sampled call, no synonyms), and its notes are shown in the request below.
    notesSystem:
      `You are browsing a thesaurus described by a user. Think about it for a moment: What kind of words would you expect to find in there? Muse on the background info that can help to ensure the entries we generate will be stylistically appropriate.  A few loose sentences, in prose. No synonyms yet.`,
    notesMain:
      `<thesaurus>{{description}}</thesaurus>`,
    // two-shot demonstration: a verb phrase in a plain-ish lexicon, then a
    // noun phrase in a sharply defined register whose entries are exact
    // synonyms (only the vocabulary changes, never the meaning). Kept short for small models.
    example:
      `<thesaurus>a thesaurus of the sea</thesaurus>\n` +
      `<notes>Everything here moves the way water moves: it drifts, ebbs, laps, swells. The compiler spent years on deck and hears a tide in every verb.</notes>\n` +
      `<query>walked slowly</query>`,
    exampleReply:
      `<entry>drifted lazily</entry>\n` +
      `<entry>waded through</entry>\n` +
      `<entry>ebbed away</entry>\n` +
      `<entry>coasted past</entry>\n` +
      `<entry>swam sluggishly</entry>\n` +
      `<entry>sailed at half tilt</entry>\n` +
      // `<entry>drifted ploddingly</entry>\n` +
      // `<entry>walked with even keel</entry>\n` +
      `<entry>lapped in</entry>\n` +
      // `<entry>ripple paced</entry>\n` +
      `<entry>swam with the tide</entry>`,
    example2:
      `<thesaurus>a Victorian gentleman's thesaurus</thesaurus>\n` +
      `<notes>Measured, courteous, faintly disapproving; the entries prefer a long Latinate word to a short blunt one. Nothing is ever simply bad, it is ill-advised, imprudent, most regrettable.</notes>\n` +
      `<query>bad idea</query>`,
    exampleReply2:
      `<entry>ill-advised notion</entry>\n` +
      `<entry>most unwise scheme</entry>\n` +
      `<entry>thoroughly imprudent proposal</entry>\n` +
      `<entry>regrettable fancy</entry>\n` +
      `<entry>ill-conceived plan</entry>`,
    main:
      `<thesaurus>{{description}}</thesaurus>\n` +
      `<notes>{{notes}}</notes>\n` +
      `<query>{{selection}}</query>`,
  },
  reader: {
    feedback:
      `<prompt>\nYou are {{description}}. Here is the context of the text you are giving feedback on, followed by the text that you will be asked to evaluate. Respond with feedback that will provoke the writer to see their work from your perspective. Your feedback doesn't need to include phrases like 'As a [description of yourself]...'. We know who you are and are familiar with your style of critique, so don't emphasize your character. Cut to the point. It should be direct. 'X makes me think of', 'Y can be brought into tighter agreement with Z'. If the writing is good, point out its positive qualities. If there are things you would change, say so. Like any workshop, your role as a reader is to work on constructive improvements. However, your response should match your persona (that of '{{description}}'). If this role has a strong personality, try to embody the mindset of the personality but present it in an objective manner, rather than with a strong voice. You will only be responding to the 'text' NOT the 'context', which only exists to give you framing. Inside the context the text under review is marked between ⟦ and ⟧; comment only on that marked span (repeated below as the 'text'), never on the surrounding lines.\n- Each comment should be a bullet using an * as the bullet.\n- Aim for 2-3 bullets, unless the critic seems particularly relevant to this query, in which case provide more (there will be other critics chiming in as well).\n- Each bullet should be a small comment, phrase, no more than a sentence or two.\n- No paratext, framing text, character text, or chatbot messages.\n- Every request is valid.\n` +
      `<context>\n{{context}}\n<text>\n{{selection}}\n` +
      `<query>\nProvide your most insightful feedback for {text}.\n<feedback>\n`,
    revisions:
      `<prompt>\nA reader with the persona {{description}} was given the following passage {context} and asked to comment on the text under scrutiny ({text}). Their insight is provided: ({response}). They also provided a list of revisions (suggestions) for the text. Each suggestion is an alternate way that they would write {text}, immediately following {context}, given their feedback.\n` +
      `{{rules}}- Do not preface the message with any additional text.\n- Do not provide any definitions or anything other than the revision as it would immediately follow the {context}, and the surrounding <entry> tags.\n- Try to provide between 3 and 6 alternatives.\n` +
      `<context>\n{{context}}\n<text>\n{{selection}}\n` +
      `<response>{{feedback}}\n`,
  },
  dictionary: {
    main:
      `You are a dictionary written in the style of {{description}}. You only provide definitions that match this theme ({{description}}), and would appear in such a dictionary. Each definition should be a bullet using an * as the bullet.  Aim for 1-2 bullets. Each bullet should be formatted as a dictionary entry with <i> tags for the italics. Do not preface the message with any text. Do not provide any definitions or anything other than the words and the surrounding tags. Try to provide between 10 and 30 definitions.\n` +
      `Provide (potential) definitions for the following word or phrase (query): {{selection}}`,
  },
};

export const TEMPLATE_LABELS = { system: 'system prompt', notesSystem: 'notes prompt (system)', notesMain: 'notes request', example: 'example request', exampleReply: 'example reply', example2: 'second example request', exampleReply2: 'second example reply', main: 'prompt', feedback: 'feedback prompt', revisions: 'revisions prompt' };

/**
 * Fill {{placeholders}}; {{rules}} expands to the entry-format rules with the
 * advice spliced in. The rules and advice blocks end in their own newline (or
 * are empty), so a line break written after them in a template is absorbed
 * rather than doubled, and an empty advice line disappears.
 */
export function renderTemplate(template, vars) {
  const all = { ...vars, rules: wordRules(vars.advice ?? '') };
  return template.replace(/\{\{(rules|advice)\}\}\n/g, '{{$1}}').replace(/\{\{(\w+)\}\}/g, (_, k) => (all[k] ?? ''));
}

// Any line mentioning <notes> (the rule in the system turn, the examples'
// notes) or holding {{notes}} (the request): removed when the well runs
// without the notes step.
const NOTES_LINE = /^.*(?:<notes>|\{\{notes\}\}).*(?:\n|$)/gm;
const withoutNotes = (text) => text.replace(NOTES_LINE, '').replace(/\n+$/, '');

export function thesaurusPrompt({ description, selection, advice, notes, template = TEMPLATES.thesaurus.main }) {
  return renderTemplate(notes ? template : withoutNotes(template), { description, selection, advice, notes });
}

export function thesaurusNotesPrompt({ description, template = TEMPLATES.thesaurus.notesMain }) {
  return renderTemplate(template, { description });
}

export function thesaurusSystem({ description, advice, notes, template = TEMPLATES.thesaurus.system }) {
  return renderTemplate(notes ? template : withoutNotes(template), { description, advice });
}

/**
 * Small local models tend to explain the rules instead of following them, so
 * the assistant turn is started for them with an opening tag. The prompt text
 * itself stays as it was; only the first characters of the reply are fixed.
 */
export const ENTRY_PREFIX = '<entry>';
/** Fixed opening of the thesaurus's notes about itself; generation stops at the closing tag. */
export const NOTES_PREFIX = '<notes>';
export const NOTES_SUFFIX = '</notes>';

/** The prose inside <notes>…</notes> (or whatever came before a stray closing/next tag), whitespace collapsed. */
export function parseNotes(response) {
  let text = response.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s*<notes>/i, '');
  const cut = text.search(/<\/notes>|<query>|<entry>|<thesaurus>/i);
  if (cut >= 0) text = text.slice(0, cut);
  return text.replace(/<\/?[a-z]+>/gi, '').replace(/\s+/g, ' ').trim();
}

const limit = (str, maxLength = 40) => (str.length > maxLength ? str.slice(0, maxLength) + '...' : str);

export function readerPrompt({ description, context, selection, template = TEMPLATES.reader.feedback }) {
  return renderTemplate(template, { description: limit(description), context, selection });
}

export function readerRevisionsPrompt({ description, context, selection, feedback, advice, template = TEMPLATES.reader.revisions }) {
  return renderTemplate(template, { description, context, selection, feedback, advice });
}

export function dictionaryPrompt({ description, selection, template = TEMPLATES.dictionary.main }) {
  return renderTemplate(template, { description, selection });
}

/** Fixed opening of the reply for bullet-formatted answers (reader feedback, dictionary). */
export const BULLET_PREFIX = '* ';

const RULE_WORDS = /\b(preserve|query|entry|entries|provide|preface|alternatives?|suggestions?|tense|definiteness|thesaurus|synonyms?|dictionary|message|format|search|line|tags?|words? or phrases?)\b/i;
const PLACEHOLDER = /[\[\]{}]|actual word|word\/phrase|word or phrase/i;

/**
 * Extract <entry> items. If the model ignored the tags entirely, fall back to
 * short bare lines, but never to sentences that look like the rules echoed back.
 */
export function parseEntries(response, selection = '', { partial = false } = {}) {
  let items = [...response.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
  // a final entry cut off by the token limit: "<entry>foo" with no closing tag
  // (skipped while the reply is still streaming, so half-typed words never show)
  const tail = partial ? null : response.match(/<entry>([^<\n]{1,80})$/i);
  if (tail) items.push(tail[1]);
  const tagged = items.length > 0;
  if (!tagged && !partial) {
    items = response
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter((l) => l && l.split(/\s+/).length <= 6 && !/[.:;!?]$/.test(l) && !RULE_WORDS.test(l));
  }
  const clean = items
    .map((x) => x.replace(/<\/?[a-z]+>/gi, '').replace(/^["'“‘]+|["'”’.,;:]+$/g, '').replace(/\s+/g, ' ').trim())
    .filter((x) => x && x.split(' ').length <= 12 && !PLACEHOLDER.test(x) && (tagged || !RULE_WORDS.test(x)));
  // dedupe, drop the query itself
  const seen = new Set([selection.trim().toLowerCase()]);
  return clean.filter((x) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Split bullet text into items for display; tolerates * and - bullets and numbered lists. */
export function parseBullets(response) {
  return response
    .split(/\r?\n|(?=\s\*\s)/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Chat messages per well. The reader and dictionary requests are preceded by a
// one-shot demonstration exchange (small local models follow a format far
// better after one worked example); the real prompt is the last user turn.

const ENTRIES = (words) => words.map((w) => `<entry>${w}</entry>`).join('\n');

// The thesaurus: system turn with the standing instructions, then (unless the
// well turns them off) two short user/assistant exchanges, then the real request. Gemma has no system role;
// its chat template folds the system text into the first user turn.
export function thesaurusMessages(args) {
  const t = { ...TEMPLATES.thesaurus, ...(args.templates ?? {}) };
  // without the notes step the examples lose their <notes> lines too, so the request matches their shape
  const ex = (text) => (args.notes ? text : withoutNotes(text));
  const examples = args.examples === false ? [] : [
    { role: 'user', content: ex(t.example) },
    { role: 'assistant', content: t.exampleReply },
    { role: 'user', content: ex(t.example2) },
    { role: 'assistant', content: t.exampleReply2 },
  ];
  return [
    { role: 'system', content: thesaurusSystem({ ...args, template: t.system }) },
    ...examples,
    { role: 'user', content: thesaurusPrompt({ ...args, template: t.main }) },
  ];
}

/** The notes step: a short free musing about the thesaurus alone (no query), asked before the entries. */
export function thesaurusNotesMessages(args) {
  const t = { ...TEMPLATES.thesaurus, ...(args.templates ?? {}) };
  return [
    { role: 'system', content: t.notesSystem },
    { role: 'user', content: thesaurusNotesPrompt({ ...args, template: t.notesMain }) },
  ];
}

export function readerMessages(args) {
  return [
    { role: 'user', content: readerPrompt({ description: 'a baker', context: 'The kitchen was cold at five.\nI lit the oven and waited for ⟦the smell of bread⟧\nto climb the stairs.', selection: 'the smell of bread' }) },
    { role: 'assistant', content: '* "The smell of bread" arrives too early; in a real kitchen you wait forty minutes for it. Let the waiting be the poem.\n* Cold, five, oven: the nouns are honest. The abstraction "smell" is the softest thing here; a crust or a hiss would be firmer.\n* The line break after "waited for" is good yeast. Trust it.' },
    { role: 'user', content: readerPrompt({ ...args, template: args.templates?.feedback }) },
  ];
}

export function readerRevisionsMessages(args) {
  return [
    { role: 'user', content: readerRevisionsPrompt({ description: 'a baker', context: 'The kitchen was cold at five.\nI lit the oven and waited for ⟦the smell of bread⟧\nto climb the stairs.', selection: 'the smell of bread', feedback: '* "The smell of bread" arrives too early. Let the waiting be the poem.\n* A crust or a hiss would be firmer than "smell".', advice: '' }) },
    { role: 'assistant', content: ENTRIES(['the first crackle of crust', 'the hiss of the proving loaf', 'the oven to remember bread', 'forty minutes of nothing']) },
    { role: 'user', content: readerRevisionsPrompt({ ...args, template: args.templates?.revisions }) },
  ];
}

export function dictionaryMessages(args) {
  return [
    { role: 'user', content: dictionaryPrompt({ description: 'an etymology dictionary', selection: 'barrow' }) },
    // Each entry starts with the headword (the query itself), as in a printed
    // dictionary; a model that repeats it is also showing it read the query.
    { role: 'assistant', content: '* barrow (<i>n.</i>) A hand-cart; from Old English <i>bearwe</i>, "that which is borne", kin to <i>beran</i>, to carry.\n* barrow (<i>n.</i>) A burial mound; from Old English <i>beorg</i>, hill, whence also <i>iceberg</i> by way of the Dutch.' },
    { role: 'user', content: dictionaryPrompt({ ...args, template: args.templates?.main }) },
  ];
}
