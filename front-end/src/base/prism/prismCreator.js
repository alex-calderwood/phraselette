import { Prism } from './Prism';
import { ContextPrism } from './LLM';
import { ThesaurusPrism } from './Thesaurus';
import { ReaderPrism } from './Reader';
import { Feature } from '../Feature';
import { DictionaryPrism } from './Dictionary';

const roles = {
  'thesaurus': [
    "the Spacefarer's Almanac",
    "A Tralfamadorian dictionary. The Tralfamadorians are an alien species that abduct Billy Pilgrim, keep him prisoner, and teach him their philosophy on life. They are green and resemble toilet plungers with eyes. The Tralfamadorians are fatalists – they believe that everything is predestined and that nothing can be done to change the course of the universe. They can time travel and do not view time linearly: “All moments, past, present and future, always have existed, always will exist.” Because of this, they know how and when the universe will end, but they accept this, as their worldview dictates that they have no power to change future events.",
    "a precise academic/scientific thesaurus",
    "Deleuze and Guattari's thesaurus",
    "Derrida's catch phrases and deep cuts",
    "a romance novel's lexicon",
    "Emily Dickenson's playful lexicon (extremely playful Dickenson thesaurus)",
    "Jane Austen's country house 'free indirect discourse' or 'free indirect style' lexicon",
    "the thesaurus James Joyce used for Ulysses",
    "an everyday English thesaurus",
    "Alfred Jarry's inverted dictionary of pataphysics",
    "William Carlos Williams' observations",
    "a Wizard's wacky spellbook",
    "James Gleick's precise scientific thesaurus",
    "a thesaurus of meaningless words",
    "a thesaurus of metonyms",
    "a thesaurus of homonyms and near homonyms (words having the same spelling or pronunciation but different meanings and origins)",
    "a thesaurus of homophones and near homophones (words having the same pronunciation but different meanings, origins, or spelling)",
    "a thesaurus of hypernyms (a word with a broad meaning that more specific words fall under)",
    "a thesaurus of hyponyms (a word or phrase whose semantic field is more specific than its hypernym)",
  ],
  'reader': [
    "a surrealist in the mold of Max Ernst, Marcel Duchamp, and Andre Breton",
    "a baker",
    "Georg Cantor",
    "Gertrude Abercrombie",
    "a group theorist",
    "Tristan Tzara, the Dadaist poet",
    "Trotsky, the Russian revolutionary",
    "a confident expert in a different field who provides competent and broad feedback despite being uninformed on this topic",
    "William S. Burroughs, cut-up maniac",
    "Cormac McCarthy after writing Blood Meridian",
    "J.R.R. Tolkein in a whimsical mood",
    "Virginia Woolf, an author of fractured narratives, stream-of-consciousness prose, focus on characters' interior monologue, writing 'psychological novels'",
    "a thousand year old vampire",
    "a gothic novelist",
    "a literary critic at the Atlantic",
    "Kathy Acker, writer known for transgressive and appropriative writing, also wrote in the post-nouveau roman European tradition",
    "Derek Walcott, San Lucian Nobel laureate whose writing gives 'an account of the simultaneous unity and division created by the ocean and by human dealings with it.'",
    "the Hulk",
    "a skateboarder who is over it, just pick a word already",
    "Donna Haraway, being expansive with novel word choice",
    "Emily Witt, the millennial NYT writer",
    "Mark Leyner. Leyner employs an intense and unconventional style in his works of fiction. His stories are generally humorous and absurd: In The Tetherballs of Bougainville, Mark's father survives a lethal injection at the hands of the New Jersey penal system, and so is freed but must live the remainder of his life in fear of being executed, at New Jersey's discretion, in any situation and regardless of collateral damage. They frequently incorporate elements of meta-fiction: In the same novel, an adolescent Mark produces a film adaptation of the story of his father's failed execution, although he reads a newspaper review of the movie to the prison's warden, and then dies, before even leaving the prison. At the sentence level, Leyner uses sprawling imagery and an extravagant vocabulary, bordering on prose poetry.",
  ],
  'dictionary': [
    "a romantic era dictionary",
    "an incorrect dictionary",
    "a historical dictionary, which deals not only with the latterday meanings of words but also the historical development of their forms and meanings",
    "an etymology dictionary",
    "a joke dictionary",
    "an English to Greek dictionary",
    "a defining dictionary (which provides a core glossary of the simplest meanings of the simplest concepts)",
    "a psychoanalytic dictionary",
    "a prescriptive dictionary (highly opinionated on words and their meanings)",
    "a descriptive dictionary (20th-century dictionaries such as the Oxford English Dictionary and Webster's Third are descriptive, and attempt to describe the actual use of words)",
    "a psychologist's dictionary",
    "a 14th century English dictionary",
    "a 17th century Irish dictionary",
    "The Dictionary El Otro, the English language descriptive dictionary put together by students of Borges, who noted \"It is often forgotten that (dictionaries) are artificial repositories, put together well after the languages they define.\"",
  ]
}

/* randomly select a role from the roles */
export function randomRole(type) {
  let role = roles[type];
  if(role) {
    return role[Math.floor(Math.random() * role.length)];
  }
  throw new TypeError('Invalid prism or prism name not found in roles', type);
}

export function makePrism(type, callbacks) {
  let prism = null;
  switch(type) {
    case 'words':
      prism = new Prism('words', [Feature.POS, Feature.Length]).setActive(true).setDoHighlight(true);
      prism.description="A tool to view and constrain word's part of speech.";
      break;
    case 'context':
      prism = new ContextPrism().setActive(false);
      prism.description="A tool to generate and constrain words based on the statistical probability they follow the previous context (GPT-2).";
      break;
    case 'reader':
      prism = new ReaderPrism(randomRole('reader')).setActive(false);
      prism.description="A reader model to provide feedback and alternatives to your text.";
      break;
    case 'thesaurus':
      prism = new ThesaurusPrism(randomRole('thesaurus')).setActive(false);
      prism.description="A stylistic thesaurus. Specify the type of thesaurus you would like in plain text ('a wizard's spellbook' or 'a thesaurus of meaningless words')";
      break;
    case 'dictionary':
      prism = new DictionaryPrism(randomRole('dictionary')).setActive(false);
      prism.description="A stylistic dictionary. Specify the type of dictionary you would like in plain text ('an incorrect dictionary with definititons that might be Dutch')";
      break;
      case 'sound':
      // prism = new Prism('sound', [Feature.Sound, Feature.Rhyme], 'words').setActive(false);
      prism = new Prism('sound', [Feature.Sound], 'words').setActive(false);
      prism.description="A phonetic tool that allows you to view and constraint words based on their sound, rhyme scheme, and meter.";
      break;
    // case 'basic':
    //   prism = new Prism('basic');
    //   prism.description="deprecated";
    //   prism.color = "#ffadad";
    //   break;
    // case 'probs':
    //   prism = new Prism('probs');
    //   prism.description="deprecated";
    //   prism.color = "#ffadad";
    //   break;
  }

  if (prism === null) {
    throw new TypeError('Invalid prism type', type);
  }

  prism.onSearchComplete = callbacks.onSearchComplete;
  return prism;
}

export function initialPrisms(callbacks) {
  return Prism.TYPES.reduce((acc, type) => {
      let prism = makePrism(type, callbacks);
      acc[prism.id] = prism
      return acc;
  }, {});
}