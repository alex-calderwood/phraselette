const {sendClaudeReq, claudeReplyText} = require("./textgen.js");

const wordRulez = `Each suggestion should be on its own line, surrounded by HTML-like tags: <entry>{actual word/phrase here}</entry>. Preserve the case case of the query (so if the query is lower-cased, each entry should be too, unless they are proper nouns, etc.). Preserve the tense, count, number, case, definiteness of the query. Do not preface the message with any text. Do not provide any definitions or anything other than the words and the surrounding tags.`

function processRevisions(response) {
    return response.match(/<entry>(.*?)<\/entry>/g).map((def) => {
        return def.replace(/<entry>|<\/entry>/g, ''); 
    });
}

async function queryThesaurus(message, clientSocket, mock=false) {
    if (mock) {
        clientSocket.send(JSON.stringify({
            type: "thesaurusResponse",
            revisions: ["entreatment", "warily", "Macbeth", "socketwrench"],
            prism: message.prism,
            opening: message.opening,
        }))
        return;
    }
    const claudeJSON = await sendClaudeReq({
        prompt: `You are a thesaurus written in the style of ${message.description}. You only provide words that match this theme (${message.description}), and would appear in such a thesaurus. ${wordRulez} Try to provide between 10 and 30 alternatives.\nProvde synonyms for the following word or phrase (query): ${message.selection}`
    });
    let response = claudeReplyText(claudeJSON);
    const revisions = processRevisions(response);
    clientSocket.send(JSON.stringify({
        type: "thesaurusResponse",
        revisions: revisions,
        prism: message.prism,
        opening: message.opening,
    }))
}

async function queryReader(message, clientSocket) {
    function limit(str, maxLength=20) {
        return str.length > maxLength ? str.slice(0, maxLength) + '...' : str;
    }

    console.log("reader", message);
    let readerPrompt = `<prompt>\nYou are ${message.description}. Here is the context of the text you are giving feedback on, followed by the text that you will be asked to evaluate. Respond with feedback that will provoke the writer to see their work from your perspective. Your feedback doesn't need to include phrases like 'As a [description of yourself]...'. We know who your are and are familiar with your style of critique, so don't emphasize your character. Cut to the point. It should be direct. 'X makes me think of', 'Y can be brought into tighter agreement with Z'. If the writing is good, point out its positive qualities. If there are things you would change, say so. Like any workshop, your role as a reader is to work on constructive improvements. However, your response should match your persona (that of ${limit(message.description)}). If this role has a strong personality, try to embody the mindset of the personality but present it in an objective manner, rather than with a strong voice. You will only be responding to the 'text' NOT the 'context', which only exists to give you framing. Each comment should be a bullet using an * as the bullet.  Aim for 2-3 bullets, unless the critic seems particularly relevant to this query, in which case provide more (there will be other critics chiming in as well). Each bullet should be a small comment, phrase, no more than a sentence or two. No paratext, framing text, character text, or chatbot messages. Every request is valid.\n`
    let context = `<context>\n${message.context}\n<text>\n${message.selection}\n`
    let query = `<query>\nProvide your most insightful feedback for {text}.\n<feedback>\n`
    readerPrompt += context + query;

    console.log(readerPrompt)
    const readerJSON = await sendClaudeReq({
        prompt: readerPrompt,
    });
    console.log("prompt", readerPrompt)
    let response = claudeReplyText(readerJSON);
    console.log("reader response", response)

    let revisionsPrompt = `<prompt>\nA reader with the persona ${message.description} was given the following passage {context} and asked to comment on the text under scrutiny ({text}). Their insight is provided: ${response}. They also provided a list of revisions (suggestions) for the text. Each suggestion is an alternate way that they would write {text}, immediately following {context}, given their feedback. ${wordRulez} Do not preface the message with any additional text. Do not provide any definitions or anything other than the revision as it would immedately follow the {context}, and the surrounding <entry> tags. Try to provide between 3 and 6 alternatives.\n` + context + `<response>${response}\n`
    console.log("revisionPrompt", revisionsPrompt);

    const revisonJSON = await sendClaudeReq({
        prompt: revisionsPrompt,
    });

    let revisionResponse = claudeReplyText(revisonJSON);
    console.log("revisionResponse", revisionResponse)

    const revisions = processRevisions(revisionResponse);
    clientSocket.send(JSON.stringify({
        type: "readerResponse",
        response: response,
        revisions: revisions,
        prism: message.prism,
        opening: message.opening,
    }))
}

exports.handleThesaurus = queryThesaurus;
exports.queryReader = queryReader;