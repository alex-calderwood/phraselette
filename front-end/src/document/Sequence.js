import { getUniqueUUID } from '../scripts/utils';

export class Sequence {
    constructor(tokens=[], scores={}) {
        this.span = tokens;
        this.scores = scores;
        this.id = getUniqueUUID();
    }
}