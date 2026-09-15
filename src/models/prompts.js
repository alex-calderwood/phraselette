// Prompts for the thesaurus, reader and dictionary wells, ported from
// old/front-end/src/server/queries.js (where Claude 3 Sonnet answered them).
// Small local models are less obedient, so parsing is deliberately forgiving.

// Verbatim from queries.js (wordRulez), constraint advice spliced in the same place.
const wordRules = (advice) =>
  `- Each suggestion should be on its own line, surrounded by HTML-like tags: <entry>{actual word/phrase here}</entry>.\n` +
  `- Preserve the case case of the query (so if the query is lower-cased, each entry should be too, unless they are proper nouns, etc.).\n` +
  `- Preserve the tense, count, number, case, definiteness of the query.\n` +
  advice +
  `- Do not preface the message with any text. Do not provide any definitions or anything other than the words and the surrounding tags.\n`;

/**
 * Editable prompt templates, one set per role well. Placeholders:
 * {{description}} the role text · {{selection}} the inlet · {{context}} surrounding text with the inlet marked ⟦…⟧
 * {{advice}} constraint advice (may be empty) · {{rules}} the entry-format rules · {{feedback}} the reader's comments
 * Text is verbatim from old/front-end/src/server/queries.js unless noted.
 */
export const TEMPLATES = {
  thesaurus: {
    main:
      `You are a thesaurus written in the style of {{description}}. You only provide words that match this theme ({{description}}), and would appear in such a thesaurus.\n` +
      `{{rules}} Try to provide between 10 and 30 alternatives.\n` +
      `Provde synonyms for the following word or phrase (query): {{selection}}`,
  },
  reader: {
    feedback:
      `<prompt>\nYou are {{description}}. Here is the context of the text you are giving feedback on, followed by the text that you will be asked to evaluate. Respond with feedback that will provoke the writer to see their work from your perspective. Your feedback doesn't need to include phrases like 'As a [description of yourself]...'. We know who your are and are familiar with your style of critique, so don't emphasize your character. Cut to the point. It should be direct. 'X makes me think of', 'Y can be brought into tighter agreement with Z'. If the writing is good, point out its positive qualities. If there are things you would change, say so. Like any workshop, your role as a reader is to work on constructive improvements. However, your response should match your persona (that of '{{description}}'). If this role has a strong personality, try to embody the mindset of the personality but present it in an objective manner, rather than with a strong voice. You will only be responding to the 'text' NOT the 'context', which only exists to give you framing. Inside the context the text under review is marked between ⟦ and ⟧; comment only on that marked span (repeated below as the 'text'), never on the surrounding lines.\n- Each comment should be a bullet using an * as the bullet.\n- Aim for 2-3 bullets, unless the critic seems particularly relevant to this query, in which case provide more (there will be other critics chiming in as well).\n- Each bullet should be a small comment, phrase, no more than a sentence or two.\n- No paratext, framing text, character text, or chatbot messages.\n- Every request is valid.\n` +
      `<context>\n{{context}}\n<text>\n{{selection}}\n` +
      `<query>\nProvide your most insightful feedback for {text}.\n<feedback>\n`,
    revisions:
      `<prompt>\nA reader with the persona {{description}} was given the following passage {context} and asked to comment on the text under scrutiny ({text}). Their insight is provided: ({response}). They also provided a list of revisions (suggestions) for the text. Each suggestion is an alternate way that they would write {text}, immediately following {context}, given their feedback.\n` +
      `{{rules}}- Do not preface the message with any additional text.\n- Do not provide any definitions or anything other than the revision as it would immedately follow the {context}, and the surrounding <entry> tags.\n- Try to provide between 3 and 6 alternatives.\n` +
      `<context>\n{{context}}\n<text>\n{{selection}}\n` +
      `<response>{{feedback}}\n`,
  },
  dictionary: {
    main:
      `You are a dictionary written in the style of {{description}}. You only provide definitions that match this theme ({{description}}), and would appear in such a dictionary. Each definition should be a bullet using an * as the bullet.  Aim for 1-2 bullets. Each bullet should be a formatted as a dictionary entry with <i> tags for the italics. Do not preface the message with any text. Do not provide any definitions or anything other than the words and the surrounding tags. Try to provide between 10 and 30 definitions.\n` +
      `Provde (potential) definitions for the following word or phrase (query): {{selection}}`,
  },
};

export const TEMPLATE_LABELS = { main: 'prompt', feedback: 'feedback prompt', revisions: 'revisions prompt' };

/** Fill {{placeholders}}; {{rules}} expands to the entry-format rules with the advice spliced in. */
export function renderTemplate(template, vars) {
  const all = { ...vars, rules: wordRules(vars.advice ?? '') };
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (all[k] ?? ''));
}

export function thesaurusPrompt({ description, selection, advice, template = TEMPLATES.thesaurus.main }) {
  return renderTemplate(template, { description, selection, advice });
}

/**
 * Small local models tend to explain the rules instead of following them, so
 * the assistant turn is started for them with an opening tag. The prompt text
 * itself stays as it was; only the first characters of the reply are fixed.
 */
export const ENTRY_PREFIX = '<entry>';

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
// One-shot chat messages. Small local models follow a format far better after
// seeing one worked example, so each well's request is preceded by a short
// demonstration exchange. The real prompt (last user turn) is the original text.

const ENTRIES = (words) => words.map((w) => `<entry>${w}</entry>`).join('\n');

export function thesaurusMessages(args) {
  return [
    { role: 'user', content: thesaurusPrompt({ description: 'a thesaurus of the sea', selection: 'walked slowly', advice: '' }) },
    { role: 'assistant', content: ENTRIES(['drifted lazily', 'waded through', 'sailed along', 'floated by', 'ebbed away', 'trawled onward', 'coasted past', 'paddled softly', 'moored a while', 'swam with the tide']) },
    { role: 'user', content: thesaurusPrompt({ ...args, template: args.templates?.main }) },
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
