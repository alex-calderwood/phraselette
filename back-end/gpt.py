import tensorflow as tf
from transformers import TFGPT2LMHeadModel, GPT2TokenizerFast, TFLogitsProcessorList
from logits import SpaceAwareLogitsProcessor, EndlessLogitsProcessor
import traceback
from tqdm import tqdm
from pprint import pprint
import os
import numpy as np

gpu = True
# ZERO_PROB = -3.4028235931503486e+35 # threshold at which we consider something infinitely unlikely
ZERO_LOG_PROB = np.log(1e-12)
NEG_INF = -1e300


# Set the environment variable to use GPU 5
# os.environ["CUDA_VISIBLE_DEVICES"] = "1"

# Verify that TensorFlow is using the GPU
if gpu: 
    print("gpt: Num GPUs Available: ", len(tf.config.experimental.list_physical_devices('GPU')))
    print("gpt: Is GPU available: ", tf.test.is_gpu_available())
    print("gpt: GPU Device Name: ", tf.test.gpu_device_name())

tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")

# add the EOS token as PAD token to avoid warnings
model = TFGPT2LMHeadModel.from_pretrained("gpt2", pad_token_id=tokenizer.eos_token_id)

print('gpt: loaded', model)

# JSON can't handle -Infinity
# Turn any -inf in the result into a very small number
def fix_infinity(d): 
    if isinstance(d, list):
        for i in range(len(d)):
            if isinstance(d[i], dict):
                fix_infinity(d[i])
    elif isinstance(d, dict):
        for key in d:
            # check for -Infinity
            if d[key] == float('-inf'):
                d[key] = NEG_INF
            if isinstance(d[key], dict):
                fix_infinity(d[key])

    return d

