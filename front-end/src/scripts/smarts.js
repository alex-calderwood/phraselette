import { Token } from "../base/Token.js";
import { Sequence } from "../base/Sequence.js";

// Something unlikely to be seen, must match the tokenization in the backend (server.py)
const breakToken = "&&VE*A=]";

function badData(text) {
  if (!text || text.length === 0) {
    console.error("tokenizer passed empty text");
    return true;
  }
  return false;
}

// todo eventually we want to calculate this based on data.document
function makeTokenizationRange(text, data) {
  if(data.tokenizeRange) { // 'tokenizeRange' is not defined
    return data.tokenizeRange;
  } else {
    return [0, text.length - 1]
  }
}

async function* streamFromServer(endpoint, data) {
  try {
    const response = await fetch(`http://127.0.0.1:5000/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(breakToken);
      buffer = lines.pop();

      for (const line of lines) {
        if (line.trim()) {
          const token = JSON.parse(line);
          yield token;
        }
      }
    }
  } catch (error) {
    console.error(`There has been a problem with your ${endpoint} fetch operation:`, error);
  }
}

/* 
 * Turn the text into a list of tokens using spacy in the backend. 
 * TODO to speed this up we would like to be able to pass in the beginning of a sentence
 * and have it only tokenize the end. 
 * 
 * We currently tokenize the entire text regardless of the data.tokenizationRange parameter
 * 
 * Calls onToken when each token is recieved.
 *
*/ 
export async function spacyTokenize(text, data = {}) {
  if (badData(text)) return;

  let onToken = data.onToken;
  let requests = data.requests || [];
  delete data.tokenizationRange // right now we tokenize the whole thing
  let tokenizeRange = makeTokenizationRange(text, data);
  let tokenGenerator = callSpacy(text, tokenizeRange, requests);

  let tokens = [];

  // don't wait for the generator to finish
  // instead, call onToken for each token
  let rawTokenPromise = await tokenGenerator.next();
  while (!rawTokenPromise.done) {
    let rawToken = rawTokenPromise.value;
    let tokenData = {
      'start': rawToken.start,     // inclusive
      'end':   rawToken.end,       // inclusive from server
      "text":  rawToken.text,
      "pos":   rawToken.tag,       // Todo looks like there is also a '.pos' need to see if there is a difference
      "isSpace": rawToken.is_space,
      "type":  "words",
      "isWord": true,
    }
    if (rawToken.extra && typeof rawToken.extra === 'object') {
      for (let key in rawToken.extra) {
        if (rawToken.extra.hasOwnProperty(key)) {
          tokenData[key] = rawToken.extra[key];
        }
      }
      delete rawToken.extra;
    }
    tokenData['raw'] = rawToken;
    
    let token = new Token(tokenData);
    tokens.push(token);
    if (onToken) {
      onToken(token);
    }
    rawTokenPromise = await tokenGenerator.next();
  }

  return tokens;
}

export function makeProbToken(rawToken) {
  return new Token({
    // rawToken.span is exclusive, our start and end is inclusive
    'start': rawToken.span[0],
    'end': rawToken.span[1] - 1,
    "text": rawToken.token,
    "type": 'probability-base',
    "prob": rawToken.prob,
    "alternates": rawToken.alternates ? rawToken.alternates.map((alt) => { return new Token({
      "start": alt.span[0],
      "end": alt.span[1],
      "text": alt.token,
      "prob": alt.prob,
      "type": "alternate",
    }) } ) : [],
  })
}

/* 
 * Return a list of tokens and their probabilities. 
*/
export async function gpt2Tokenize(text, data = {}) {
  if (badData(text)) return;

  let onToken = data.onToken;
  let tokenizeRange = makeTokenizationRange(text, data);
  let alternates = 15; // The number of alternate tokens to return (the highest probability tokens according to the LM)
  let tokenGenerator = callGPT2(text, tokenizeRange, alternates);

  let tokens = [];
  // don't wait for the generator to finish
  // instead, call onToken for each token
  let rawTokenPromise = await tokenGenerator.next();
  while (!rawTokenPromise.done) {
    let rawToken = rawTokenPromise.value;
    let token = makeProbToken(rawToken);
    tokens.push(token);
    if (onToken) {
      onToken(token);
    }
    rawTokenPromise = await tokenGenerator.next();
  }

  return tokens;
}

export function splitWordTokenize(text, data = {}) {
  let type = "basic";
  let tokens = [];
  let tokenStart = 0;
  let curToken = "";
  for (let i = 0; i < text.length; i++) {
    let c = text[i];
    curToken += c;
    if (c.match(/\s+/g) || i === text.length - 1) {
      let nextProb = Math.random();
      tokens.push(new Token({
        'start': tokenStart,
        'end': i,
        "text": curToken,
        "type": type,
        "prob": nextProb,
      }));
      curToken = "";
      tokenStart = i + 1;

      continue; // TODO I think we want to save spaces as special ' ' tokens?
    }
  }
  return tokens;
}

/* 
  This function takes a context and a range of text to tokenize.
  It sends the context and the text to the GPT-2 server, which returns a stream of tokens.

  This function will silently do nothing if the server is busy, which is intentional becuase we will detect that elsewhere.

  context: string - the text before the range to tokenize
  tokenizeRange: [int, int] - the range of text to tokenize (inclusive)
*/
async function* callGPT2(context, tokenizeRange, alternates=0) {
  // get the text to tokenize based on the inclusive range
  const text = context.substring(tokenizeRange[0], tokenizeRange[1] + 1);
  const preContext = context.substring(0, tokenizeRange[0]);

  const data = {
    context: preContext,
    text: text,
    top_k: alternates,
  };

  await (yield* streamFromServer("probs", data));
}

async function* callSpacy(context, tokenizeRange, additionalRequests) {
  // get the text to tokenize based on the inclusive range
  const text = context.substring(tokenizeRange[0], tokenizeRange[1] + 1);
  const preContext = context.substring(0, tokenizeRange[0]);

  const data = {
    text: preContext + text,
    requests: additionalRequests,
  };

  await (yield* streamFromServer('spacy', data));
}

/* 
  This function takes a document and a set of constraints.
  It calls the backend to run a constrained forward search.

  document: Document - the document to tokenize and search
  constraints: [Constraint] - a list of constraints to search for

  returns: [Token] - a list of tokens spans that satisfy the constraints (each token span is a list of tokens)
*/
export async function searchForward(document, constraints, depth, top_k=50) {
  if (document.prefixText.length === 0) {
    return [];
  }

  if (!depth || depth < 1) {
    console.error("searchForward called with invalid depth", depth);
    return [];
  }
  let tokenGenerator = callSearch(document.prefixText, top_k, depth);

  let promise = await tokenGenerator.next();
  let predictedSequence = [];
  while (!promise.done) {
    let rawSequence = promise.value;

    let sequence = rawSequence.map((alt) => { return new Token({
      "text": alt.token,
      "prob": alt.prob,
      "start": alt.span[0],
      "end": alt.span[1],
      "type": "alternate",
    }) } );

    predictedSequence.push(new Sequence(sequence));
    promise = await tokenGenerator.next();
  }

  return predictedSequence;
}

async function* callSearch(prefix, top_k, depth) {
  const data = {
    text: prefix,
    top_k: top_k,
    depth: depth,
  };

  await (yield* streamFromServer('search', data)); // TODO I'm not sure if this await is going to batch everything?
}

export async function getPhones(words) {
  let tokenGenerator = callPhones(words);

  let tokens = [];
  let rawTokenPromise = await tokenGenerator.next();
  while (!rawTokenPromise.done) {
    let rawToken = rawTokenPromise.value;
    let token = new Token({
      'start': rawToken.start,     // inclusive
      'end':   rawToken.end,       // inclusive from server
      "text":  rawToken.text,
      "pos":   rawToken.tag,       // Todo looks like there is also a '.pos' need to see if there is a difference
      "raw":   rawToken,
      "type":  "phone",
    });
    tokens.push(token);
    rawTokenPromise = await tokenGenerator.next();
  }

  return tokens;
}

async function* callPhones(text) {
  const data = {
    text: text
  };

  await (yield* streamFromServer('phones', data));
}

/*
 * Turn the tokens into text and then call spacy to turn them into word tokens. 
 * 
 * TODO to speed this up we can reuse spacy's tokenization
 * https://stackoverflow.com/questions/53594690/is-it-possible-to-use-spacy-with-already-tokenized-input
 * but for now let's just retokenize
 * 
*/
export async function miscTokensToWordTokens(tokenSpan, document, maxWords=null) {
  if (tokenSpan.length === 0 || maxWords === 0) { return []; }

  // compute the text that results from adding the span we are evaluating to the rest of the prefix
  let newText = document.prefixText + tokenSpan.reduce(
    (acc, token) => {
      return acc + token.text;
    },
    ''
  );

  let resultantWordTokens = await spacyTokenize(newText, { 
    onToken: (token) => { }, 
    requests: document.tokenManager.activePrisms.map((prism) => prism.type) 
  });

  // now we need to split it back into the tokens that were in after the given text
  let splitIndex = tokenSpan[0].start;
  if (splitIndex === undefined) { splitIndex = document.prefixText.length; }
  let convertedTokens = resultantWordTokens.filter((token) => {
    return token.end >= splitIndex;
  });
  
  if(maxWords !== null) {
    let wordCount = 0;
    convertedTokens = convertedTokens.filter((token) => {
      if (token.isSpace || token.pos == "_SP") { return true; }
      wordCount++;
      return wordCount <= maxWords;
    });
  }

  let firstWord = convertedTokens[0]; // it is possible for this to be undefined if the tokenSpan was just empty space (' ') token(s)
  if (firstWord && firstWord.start < splitIndex) {
    let diff = splitIndex - firstWord.start;
    firstWord.text = firstWord.text.slice(diff);
    firstWord.start = splitIndex;
    firstWord.incomplete = true;
  }

  return convertedTokens;
}