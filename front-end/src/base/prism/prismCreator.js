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
function randomRole(prism) {
  let role = roles[prism.type];
  if(role) {
    return role[Math.floor(Math.random() * role.length)];
  }
  throw new TypeError('Invalid prism or prism name not found in roles');
}

let possibilities = {
  'words':      new Prism('words', [Feature.POS]).setActive(true).setDoHighlight(true),                                                                 
  'likelihood': new LLMProbabilityPrism().setActive(true),
  'critic':     new CriticPrism('a grumpy circus clown'),
  'dictionary': new DictionaryPrism("the Spacefarer's Almanac"),
  'sound':      new Prism('sound', [Feature.Sound, Feature.Rhyme], 'words'),
  'basic':      new Prism('basic'),         
  'probability-base':  
                new Prism('probability-base'),
}

function convertToPrismIdKeys(possibilities) {
  const newDict = {};
  
  for (const [key, prism] of Object.entries(possibilities)) {
    if (prism && typeof prism === 'object') {
      newDict[prism.id] = prism;
    } else {
      console.warn(`Skipping entry '${key}': Not a valid Prism object`);
    }
  }
  
  return newDict;
}

export function initialPrisms() {
  return convertToPrismIdKeys(possibilities);
}

export function availablePrismTypes() {
  return Object.keys(possibilities);
}

export function getDefaultPrism(type) {
  return possibilities[type];
}
