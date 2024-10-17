//// functions to deal with text generation tasks
/// *** import necessary functions ***
const https = require("https");
// for action tracking/undo
// const {beginActionContext, endActionContext} = require("./history.js");
// for scrap manipulation
// const {getScrap, makeScrap , refreshScrap, unpackSelection} = require("./scraps.js");
// const {sendPicreadBatch} = require("./imggen.js");
const {groupBy, capitalizeFirst, fetchJSONResponse, apiCreds} = require("./utils.js");
const {authorizeGoogle, createSheet, appendSheetItem} = require("./textgen_logging.js");

/// *** non-handler functions ***
const anthropicHostname = "api.anthropic.com";
const openaiHostname = "api.openai.com";

// make a request to Claude on the Anthropic API with proper headers.
// partialPayload should include "prompt".
// Note: this function has been adapted from the old `/v1/complete` endpoint
// to the new `/v1/messages` endpoint, and therefore has to reshape its
// `partialPayload` into a single message. We should maybe refactor this
// function to separate its "conveniently make a one-instruction Claude request
// with no additional chat context" behavior from a more general "invoke the
// messages API with arbitrary chat context" behavior that exposes the API's
// full capabilities.
async function sendClaudeReq(partialPayload) {
  console.log("sv->claude", partialPayload);
  // construct headers
  const opts = {
    method: "POST",
    hostname: anthropicHostname,
    path: "/v1/messages",
    headers: {
      "anthropic-version": "2023-06-01",
      "x-api-key": apiCreds.anthropicKey
    },
  };
  // handle payload
  if (!partialPayload?.prompt) {
    console.error("sendClaudeReq() must have a nonempty prompt in its partialPayload");
  }
  const prompt = partialPayload.prompt;
  delete partialPayload.prompt; // so we don't splice "prompt" into the API req
  const payload = {
    "model": "claude-3-sonnet-20240229",
    "messages": [{role: "user", content: prompt}],
    "max_tokens": 250,
    ...partialPayload
  };
  const payloadString = JSON.stringify(payload);
  // put payload-related headers on request
  opts.headers["Content-Type"] = "application/json";
  opts.headers["Content-Length"] = Buffer.byteLength(payloadString);
  
  // send the request and handle any response 
  // if logging to google sheets, wait for the request to complete and then log it;
  // otherwise make it a promise so we can await it
  // return fetchJSONResponse(opts, payloadString);
  const claudeResponse = await fetchJSONResponse(opts, payloadString);
  const claudeText = claudeReplyText(claudeResponse);

  try {
    if (('googleSheetID' in apiCreds) || ('googleSheetName' in apiCreds)) {
      const googleAuth = await authorizeGoogle();
      if (!('googleSheetID' in apiCreds) || (apiCreds.googleSheetID == null)) {
        const sheetID = await createSheet(googleAuth, apiCreds.googleSheetName)
        apiCreds.googleSheetID = sheetID
        console.log("Created Google sheet with ID: " + sheetID)
      }
      appendSheetItem(googleAuth, apiCreds.googleSheetID, prompt, 
        payload["model"], JSON.stringify({"max_tokens": payload["max_tokens"]}), 
        claudeText).catch(console.error);
    }
  } catch (error) {
    console.warn("textgen: unable to log to Google Sheets", error)
  }

  return claudeResponse;

}

// Given the complete `claudeJSON` returned by `sendClaudeReq`,
// extract just the actual response text as a string.
function claudeReplyText(claudeJSON) {
  return claudeJSON.content[0].text.trim();
}

// async function sendOpenAIReq(partialPayload) {
//   console.log("sv->openai", partialPayload);
//   // construct headers
//   const opts = {
//     method: "POST",
//     hostname: openaiHostname,
//     path: "/v1/chat/completions",
//     headers: {
//       "Content-Type": "application/json",
//       "Authorization": `Bearer ${apiCreds.openaiKey}`
//     },
//   };
//   // handle payload
//   if (partialPayload?.messages.length==0) {
//     console.error("sendOpenAIReq() must have a nonempty prompt in its partialPayload");
//   }
//   if (partialPayload?.messages[0]?.role==undefined || partialPayload?.messages[0]?.content.length==0) {
//     console.error("sendOpenAIReq() must have a nonempty prompt in its partialPayload");
//   }

//   const payload = {
//     "model": "gpt-4-vision-preview",
//     "messages": [], // shouldn't be empty
//     "max_tokens": 250,
//     ...partialPayload
//   };
//   const payloadString = JSON.stringify(payload);
//   console.log("payload", payload);
//   // send the request and handle any response 
//   // make it a promise so we can await it
//   return fetchJSONResponse(opts, payloadString);
// }

// // construct the context to query LLM
// function constructContext(selection, params, world) {
//   // group all the passed scraps to determine how they should be rendered in the megaprompt
//   const selectedScraps = unpackSelection(selection.filter(id => id !== params.scrapID), world);

