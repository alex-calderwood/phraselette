import { Prism } from './Prism';
import { ContextPrism } from './LLM';
import { ThesaurusPrism } from './Thesaurus';
import { CriticPrism } from './Critic';
import { Feature } from '../Feature';

const roles = {
  'thesaurus': [
    "the Spacefarer's Almanac",
    "A Tralfamadorian dictionary",
    "a precise academic thesaurus",
    "Emily Dickenson's lexicon",
    "Jane Austen's word-hoard",
    "the thesaurus James Joyce used for Ulysses",
    "an everyday English thesaurus",
    "Alfred Jarry's inverted dictionary",
  ],
  'critic': [
    "a thoughtful kind colleague open to constructively critiquing and red-teaming my ideas",
    "a stern Ph.D. advisor named Stacy",
    "Zora Neale Hurston in her role as spirit-guide and text scholar",
    "Noah Wardrip-Fruin, Michael Mateas, Samantha Gorman, and Allison Parrish, a computational media and digital arts PhD committee",
    "the Midjourney narrative team, a group of academic-developers who are exports in computational narrative",
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
      break;
    case 'context':
      prism = new ContextPrism().setActive(true);
      break;
    case 'critic':
      prism = new CriticPrism(randomRole('critic'));
      break;
    case 'thesaurus':
      prism = new ThesaurusPrism(randomRole('thesaurus'));
      break;
    case 'sound':
      prism = new Prism('sound', [Feature.Sound, Feature.Rhyme], 'words').setActive(true);
      break;
    case 'basic':
      prism = new Prism('basic');
      break;
    case 'probability-base':
      prism = new Prism('probability-base');
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