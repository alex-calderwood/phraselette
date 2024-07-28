import { getUniqueUUID } from '../scripts/utils';

export class Sequence {
    constructor(tokens=[], scores={}) {
        this.span = tokens;
        this.scores = scores;
        this.attributes = {};
        this.id = getUniqueUUID();
    }

    setScore(name, value, constraint) {
        this.scores[name] = {value, constraint};
    }

    getScore(name) {
        return this.scores[name].value;
    }

    setAttribute(name, value) {
        this.attributes[name] = value;
    }

    getAttribute(name) {
        if (name in this.attributes) {
            return this.attributes[name];
        }
        return null;
    }


    get text() {
        return this.span.map(token => token.text);
    }
}