//   console.log("alex", {selection, params, world, selectedScraps});
//   // group entity scraps first, by their conceptType
//   const groupedEntities = groupBy(
//     selectedScraps,
//     sc => sc.type === "entity" ? sc.conceptType : "nonEntity"
//   );
//   const nonEntityScraps = groupedEntities["nonEntity"];
//   // now group everything else by entityID, conceptType, or scrap type (in that order)
//   const speciallyHandledConceptTypes = ["event", "faction", "place", "prop"];
//   const groupedScraps = groupBy(nonEntityScraps, scrap => {
//     // group entity detail scraps by their entityID
//     if ((scrap.type === "textscrap" || scrap.type === "imagescrap")
//         && scrap.entityID) {
//       return scrap.entityID;
//     }
//     // group everything else by its scrap type
//     else {
//       return scrap.type;
//     }
//   });
//   // now construct first part of claude prompt; a list of everything we know so far
//   let claudePrompt = `I am trying to write a story.\n\n`;
//   if (groupedScraps["textscrap"] || groupedScraps["aiquery"]) {
//     const noteScraps = groupedScraps["textscrap"] || [];
//     const aiqueryScraps = groupedScraps["aiquery"] || [];
//     claudePrompt += "Here are my overall notes on the story so far:\n\n";
//     claudePrompt += noteScraps.map(sc => "- " + sc.text).join("\n\n");
//     claudePrompt += aiqueryScraps.filter(sc => sc.text && sc.text !== "").map(sc => {
//       return `- Q: ${sc.queryText} A: ${sc.text}`
//     }).join("\n\n");
//     claudePrompt += "\n\n";
//   }
//   if (groupedEntities["character"]) {
//     claudePrompt += "The story has the following characters:\n\n";
//     for (const entityScrap of groupedEntities["character"]) {
//       const charPrefix = `- ${entityScrap.text}. `;
//       const detailScraps = groupedScraps[entityScrap.id] || [];
//       const detailText = detailScraps.map(sc => sc.text || sc.imageDesc).join(" ");
//       // FIXME also consider entity-linked promptclouds here?
//       claudePrompt += charPrefix + detailText + "\n\n";
//     }
//   }
//   const otherEntitySectionHeaders = [
//     ["event", "At some point in the story, the following things will happen:"],
//     ["faction", "These factions are active in the story's world:"],
//     ["place", "The story's world contains the following places:"],
//     ["prop", "The story features the following key items:"]
//   ];
//   for (const [entityType, sectionHeader] of otherEntitySectionHeaders) {
//     if (groupedEntities[entityType]) {
//       claudePrompt += sectionHeader + "\n\n";
//       for (const entityScrap of groupedEntities[entityType]) {
//         const detailScraps = groupedScraps[entityScrap.id] || [];
//         const detailText = detailScraps.map(sc => sc.text || sc.imageDesc).join(" ");
//         // FIXME also consider entity-linked promptclouds here?
//         claudePrompt += `- ${detailText}\n\n`;
//       }
//     }
//   }
//   if (groupedScraps["imagescrap"]) {
//     // Assume we've already tried to get an imageDesc for every image by this point.
//     // imageDesc is null if there was an error retrieving it.
//     groupedScraps["imagescrap"] = groupedScraps["imagescrap"].filter(sc => sc.imageDesc)
//     if(groupedScraps["imagescrap"].length > 0){
//       claudePrompt += "The story has the following illustrations:\n\n";
//       claudePrompt += groupedScraps["imagescrap"].map(sc => {
//         return `- An image described as: ${sc.imageDesc}.`;
//       }).join("\n\n");
//       claudePrompt += "\n\n";
//     }
//   }
//   if (groupedScraps["promptcloud"]) {
//     groupedScraps["promptcloud"] = groupedScraps["promptcloud"].filter(sc => sc.promptCloud)
//     if(groupedScraps["promptcloud"].length > 0){
//       claudePrompt += "The story has this overall vibe:\n\n";
//       claudePrompt += groupedScrapas["promptcloud"].map(sc => "- " + sc.promptCloud).join("; ");
//       claudePrompt += "\n\n";
//     }
//   }
//   return claudePrompt
// }

