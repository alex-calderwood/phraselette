import { Prism } from './Prism';
import { LLMProbabilityPrism } from './LLM';
import { DictionaryPrism } from './Dictionary';
import { CriticPrism } from './Critic';
import { Feature } from '../Feature';

const roles = {
  'dictionary': [
    "the Spacefarer's Almanac",
  ],
  'critic': [
    'a circus clown who is too old for this',
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
    case 'likelihood':
      prism = new LLMProbabilityPrism().setActive(true);
      break;
    case 'critic':
      prism = new CriticPrism(randomRole('critic'));
      break;
    case 'dictionary':
      prism = new DictionaryPrism(randomRole('dictionary'));
      break;
    case 'sound':
      prism = new Prism('sound', [Feature.Sound, Feature.Rhyme], 'words');
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