with tf.device('/GPU:1'):
    # Create the LogitsProcessors
    space_aware_processor = SpaceAwareLogitsProcessor(tokenizer);
    endless_processor = EndlessLogitsProcessor(tokenizer)
    logits_processor = TFLogitsProcessorList([
        space_aware_processor, 
        endless_processor, 
    ])

    # A function that generates the probabilities of each token in the phrase
    # it also tokenizes strings using the GPT-2 tokenizer
    # So "this is a sentence -> ["this", "is", "a", "sent", "ence"] and their probabilities
    # It returns each token via a generator
    # a token is a dictionary with the following keys
    # {
    #    token: str,  # the token string
    #    span: [int, int],  # the start and end character offset of the token in the phrase
    #    prob: float  # the probability of the token
    # }
    def pluck_probs(phrase, extra_context = tokenizer.eos_token, top_k=0, depth=1): # TODO need to imnplement depth!
        try:
            start_token_offset = 0
            # start_token_offset = 13
            # Add the EOS token as the prefix to the phrase
            if not extra_context.startswith(tokenizer.eos_token):
                extra_context = tokenizer.eos_token + extra_context
                start_token_offset = 13

            context_encoding = tokenizer.encode_plus(
                extra_context,
                return_offsets_mapping=True,  # This will return the token offsets
                return_tensors='tf'
            )

            context_input_ids = context_encoding['input_ids']
            context_offsets = context_encoding['offset_mapping']

            encoding = tokenizer.encode_plus(
                phrase,
                return_offsets_mapping=True,  # This will return the token offsets
                return_tensors='tf',
            )

            # Extract input_ids and offsets
            input_ids = encoding['input_ids']
            offsets = encoding['offset_mapping']

            # merge extra context with the input
            all_ids = tf.concat([context_input_ids, input_ids], axis=1)

            context_len = len(context_input_ids[0])
            input_len = len(input_ids[0])
            total_len = len(all_ids[0])

            for i in tqdm(range(context_len, total_len)):
                original_word_id = all_ids[0][i]
                max_length = len(all_ids[0][:i]) + 1

                greedy_output_dict = model.generate(
                    all_ids[:, :i], max_length=max_length, output_scores=True, return_dict_in_generate=True
                )
                log_probs = tf.nn.log_softmax(greedy_output_dict.scores[0])[0]
                original_log_prob = log_probs[original_word_id].numpy()
                original_prob = np.exp(original_log_prob)

                # calculate the character offset from the start of the phrase (not counting the extra context)
                offset = calculate_offset(offsets[:, i - context_len, :], extra_context, start_token_offset)

                # Determine the top k alternate words for each token
                alternates = []
                if top_k > 0:
                    top_k_log_values, top_k_indices = tf.math.top_k(log_probs, k=top_k)
                    for index, log_prob in zip(top_k_indices, top_k_log_values):
                        token = tokenizer.decode(index)
                        # log_prob = token_logits[index]
                        alternates.append({
                            'token': token,
                            'prob': float(np.exp(log_prob)),
                            'log_prob': float(log_prob),
                            'span': [offset[0], offset[0] + len(token)],
                        })
                        
                result = {
                    'token': tokenizer.decode(original_word_id),
                    'span': offset,
                    'prob':     float(original_prob), # needs to be a float to serialize to JSON
                    'log_prob': float(original_log_prob),
                    'alternates': alternates,     # top k alternates
                }

                yield fix_infinity(result)

        except Exception as e:
            print('Error:', e)
            print('Phrase:', phrase)
            traceback.print_exc()

    def calculate_offset(offset, extra_context, start_token_offset):
        offset = offset.numpy()
        offset = offset.tolist()[0]
        offset[0] = len(extra_context) + offset[0] - start_token_offset
        offset[1] = len(extra_context) + offset[1] - start_token_offset
        return offset
    
    def estimate_histogram(beam_output):
        scores = beam_output.scores
        
        # Flatten all log probabilities
        all_log_probs = []
        for score in scores:
            log_probs = tf.nn.log_softmax(score).numpy()
            all_log_probs.extend(log_probs.flatten())
        
        all_log_probs = np.array(all_log_probs)
        
        # Remove values below some threshold
        all_log_probs = all_log_probs[all_log_probs > ZERO_LOG_PROB]
        
        # Remove extreme outliers
        low = np.percentile(all_log_probs, 0.05)
        all_log_probs = all_log_probs[all_log_probs >= low]
        
        # Create linear bin edges in log space
        num_bins = 100
        min_log_prob = np.min(all_log_probs)
        max_log_prob = 0  # The maximum log probability is 0
        bin_edges = np.linspace(min_log_prob, max_log_prob, num_bins + 1)
        counts, _ = np.histogram(all_log_probs, bins=bin_edges)
        
        summary = {
            'counts': counts.tolist(),
            'bin_edges': bin_edges.tolist(),
        }
        print("summary", summary)
        return summary
    
    def remove_prefix_space(token_text):
        if token_text.startswith(' '):
            token_text = token_text[1:]
        else:
            print('WARNING, token does not start with space despite our forced logits manipulation', token_text)
        return token_text

    def forward_search(text, top_k=50, depth=1, num_beam_groups=3, eos=tokenizer.eos_token, logits_processor=logits_processor):
        text = text.replace('\xa0', ' ') # get rid of non-breaking space characters which seem to mess things up
        input_ends_with_space = text.endswith(' ')
        if input_ends_with_space:
            text = text[:-1]

        num_beams = top_k
        num_beams = (num_beams // num_beam_groups) * num_beam_groups # Ensure num_beams is divisible by num_beam_groups
        num_beam_groups = min(num_beam_groups, num_beams)

        print(f'search: forward |{text}|', 'k', top_k, 'depth', depth,'beams', num_beams, 'beam groups', num_beam_groups, 'ends space', input_ends_with_space)

        encoding = tokenizer.encode_plus(
            text,
            return_offsets_mapping=True,
            return_tensors='tf'
        )

        input_ids = encoding['input_ids']
        offsets = encoding['offset_mapping']
        input_len = len(input_ids[0])
        max_length = input_len + depth

        # we are using a special processor that, if the input text ends with a space,
        # will only allow words that START with a space, which is where GPT-2 expects the space to be (rather than at the end)
        # we then remove this extra space from the result
        print('search: input_ids', input_ids.shape, 'ends with space', input_ends_with_space, 'input_len', input_len, 'max_length', max_length)
        space_aware_processor.set_ends_with_space(input_ends_with_space)
        space_aware_processor.set_input_len(input_len)

        print('searching')
        beam_output = model.generate(
            input_ids,
            max_length=max_length,
            num_beams=num_beams,
            num_return_sequences=num_beams,
            output_scores=True,
            return_dict_in_generate=True,
            output_attentions=True,
            output_hidden_states=True,
            diversity_penalty=0.4,
            num_beam_groups=num_beam_groups,
            no_repeat_ngram_size=2,
            logits_processor=logits_processor
        )

        for beam_idx in range(num_beams):
            sequence = []
            current_end = offsets[-1, -1, 1].numpy().item() + (1 if input_ends_with_space else 0)
        
            beam_tokens = beam_output.sequences[beam_idx, len(input_ids[0]):]
            beam_token_scores = beam_output.scores
            for token_idx, token_id in enumerate(beam_tokens):
                token_text= tokenizer.decode(token_id)

                # If it is the first token we generate, remove the prefix space
                if input_ends_with_space and token_idx == 0:
                    token_text = remove_prefix_space(token_text)
                        
                # Calculate offset
                token_length = len(token_text)
                offset_end = current_end + token_length - 1
                
                offset = [current_end, offset_end]
                current_end = offset_end + 1

                # Calculate token probability
                token_logits = beam_token_scores[token_idx][beam_idx]

                log_probs =  tf.nn.log_softmax(token_logits) # float(token_logits[token_id] - tf.reduce_logsumexp(token_logits)) # same as log_softmax but more efficient
                log_prob = log_probs[token_id] # could be interesting to return a branching structure using the full log_probs
                token_prob = float(tf.exp(log_prob))

                token = {
                    'thing': 'token',
                    'token': token_text,
                    'prob': float(token_prob),
                    'log_prob': float(log_prob),
                    'span': offset,
                }
                sequence.append(token)

            sequence = fix_infinity(sequence)
            print('gpt: ---seq', sequence)
            yield sequence

        # compute a rough histogram of the results
        summary = estimate_histogram(beam_output)
        
        yield {
            'thing': 'summary',
            'summary': fix_infinity(summary)
        }

    def print_output(input, output):
        for seq in output:
            if isinstance(seq, list):
                print(type(seq))
                print(input + ''.join([s['token'] for s in seq]))
                print('------')
            else:
                print(seq)
            # pprint(json.dumps(span))
        


if __name__ == "__main__":
    # Example usage
    # for token in pluck_probs("This is a test.", top_k=3):
    #     print(token)
    #     print(json.dumps(token))

    input = "I like mountains "
    output = forward_search(input, top_k=10, depth=18, logits_processor=logits_processor)
    print_output(input, output)