// // Given a specific prompt and a selection of scraps, construct a megaprompt
// // with all the storyworld context from the selection, then send a Claude
// // request can call the callback when a response is given.
// // Params must include:
// // - `query`: the specific thing to ask Claude for
// // and may also include:
// // - `scrapID`: the specific scrap this query originated from
// // - `selection`: a list of scrap IDs this query should take into account
// //   (defaults to all selectable scraps if left unspecified)
// async function queryClaudeWithStoryContext(params, world) {
//   // Unpack selection, or use everything selectable as context if no selection given.
//   // Note that a selection can sometimes consist of only the scrap from which the query originates,
//   // in which case we should treat the selection as empty to ensure that global context is used.
//   const selection = params.selection || [];
//   const selectedScraps = unpackSelection(selection.filter(id => id !== params.scrapID), world);
//   console.log("selectedScraps", selectedScraps);
//   // send picread requests for all images
//   let imageObjs = selectedScraps.map(scrap => {
//     if (scrap.type === "imagescrap") return scrap;
//   }).filter(x => x);
//   await sendPicreadBatch(imageObjs, world);
//   // now construct first part of claude prompt; a list of everything we know so far
//   let claudePrompt = constructContext(selection, params, world)
//   // append command-specific part of claude prompt
//   claudePrompt += "Based on this information, ";
//   claudePrompt += params.query;
//   claudePrompt += " Answer immediately, with no preamble. Do not mention well-known characters from popular franchises.\n\nAssistant:";
//   console.log(`Sending Claude request:`, claudePrompt);
//   const claudeJSON =  await sendClaudeReq({"prompt": claudePrompt});
//   return claudeReplyText(claudeJSON);
// }
// // TODO Randomize squares and animate while loading?
// function placeholderText() {
//   return "███ ██ ██████ █ ███ ██ ███████ ██ ████ ████ ███ ██ █████ █"
// }

// /// *** handlers below ***
// // map of conceptType to Claude question to feed in with selection summary
// const imaginePrompts = {
//   character: "suggest a full name, age, and a two-sentence personality profile for a new key character from this story. Emphasize potential conflicts with other characters.",
//   event: "suggest something else that might happen within the story. Describe it in two sentences or less.",
//   faction: "suggest a new faction or group that might play a role in the story. Describe it in two sentences or less.",
//   place: "suggest a new place within the story's world where part of the story might happen. Describe the place in two sentences or less.",
//   prop: "suggest a new item, prop, or object that might be important to the story. Describe it in two sentences or less.",
// };

// function retrieveImaginePrompt(conceptType) {
//   return imaginePrompts[conceptType];
// }

// async function handleQueryLLM(json, client, world) {
//   beginActionContext(json.type, client, world);
//   const parent = getScrap(json.parents[0], world);
//   const text = parent.type === "aiquery" ? parent.queryText : parent.text;
//   // create a new text scrap for the response text
//   const scrap = makeScrap({
//     parents: json.parents,
//     type: "textscrap",
//     conceptType: "note",
//     text: placeholderText(),
//     loading: true,
//     startPos: json.startPos, // the initial position of the new scrap
//     pos: json.pos, // the final position of the new scrap
//   }, world);
//   // ask Claude for some info
//   const completion = await queryClaudeWithStoryContext({
//     query: `respond to the following request: ${text}. Respond in three sentences or less.`,
//     scrapID: json.parents[0],
//     //selection: json.selection
//   }, world);
//   // fill in the result of the LLM query to the new text scrap
//   scrap.text = completion;
//   scrap.loading = false;
//   refreshScrap(scrap.id, world);
//   endActionContext(world);
// }

// // Create an entity scrap and a single linked text scrap
// // for one of the "Imagine" buttons
// async function handleGenerateEntity(json, client, world) {
//   // create loading scraps
//   beginActionContext(json.type, client, world);
//   const entityScrap = makeScrap({
//     type: "entity",
//     text: "...",
//     conceptType: json.conceptType,
//     pos: json.pos,
//     loading: true,
//   }, world);
//   const noteScrap = makeScrap({
//     type: "textscrap",
//     entityID: entityScrap.id,
//     text: placeholderText(),
//     conceptType: "note",
//     pos: {x: json.pos.x + 25, y: json.pos.y + 75},
//     loading: true,
//   }, world);
//   endActionContext(world);
//   // make and send Claude query
//   json.query = retrieveImaginePrompt(json.conceptType);
//   json.selection = []; // use global context regardless of selection
//   const completion = await queryClaudeWithStoryContext(json, world);
//   let entityName = completion;
//   let entityDesc = completion;
//   if (json.conceptType === "character") {
//     // special case for characters: slice the name off the front of the content
//     // we should probably give other entities explicit names later
//     const nameSplitIdx = Math.min(completion.indexOf(","), completion.indexOf("."));
//     entityName = completion.slice(0, nameSplitIdx);
//     entityDesc = capitalizeFirst(completion.slice(nameSplitIdx + 1).trim());
//   }
//   entityScrap.text = entityName;
//   entityScrap.loading = false;
//   refreshScrap(entityScrap.id, world);
//   noteScrap.text = entityDesc;
//   noteScrap.loading = false;
//   refreshScrap(noteScrap.id, world);
// }

/// *** exporting functions used in other files ***
exports.sendClaudeReq = sendClaudeReq;
exports.claudeReplyText = claudeReplyText;
// exports.sendOpenAIReq = sendOpenAIReq;
// exports.constructContext = constructContext;
// exports.queryClaudeWithStoryContext = queryClaudeWithStoryContext;
// exports.retrieveImaginePrompt = retrieveImaginePrompt;
// exports.handleQueryLLM = handleQueryLLM;
// exports.handleGenerateEntity = handleGenerateEntity;
// exports.placeholderText = placeholderText;
