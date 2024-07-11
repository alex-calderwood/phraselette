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

export async function spacyTokenize(text, data = {}) {
  if (badData(text)) return;

  let onToken = data.onToken;
  delete data.tokenizationRange
  let tokenizeRange = makeTokenizationRange(text, data);
  let tokenGenerator = callSpacy(text, tokenizeRange);

  // don't wait for the generator to finish
  // instead, call onToken for each token
  let rawTokenPromise = await tokenGenerator.next();
  while (!rawTokenPromise.done) {
    let rawToken = rawTokenPromise.value;
    let token = new Token({
      'start': rawToken.start,     // inclusive
      'end':   rawToken.end,       // inclusive from server
      "text":  rawToken.text,
      "type":  "spacy",
      "tag":   rawToken.tag,
      "raw":   rawToken,
    });
    if (onToken) {
      onToken(token);
    }
    rawTokenPromise = await tokenGenerator.next();
  }
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

  // console.log("smarts calling spacy with data", data);

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
export async function searchForward(document, constraints) {
  let alternates = 100;
  let searchDepth = 10;
  let tokenGenerator = callSearch(document.selectionText, document.prefixText, alternates, searchDepth);

  let rawTokenPromise = await tokenGenerator.next();
  let predictions = [];
  while (!rawTokenPromise.done) {
    let rawToken = rawTokenPromise.value;
    let alternates = rawToken.alternates ? rawToken.alternates.map((alt) => { return new Token({
      "text": alt.token,
      "prob": alt.prob,
      "type": "alternate",
    }) } ) : [];

    predictions.push(alternates);
    rawTokenPromise = await tokenGenerator.next();
  }

  return predictions[0].map((token, i) => {
    return {
      'span': [token],
      'scores': {},
    }
  });
}

async function* callSearch(text, prefix, alternates=0, searchDepth=10) {
  const data = {
    context: prefix,
    text: text,
    top_k: alternates,
    depth: searchDepth,
  };

  console.log("searching with data", data)

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
          const token = JSON.parse(line);
          yield token;
        }
      }
    }
  } catch (error) {
    console.error("There has been a problem with your fetch operation:", error);
  }
}