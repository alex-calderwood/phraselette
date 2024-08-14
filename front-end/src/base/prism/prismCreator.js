import { Prism } from './Prism';
import { ContextPrism } from './LLM';
import { ThesaurusPrism } from './Thesaurus';
import { ReaderPrism } from './Reader';
import { Feature } from '../Feature';

const roles = {
  'thesaurus': [
    "the Spacefarer's Almanac",
    "A Tralfamadorian dictionary",
    "a precise academic/scientific thesaurus",
    "Deleuze and Guattari's thesaurus",
    "Emily Dickenson's lexicon",
    "Jane Austen's words",
    "the thesaurus James Joyce used for Ulysses",
    "an everyday English thesaurus",
    "Alfred Jarry's inverted dictionary of pataphysics",
    "a Wizard's spellbook",
  ],
  'reader': [
    "a thoughtful kind colleague open to constructively critiquing and red-teaming my ideas",
    "Noah Wardrip-Fruin, Michael Mateas, Samantha Gorman, and Allison Parrish, a computational media and digital arts PhD committee",
    "the Midjourney narrative team",
    "a group of friends who are all writers and editors and know what it's like to dish some criticism out",
    "a surrealist in the mold of Max Ernst, Marcel Duchamp, and Andre Breton",
    "Tristan Tzara, the Dadaist poet",
    "William S. Burroughs, the beat writer",
    "Mark Leyner. Leyner employs an intense and unconventional style in his works of fiction. His stories are generally humorous and absurd: In The Tetherballs of Bougainville, Mark's father survives a lethal injection at the hands of the New Jersey penal system, and so is freed but must live the remainder of his life in fear of being executed, at New Jersey's discretion, in any situation and regardless of collateral damage. They frequently incorporate elements of meta-fiction: In the same novel, an adolescent Mark produces a film adaptation of the story of his father's failed execution, although he reads a newspaper review of the movie to the prison's warden, and then dies, before even leaving the prison. At the sentence level, Leyner uses sprawling imagery and an extravagant vocabulary, bordering on prose poetry.",
  ],
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
      prism = new Prism('words', [Feature.POS]).setActive(true).setDoHighlight(true);
      prism.description="View and constrain words based on their part of speech.";
      break;
    case 'context':
      prism = new ContextPrism().setActive(false);
      prism.description="View and constraint words based on the statistical probability they follow their context.";
      break;
    case 'reader':
      prism = new ReaderPrism(randomRole('reader')).setActive(true);
      prism.description="A computational reader model that will provide feedback and alternatives of your text based on their understanding of the text.";
      prism.editable = true;
      break;
    case 'thesaurus':
      prism = new ThesaurusPrism(randomRole('thesaurus')).setActive(false);
      prism.description="A stylized thesaurus that allows you to specify";
      prism.editable = true;
      break;
    case 'sound':
      prism = new Prism('sound', [Feature.Sound, Feature.Rhyme], 'words').setActive(false);
      prism.description="A phonetic analyzer that allows you to view and constraint words based on their sound, rhyme scheme, and meter.";
      break
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