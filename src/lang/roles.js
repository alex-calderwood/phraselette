// Built-in personas for the prompt-driven wells (from the paper build).
export const ROLES = {
  thesaurus: [
    "the Spacefarer's Almanac",
    'A Tralfamadorian dictionary. The Tralfamadorians are an alien species that abduct Billy Pilgrim, keep him prisoner, and teach him their philosophy on life. They are green and resemble toilet plungers with eyes. They are fatalists and do not view time linearly: "All moments, past, present and future, always have existed, always will exist."',
    'a precise academic/scientific thesaurus',
    "Deleuze and Guattari's thesaurus",
    "Derrida's catch phrases and deep cuts",
    "a romance novel's lexicon",
    "Emily Dickinson's playful lexicon (extremely playful Dickinson thesaurus)",
    "Jane Austen's country house 'free indirect discourse' lexicon",
    'the thesaurus James Joyce used for Ulysses',
    'an everyday English thesaurus',
    "Alfred Jarry's inverted dictionary of pataphysics",
    "William Carlos Williams' observations",
    "a Wizard's wacky spellbook",
    "James Gleick's precise scientific thesaurus",
    'a thesaurus of meaningless words',
    'a thesaurus of metonyms',
    'a thesaurus of homonyms and near homonyms (words having the same spelling or pronunciation but different meanings and origins)',
    'a thesaurus of homophones and near homophones (words having the same pronunciation but different meanings, origins, or spelling)',
    'a thesaurus of hypernyms (a word with a broad meaning that more specific words fall under)',
    'a thesaurus of hyponyms (a word or phrase whose semantic field is more specific than its hypernym)',
  ],
  reader: [
    'a surrealist in the mold of Max Ernst, Marcel Duchamp, and Andre Breton',
    'a baker',
    'Georg Cantor',
    'Gertrude Abercrombie',
    'a group theorist',
    'Tristan Tzara, the Dadaist poet',
    'Trotsky, the Russian revolutionary',
    'a confident expert in a different field who provides competent and broad feedback despite being uninformed on this topic',
    'William S. Burroughs, cut-up maniac',
    'Cormac McCarthy after writing Blood Meridian',
    'J.R.R. Tolkien in a whimsical mood',
    "Virginia Woolf, an author of fractured narratives, stream-of-consciousness prose, focus on characters' interior monologue",
    'a thousand year old vampire',
    'a gothic novelist',
    'a literary critic at the Atlantic',
    'Kathy Acker, writer known for transgressive and appropriative writing',
    "Derek Walcott, St Lucian Nobel laureate whose writing gives 'an account of the simultaneous unity and division created by the ocean'",
    'the Hulk',
    'a skateboarder who is over it, just pick a word already',
    'Donna Haraway, being expansive with novel word choice',
    'Emily Witt, the millennial NYT writer',
    'Mark Leyner, whose sentences use sprawling imagery and an extravagant vocabulary bordering on prose poetry',
  ],
  dictionary: [
    'a romantic era dictionary',
    'an incorrect dictionary',
    'a historical dictionary, which deals not only with the latterday meanings of words but also the historical development of their forms and meanings',
    'an etymology dictionary',
    'a joke dictionary',
    'an English to Greek dictionary',
    'a defining dictionary (which provides a core glossary of the simplest meanings of the simplest concepts)',
    'a psychoanalytic dictionary',
    'a prescriptive dictionary (highly opinionated on words and their meanings)',
    "a descriptive dictionary (20th-century dictionaries such as the OED and Webster's Third are descriptive, and attempt to describe the actual use of words)",
    "a psychologist's dictionary",
    "a dictionary where every word in the definition contains the letter 'e'",
    'a 14th century English dictionary',
    'a 17th century Irish dictionary',
    'The Dictionary El Otro, the English language descriptive dictionary put together by students of Borges, who noted "It is often forgotten that (dictionaries) are artificial repositories, put together well after the languages they define."',
  ],
};

export function randomRole(type, avoid = null) {
  const list = ROLES[type];
  if (!list) return '';
  let pick = list[Math.floor(Math.random() * list.length)];
  if (list.length > 1 && pick === avoid) pick = list[(list.indexOf(pick) + 1) % list.length];
  return pick;
}
