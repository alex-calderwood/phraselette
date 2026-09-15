// Chat generation for the advice wells, shared by the worker and scripts/lm-test.mjs
// so the exact same code path can be exercised from Node.
import { TextStreamer, InterruptableStoppingCriteria } from '@huggingface/transformers';

/**
 * @param {{tokenizer:any, model:any}} inst
 * @param {object} o
 * @param {Array<{role:string,content:string}>} o.messages
 * @param {string|null} [o.assistantPrefix]  fixed start of the reply (e.g. "<entry>"); included in the returned text
 * @param {(text:string)=>void} [o.onText]   called with the accumulated text as it streams
 * @param {(prompt:string)=>void} [o.onPrompt] called once with the exact text the model is given (chat template applied, prefix appended)
 * @returns {Promise<{text:string, stopper:InterruptableStoppingCriteria}>}
 */
export async function chatGenerate(inst, {
  messages, maxNewTokens = 300, temperature = 1.0, doSample = true, topP = 1.0,
  repetitionPenalty = 1.0, noRepeatNgramSize = 0, assistantPrefix = null, onText, onPrompt, onStopper,
}) {
  const { tokenizer, model } = inst;
  // Render the conversation with the model's own chat template and start the
  // reply with the fixed prefix, if any; the template already added the
  // special tokens, so the tokenizer must not add more.
  const promptText = tokenizer.apply_chat_template(messages, { add_generation_prompt: true, tokenize: false }) + (assistantPrefix ?? '');
  onPrompt?.(promptText);
  const inputs = tokenizer(promptText, { add_special_tokens: false });
  const stopper = new InterruptableStoppingCriteria();
  onStopper?.(stopper);
  let text = assistantPrefix ?? '';
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (piece) => { text += piece; onText?.(text); },
  });
  await model.generate({
    ...inputs,
    max_new_tokens: maxNewTokens,
    do_sample: doSample,
    temperature,
    top_p: topP,
    repetition_penalty: repetitionPenalty,
    no_repeat_ngram_size: noRepeatNgramSize,
    streamer,
    stopping_criteria: stopper,
  });
  return { text: text.replace(/<think>[\s\S]*?<\/think>/g, '').trim() };
}
