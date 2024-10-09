import { getUniqueID } from '../scripts/utils';

function mockAlternates () {
    let alternates = new Set();
    for (let i = 0; i < 5; i++) {
        alternates.add(new Token({
            type: 'token',
            id: getUniqueID(),
            text: "mock " + i,
        }, false));
    }
}

export class Token {
    constructor(rawToken, doMock=false) {
        const defaults = {
            type: 'token',
            id: rawToken.id ? rawToken.id : getUniqueID(),
            text: "",
            start: undefined,
            end: undefined,
            alternates: doMock ? mockAlternates() : new Set(),
        };

        // custom attributes
        this.attributes = {};

        // First, assign default values, then override with provided values
        rawToken = Object.assign({}, defaults, rawToken);

        let defaultKeys = Object.keys(defaults);
        let potentialAttributes = Object.assign({}, rawToken, rawToken.extra);
        delete potentialAttributes.extra;
        for(let [key, value] of Object.entries(potentialAttributes)) {
            if (!defaultKeys.includes(key)) {
                this.setAttribute(key, value);
            } else {
                this[key] = value;
            }
        }
        this.raw = rawToken;
    }

    setAttribute(name, value) {
        this.attributes[name] = value;
    }

    getAttribute(name, defaultValue=null) {
        // Direct attribute check
        if (name in this.attributes) {
            return this.attributes[name];
        }

        // Nested attribute check
        for (let value of Object.values(this.attributes)) {
            if (typeof value === 'object' && value !== null && name in value) {
                return value[name];
            }
        }

        // If the attribute doesn't exist in the custom attributes,
        // check if it exists as a property of the token
        if (name in this) {
            return this[name];
        }
        return defaultValue;
    }
}