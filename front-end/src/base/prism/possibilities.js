import { Prism } from './Prism';
import { LLMProbabilityPrism } from './LLM';
import { DictionaryPrism } from './Dictionary';
import { CriticPrism } from './Critic';
import { Feature } from '../Feature';

  // initialize a set of possible prisms
export function possibilities() {
    return {
      'words':      new Prism('words', [Feature.POS]).setActive(true).setDoHighlight(true),                                                                 
      'likelihood': new LLMProbabilityPrism().setActive(true),
      'critic':     new CriticPrism('a grumpy circus clown'),
      'dictionary': new DictionaryPrism("the Spacefarer's Almanac"),
      'sound':      new Prism('sound', [Feature.Sound, Feature.Rhyme], 'words'),
      'basic':      new Prism('basic'),         
      'probability-base':  
                    new Prism('probability-base'),
    }
  }