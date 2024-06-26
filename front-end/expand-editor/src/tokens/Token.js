let curTokenID = 0;
function createTokenID() {
  return curTokenID++;
}

export class Token {
    constructor(options) {
        const defaults = {
            prob: 0,
            id: options.id ? options.id : createTokenID(),
        };

        // First, assign default values, then override with options if provided
        Object.assign(this, defaults, options);
    }
}