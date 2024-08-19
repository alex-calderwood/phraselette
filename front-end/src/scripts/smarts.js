import { Token } from "../base/Token.js";
import { Sequence } from "../base/Sequence.js";
import { streamFromWebSocket } from "./socket.js";

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
  
  let rawTokenPromise = await tokenGenerator.next();
  while (!rawTokenPromise.done) {
    let rawToken = rawTokenPromise.value;

    let token = makeWordToken(rawToken);
    tokens.push(token);

    // don't wait for the generator to finish
    // instead, call onToken for each token
    if (onToken) {
      onToken(token);
    }
    rawTokenPromise = await tokenGenerator.next();
  }

  return tokens;
}

function makeWordToken(rawToken) {
  console.log("smarts: raw", rawToken);
  let tokenData = {
    "type":         "words",
    'start':        rawToken.start, // inclusive
    'end':          rawToken.end,   // inclusive
    "text":         rawToken.text,
    "pos":          rawToken.pos,
    "isSpacySpace": rawToken.is_space,
    "isWord":       true,
    "extra":        rawToken.extra,
    "generic":      rawToken.generic,
  }

  let token = new Token(tokenData);
  return token;
}

export function makeProbToken(rawToken, rawIsInclusive=false) {
  return new Token({
    // rawToken.span may be exclusive, our start and end is inclusive
    'start': rawToken.span[0],
    'end': rawToken.span[1] - (rawIsInclusive ? 0 : 1),
    "text": rawToken.token,
    "type": 'probs',
    "prob": rawToken.prob,
    "logProb": rawToken.log_prob,
    "alternates": rawToken.alternates ? rawToken.alternates.map((alt) => { return new Token({
      "start": alt.span[0],
      "end": alt.span[1],
      "text": alt.token,
      "prob": alt.prob,
      "logProb": rawToken.log_prob,
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

  await (yield* streamFromWebSocket("probs", data));
}

async function* callSpacy(context, tokenizeRange, additionalRequests) {
  // get the text to tokenize based on the inclusive range
  const text = context.substring(tokenizeRange[0], tokenizeRange[1] + 1);
  const preContext = context.substring(0, tokenizeRange[0]);

  const data = {
    text: preContext + text,
    requests: additionalRequests,
  };

  await (yield* streamFromWebSocket('spacy', data));
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
    return [[], null];
  }

  if (!depth || depth < 1) {
    console.error("searchForward called with invalid depth", depth);
    return [[], null];
  }
  let sequenceGenerator = callSearch(document.prefixText, top_k, depth);

  let promise = await sequenceGenerator.next();
  let summary = null;
  let predictedSequences = [];
  while (!promise.done) {
    let rawSequence = promise.value;

    if (rawSequence.thing != null && rawSequence.thing == 'summary') {
      summary = rawSequence.summary;
    } else {
      let sequence = rawSequence.map((alt) => { 
        let token = makeProbToken(alt, true); 
        token.type = "alternate";
        return token;
      });
      predictedSequences.push(new Sequence(sequence));
    }

    promise = await sequenceGenerator.next();
  }

  return [predictedSequences, summary];
}

async function* callSearch(prefix, top_k, depth) {
  const data = {
    text: prefix,
    top_k: top_k,
    depth: depth,
  };

  await (yield* streamFromWebSocket('search', data));
}

/*
 * Turn the tokens into text and then call spacy to turn them into word tokens. 
 * 
 * TODO to speed this up we can reuse spacy's tokenization
 * https://stackoverflow.com/questions/53594690/is-it-possible-to-use-spacy-with-already-tokenized-input
 * but for now let's just retokenize
 * 
*/
export async function miscTokensToWordTokens(sequence, document, maxWords=null) {
  let tokenSpan = sequence.span;

  if (tokenSpan.length === 0 || maxWords === 0) { return []; }

  let sequenceCopy = JSON.parse(JSON.stringify(sequence));
  console.log('smarts: miscTokensToWordTokens', tokenSpan, document, sequenceCopy, document.prefixText, sequenceCopy.textContent);


  // compute the text that results from adding the span we are evaluating to the rest of the prefix
  let newText = document.prefixText + tokenSpan.reduce(
    (acc, token) => {
      return acc + token.text;
    },
    ''
  );

  let spacyWordTokens = await spacyTokenize(newText, { 
    onToken: (token) => { }, 
    requests: document.tokenManager.activePrisms.map((prism) => prism.type) 
  });

  // now we need to split it back into the tokens that were in after the given text
  let splitIndex = tokenSpan[0].start;
  if (splitIndex === undefined) { splitIndex = document.prefixText.length; }
  let newWordTokens = spacyWordTokens.filter((token) => { return token.end >= splitIndex; });
  
  if (maxWords !== null) { newWordTokens = cutToMaxWords(maxWords, newWordTokens); }

  // grab any information from the original token and assign it to the word token
  let originalTokenIndex = 0;
  for (let i = 0; i < newWordTokens.length; i++) {
    let wordToken = newWordTokens[i];
    let originalTokens = []; // Array to store all overlapping original tokens
    let partialLogProbs = []; // Array to store partial log probs for tokens that partially overlap
    
    while (originalTokenIndex < tokenSpan.length) {
      let originalToken = tokenSpan[originalTokenIndex];
      
      // Check for any kind of overlap
      if (originalToken.start <= wordToken.end && originalToken.end >= wordToken.start) {
        // Calculate the overlap
        let overlapStart = Math.max(originalToken.start, wordToken.start);
        let overlapEnd = Math.min(originalToken.end, wordToken.end);
        let overlapLength = overlapEnd - overlapStart + 1;
        let originalTokenLength = originalToken.end - originalToken.start + 1;
        
        // Calculate the fraction of the original token that overlaps with this word token
        let overlapFraction = overlapLength / originalTokenLength;
        
        // Store the original token and its partial log prob
        originalTokens.push(originalToken);
        let partialLogProb = (originalToken.getAttribute('logProb', 0) || Math.log(originalToken.getAttribute('prob', 1))) * overlapFraction;
        partialLogProbs.push(partialLogProb);
        
        // Move to the next original token if we've passed its end
        if (originalToken.end <= wordToken.end) {
          originalTokenIndex++;
        } else {
          // If the original token extends beyond this word token, we'll need to consider it for the next word token too
          break;
        }
      } else if (originalToken.start > wordToken.end) {
        // We've moved past the current word token, break the inner loop
        break;
      } else {
        // The original token ends before the word token starts, move to the next original token
        originalTokenIndex++;
      }
    }

    wordToken.setAttribute('partialLogProbs', partialLogProbs)
    wordToken.setAttribute('originalTokens', originalTokens)
    
    // Calculate the combined log probability
    if (originalTokens.length > 0) {
      // Sum partial log probabilities
      let logProb = partialLogProbs.reduce((sum, logProb) => sum + logProb, 0);
      wordToken.setAttribute('logProb', logProb);
      // Store the number of tokens that made up this word (including partials)
      let tokenCount = originalTokens.length;
      wordToken.setAttribute('tokenCount', tokenCount);
      // Store the arithmetic mean of the log probabilities
      let logProbMean = logProb / tokenCount;
      wordToken.setAttribute('logProbMean', logProbMean);
      wordToken.setAttribute('prob', logProbMean);

      
      // If you need the actual probabilities, exponentiate:
      wordToken.setAttribute('probGeometricMean', Math.exp(logProbMean));
    }
  }

  return newWordTokens;
}

function cutToMaxWords(maxWords, tokens) {
  let wordCount = 0;
  let result = [];
  let lastWordIndex = -1;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const isSpace = token.getAttribute('isSpacySpace') || token.getAttribute('pos') === "_SP";
    if (wordCount >= maxWords) break;

    if (!isSpace) {
      wordCount++;
      lastWordIndex = result.length;
    }

    result.push(token);
  }
  return result;
}
