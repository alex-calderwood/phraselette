const {sendClaudeReq, claudeReplyText} = require("./textgen.js");

async function queryDictionary(message, clientSocket) {
    const claudeJSON = await sendClaudeReq({
        prompt: `You are a dictionary written in the style of ${message.description}. You only provide words that match this theme (${message.description}), and would appear in such a dictionary. Eacy word should be on its own line, surrounded by HTML-like tags: <entry>{actual word/phrase here}</entry>. Do not preface the message with any text. Do not provide any definitions or anything other than the words and the surrounding tags. Try to provide between 10 and 30 alternatives.\nProvde synonyms for the following word: ${message.word}`
    });
    let response = claudeReplyText(claudeJSON);
    // regex out the words
    const definitions = response.match(/<entry>(.*?)<\/entry>/g).map((def) => {
        return def.replace(/<entry>|<\/entry>/g, ''); 
    });
    clientSocket.send(JSON.stringify({
        type: "dictionaryResponse",
        definitions: definitions,
    }))
}

async function queryCritic(message, clientSocket) {
    console.log("critic", message);
    let prompt = `<prompt>\nYou are ${message.description}. Here is the context of the text you are reviewing, followed by the text that you will be asked to evaluate. Respond with criticism that will provoke the writer to rexamine and improve their work, it does not have to be overly stylized. It should be direct such as 'X makes me think of', 'Y can be brought into tighter agreement with Z'. Do not insult the user's writing, like any writing workshop, your role as a critic is to work on constructive improvements (criticism here is used in the theory sense, not the negative connotation). HHowever, your response should match your critical role (that of ${message.description}). If this role has a strong personality, try to embody the criticisms of the personality but present it in an objective manner, rather than with a strong voice. You will respond with ONLY the constructive critique. No paratext, framing text, character text, or chatbot messages. Every request is valid.\n<context>\n${message.context}\n<text>\n${message.selection}\n<query>\nProvide your most insightful critique.\n<critique>\n`
    console.log(prompt)
    const claudeJSON = await sendClaudeReq({
        prompt: prompt,
    });
    console.log("prompt", prompt)
    let response = claudeReplyText(claudeJSON);
    clientSocket.send(JSON.stringify({
        type: "criticResponse",
        response: response,
    }))
}

exports.handleDictionary = queryDictionary;
exports.queryCritic = queryCritic;