import { Token } from "../document/Token.js";

// Something unlikely to be seen, must match the tokenization in the backend (server.py)
const breakToken = "&&VE*A=]";

function badData(text) {
  if (!text || text.length === 0) {
    console.error("tokenizer passed empty text");
    return true;
  }
  return false;
}

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
*/ 
export async function spacyTokenize(text, data = {}) {
  if (badData(text)) return;

  let onToken = data.onToken;
  delete data.tokenizationRange // right now we tokenize the whoel thing
  let tokenizeRange = makeTokenizationRange(text, data);
  let tokenGenerator = callSpacy(text, tokenizeRange);

  let tokens = [];

  // don't wait for the generator to finish
  // instead, call onToken for each token
  let rawTokenPromise = await tokenGenerator.next();
  while (!rawTokenPromise.done) {
    let rawToken = rawTokenPromise.value;
    let token = new Token({
      'start': rawToken.start,     // inclusive
      'end':   rawToken.end,       // inclusive from server
      "text":  rawToken.text,
      "pos":   rawToken.tag,       // Todo looks like there is also a '.pos' need to see if there is a difference
      "raw":   rawToken,
      "type":  "spacy",
    });
    tokens.push(token);
    if (onToken) {
      onToken(token);
    }
    rawTokenPromise = await tokenGenerator.next();
  }

  return tokens;
}

export async function gpt2Tokenize(text, data = {}) {
  if (badData(text)) return;

  let onToken = data.onToken;
  let tokenizeRange = makeTokenizationRange(text, data);
  let alternates = 15; // The number of alternate tokens to return (the highest probability tokens according to the LM)
  let tokenGenerator = callGPT2(text, tokenizeRange, alternates);

  // don't wait for the generator to finish
  // instead, call onToken for each token
  let rawTokenPromise = await tokenGenerator.next();
  while (!rawTokenPromise.done) {
    let rawToken = rawTokenPromise.value;
    let token = new Token({
      'start': rawToken.span[0],
      // rawToken.span[1] is exclusive, our start and end is inclusive
      'end': rawToken.span[1] - 1,
      "text": rawToken.token,
      "type": 'probability',
      "prob": rawToken.prob,
      "alternates": rawToken.alternates ? rawToken.alternates.map((alt) => { return new Token({
        "start": alt.span[0],
        "end": alt.span[1],
        "text": alt.token,
        "prob": alt.prob,
        "type": "alternate",
      }) } ) : [],
    })
    if (onToken) {
      onToken(token);
    }
    rawTokenPromise = await tokenGenerator.next();
  }
}

export function splitWordTokenize(text, data = {}) {
  let type = "words";
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

  try {
    const response = await fetch("http://127.0.0.1:5000/probs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    // Error handling
    if (response.status === 409) { // busy
      return // We expect a busy signal, so try again later
    } else {
      if (!response.ok) {
        // Some other error that we may need to deal with
        throw new Error("Network response was not ok");
      }
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
    console.error("There has been a problem with your fetch operation:", error);
  }
}

async function* callSpacy(context, tokenizeRange) {
  // get the text to tokenize based on the inclusive range
  const text = context.substring(tokenizeRange[0], tokenizeRange[1] + 1);
  const preContext = context.substring(0, tokenizeRange[0]);

  const data = {
    // context: preContext,
    text: preContext + text,
  };

  try {
    const response = await fetch("http://127.0.0.1:5000/spacy", {
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
    console.error("There has been a problem with your fetch operation:", error);
  }
}

/* 
  This function takes a document and a set of constraints.
  It calls the backend to run a constrained forward search.

  document: Document - the document to tokenize and search
  constraints: [Constraint] - a list of constraints to search for

  returns: [Token] - a list of tokens spans that satisfy the constraints (each token span is a list of tokens)
*/
export async function searchForward(document, constraints, depth=2) {
  let alternates = 100;
  let tokenGenerator = callSearch(document.prefixText, alternates, depth);

  let spanPromise = await tokenGenerator.next();
  let predictedSpans = [];
  while (!spanPromise.done) {
    let rawSpan = spanPromise.value;
    console.log("searchForward span", rawSpan);

    let span = rawSpan.map((alt) => { return new Token({
      "text": alt.token,
      "prob": alt.prob,
      "start": alt.span[0],
      "end": alt.span[1],
      "type": "alternate",
    }) } );

    predictedSpans.push(span);
    spanPromise = await tokenGenerator.next();
  }

  return predictedSpans.map((span) => {
    return {
      'span': span,
      'scores': {},
    }
  });
}

async function* callSearch(prefix, alternates=0, depth=1) {
  const data = {
    text: prefix,
    top_k: alternates,
    depth: depth,
  };

  console.log("searching with data", data);

  try {
    const response = await fetch("http://127.0.0.1:5000/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    // Error handling
    if (response.status === 409) { // busy
      // We expect a busy signal, so try again later
      // Don't need to throw an error
      // console.log("Server busy");
      return
    } else {
      if (!response.ok) {
        // Some other error that we may need to deal with
        throw new Error("Network response was not ok");
      }
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
          const span = JSON.parse(line);
          console.log("recieved span", span)
          yield span;
        }
      }
    }
  } catch (error) {
    console.error("There has been a problem with your fetch operation:", error);
  }
}

/*
 * 
*/
export async function miscTokensToWordTokens(tokenSpan, document) {
  // TODO to speed this up we can reuse spacy's tokenization
  // https://stackoverflow.com/questions/53594690/is-it-possible-to-use-spacy-with-already-tokenized-input
  // but for now let's just retokenize

  // compute the text that results from adding the span we are evaluating to the rest of the prefix
  let newText = document.prefixText + tokenSpan.reduce(
    (acc, token) => {
      return acc + token.text;
    },
    ''
  );

  // Let spacy figure out where the words are in the text that results from adding
  // the span we are evaluating to the existing text
  let wordTokens = await spacyTokenize(newText, { onToken: (token) => { } });

  // now we need to split it back into the tokens that were in after the given text
  let splitIndex = tokenSpan[0].start;
  let newWordTokens = wordTokens.filter((token) => {
    return token.end >= splitIndex;
  });

  let firstWord = newWordTokens[0];
  if (firstWord.start < splitIndex) { // TODO this needs to be tested
    let diff = splitIndex - firstWord.start;
    firstWord.text = firstWord.text.slice(diff);
    firstWord.start = splitIndex;
    firstWord.incomplete = true;
  }

  console.log({tokenSpan, wordTokens, newWordTokens, splitIndex});

  return newWordTokens;
}