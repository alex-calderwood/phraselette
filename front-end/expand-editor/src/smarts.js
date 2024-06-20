// Something unlikely to be seen, must match the tokenization in the backend (server.py)
const breakToken = "&&VE*A=]";

/* 
  This function takes a context and a range of text to tokenize.
  It sends the context and the text to the GPT-2 server, which returns a stream of tokens.

  context: string - the text before the range to tokenize
  tokenizeRange: [int, int] - the range of text to tokenize (inclusive)
*/
async function* tokenizeWithGPT2(context, tokenizeRange) {
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


export { tokenizeWithGPT2 };