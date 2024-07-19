import { getUniqueUUID } from '../scripts/utils';

export class Sequence {
    constructor(tokens=[]) {
        this.span = tokens;
        this.scores = {};
        this.id = getUniqueUUID();
    }
}