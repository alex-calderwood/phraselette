const {sendClaudeReq, claudeReplyText} = require("./textgen.js");

async function testClaude(message) {
    const claudeJSON = await sendClaudeReq({
        prompt: "tell me a joke about driving from San Francisco to Santa Cruz that will actually make me laugh."
    });
    let reply = claudeReplyText(claudeJSON);
    clientSocket.send(JSON.stringify({
        type: "test",
        text: reply,
    }))
}

async function queryDictionary(message, clientSocket) {
    const claudeJSON = await sendClaudeReq({
        prompt: `You are a dictionary written in the style of ${message.description}. You only provide words that match this theme (${message.description}), and would appear in such a dictionary. Eacy word should be on its own line, surrounded by HTML-like tags: <entry>{actual word/phrase here}</entry>. Do not preface the message with any text. Do not provide any definitions or anything other than the words and the surrounding tags.\nProvde synonyms for the following word: ${message.word}`
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
    console.log("dictionary", message);
    const claudeJSON = await sendClaudeReq({
        prompt: `You are a dictionary written in the style of ${message.description}. You only provide words that match this theme (${message.description}), and would appear in such a dictionary. Eacy word should be on its own line, surrounded by HTML-like tags: <entry>{actual word/phrase here}</entry>. Do not preface the message with any text. Do not provide any definitions or anything other than the words and the surrounding tags.\nProvde synonyms for the following word: ${message.word}`
    });
    console.log("completion", claudeJSON);
    let response = claudeReplyText(claudeJSON);
    // regex out the words
    const definitions = response.match(/<entry>(.*?)<\/entry>/g).map((def) => {
        return def.replace(/<entry>|<\/entry>/g, ''); 
    });
    clientSocket.send(JSON.stringify({
        type: "criticResponse",
        definitions: definitions,
    }))
}

exports.handleDictionary = queryDictionary;
exports.queryCritic = queryCritic;
exports.testClaude = testClaude;