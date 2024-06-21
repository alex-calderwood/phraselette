// Something unlikely to be seen, must match the tokenization in the backend (server.py)
const breakToken = "&&VE*A=]";


let curTokenID = 0;
function createTokenID() {
  return curTokenID++;
}

export async function gpt2Tokenize(text, data = {}) {
  if (!text || text.length === 0) {
    console.error("gpt2Tokenize passed empty text");
    return;
  }

  let onToken = data.onToken;

  let tokenGenerator = callGPT2(text, [0, text.length - 1]); // TODO debug why the whole thing isn't going through

  // don't wait for the generator to finish
  // instead, call onToken for each token
  let rawTokenPromise = await tokenGenerator.next();
  while (!rawTokenPromise.done) {
    let rawToken = rawTokenPromise.value;
    let token = {
      'start': rawToken.span[0],
      // rawToken.span[1] is exclusive, our start and end is inclusive
      'end': rawToken.span[1] - 1,
      "text": rawToken.token,
      "type": "gpt-2",
      "id": createTokenID(),
      "prob": rawToken.prob,
    }
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
      tokens.push({
        'start': tokenStart,
        'end': i,
        "text": curToken,
        "type": type,
        "id": createTokenID(),
        "prob": nextProb,
      });
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

  context: string - the text before the range to tokenize
  tokenizeRange: [int, int] - the range of text to tokenize (inclusive)
*/
async function* callGPT2(context, tokenizeRange) {
  // get the text to tokenize based on the inclusive range
  const text = context.substring(tokenizeRange[0], tokenizeRange[1] + 1);
  const preContext = context.substring(0, tokenizeRange[0]);

  const data = {
    context: preContext,
    text: text,
  };

  console.log("smarts calling GPT2 with data", data);

  try {
    const response = await fetch("http://127.0.0.1:5000/probs", {
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
          console.log("smarts token", token);
          yield token;
        }
      }
    }
  } catch (error) {
    console.error("There has been a problem with your fetch operation:", error);
  }
}