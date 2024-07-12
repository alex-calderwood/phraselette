import { getUniqueUUID } from '../scripts/utils';

function mockAlternates () {
    let alternates = new Set();
    for (let i = 0; i < 5; i++) {
        alternates.add(new Token({
            type: 'token',
            id: getUniqueUUID(),
            text: "mock " + i,
        }, false));
    }
}

export class Token {
    constructor(options, doMock=true) {
        const defaults = {
            type: 'token',
            id: options.id ? options.id : getUniqueUUID(),
            prob: 0,
            text: "",
            // maintain a set of tokens that are 'alternates'
            alternates: doMock ? mockAlternates() : new Set(),
        };

        // First, assign default values, then override with options if provided
        Object.assign(this, defaults, options);
    }
}