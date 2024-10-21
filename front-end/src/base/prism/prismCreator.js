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
    "Derrida's phrasebook",
    "a romance novel phrasebook",
    "Emily Dickenson's playful lexicon (extremely playful Dickenson thesaurus)",
    "Jane Austen's country house 'free indirect discourse' or 'free indirect style' lexicon",
    "the thesaurus James Joyce used for Ulysses",
    "an everyday English thesaurus",
    "Alfred Jarry's inverted dictionary of pataphysics",
    "William Carlos Williams' observations",
    "the collected works of George R. R. Martin",
    "a Wizard's wacky spellbook",
    "James Gleick's scientific thesaurus for popular science",
  ],
  'reader': [
    "a surrealist in the mold of Max Ernst, Marcel Duchamp, and Andre Breton",
    "Tristan Tzara, the Dadaist poet",
    "Trotsky, the Russian revolutionary, during his academic years",
    "a group who are all experts in their fields (painting, ethnography, and freshwater algae), but not in mine",
    "William S. Burroughs, the beat writer",
    "Cormac McCarthy",
    "J.R.R. Tolkein",
    "James Patterson",
    "Virginia Woolf",
    "a thousand year old vampire",
    "a gothic novelist",
    "a literary critic at the Atlantic",
    "Derek Walcott",
    "Phil, someone passionate about the Caribbean, despite not having been there",
    "the Hulk",
    "a guardian of the forest",
    "Donna Haraway",
    "Emily Witt, the millennial NYT writer",
    "Mark Leyner. Leyner employs an intense and unconventional style in his works of fiction. His stories are generally humorous and absurd: In The Tetherballs of Bougainville, Mark's father survives a lethal injection at the hands of the New Jersey penal system, and so is freed but must live the remainder of his life in fear of being executed, at New Jersey's discretion, in any situation and regardless of collateral damage. They frequently incorporate elements of meta-fiction: In the same novel, an adolescent Mark produces a film adaptation of the story of his father's failed execution, although he reads a newspaper review of the movie to the prison's warden, and then dies, before even leaving the prison. At the sentence level, Leyner uses sprawling imagery and an extravagant vocabulary, bordering on prose poetry.",
  ],
  'dictionary': [
    "a gothic dictionary",
    "a subtly incorrect dictionary",
    "a historical dictionary, which deals not only with the latterday meanings of words but also the historical development of their forms and meanings",
    "an etymology dictionary",
    "a linguistics dictionary",
  ]
}

/* randomly select a role from the roles */
function randomRole(type) {
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
      prism = new ContextPrism().setActive(true);
      prism.description="A tool to generate and constrain words based on the statistical probability they follow the previous words (based on GPT-2))";
      break;
    case 'reader':
      prism = new ReaderPrism(randomRole('reader')).setActive(false);
      prism.description="A computational reader model that will provide feedback and alternatives to your text based on its understanding of the text.";
      break;
    case 'thesaurus':
      prism = new ThesaurusPrism(randomRole('thesaurus')).setActive(false);
      prism.description="A stylistic thesaurus. Specify the type of thesaurus you would like in plain text ('a wizard's spellbook')";
      break;
    case 'dictionary':
      prism = new DictionaryPrism(randomRole('dictionary')).setActive(false);
      prism.description="A phonetic tool that allows you to view and constraint words based on their sound, rhyme scheme, and meter.";
      break;
      case 'sound':
      prism = new Prism('sound', [Feature.Sound, Feature.Rhyme], 'words').setActive(false);
      prism.description="A phonetic tool that allows you to view and constraint words based on their sound, rhyme scheme, and meter.";
      break;
    case 'basic':
      prism = new Prism('basic');
      prism.description="deprecated";
      break;
    case 'probs':
      prism = new Prism('probs');
      prism.description="deprecated";
      break;
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