
import tensorflow as tf
from transformers import TFGPT2LMHeadModel, GPT2TokenizerFast, TFLogitsProcessor, TFLogitsProcessorList
import json
import traceback
from tqdm import tqdm
from pprint import pprint

tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")

# add the EOS token as PAD token to avoid warnings
model = TFGPT2LMHeadModel.from_pretrained("gpt2", pad_token_id=tokenizer.eos_token_id)

# If the word at the end of the input ends with a space, it will throw off GPT so instead
# we remove the space from the input and constrain the model to generate only words that start with a space
class SpaceAwareLogitsProcessor(TFLogitsProcessor):
    space_tokens = tf.constant([tokenizer.decode([i]).startswith(' ') for i in range(tokenizer.vocab_size)], dtype=tf.bool)

    def __init__(self):
        self.ends_with_space = False
        self.input_len = 0
        
    def __call__(self, input_ids, scores, cur_len):
        print('shape', input_ids.shape)
        # Only apply to the first token (doesn't work because we care about when it is the first generated token)
        if self.ends_with_space and cur_len == self.input_len:
            # only generate words that start with ' '
            print('using space mask', cur_len, self.input_len) 
            non_space_mask = tf.logical_not(SpaceAwareLogitsProcessor.space_tokens)
            scores = tf.where(non_space_mask, tf.float32.min, scores)
        else:
            print('not using space mask', cur_len, self.input_len)
        return scores
    
    def set_ends_with_space(self, ends_with_space):
        self.ends_with_space = ends_with_space

    def set_input_len(self, input_len):
        self.input_len = input_len

# We never want to generate the end of sequence token or a few other tokens
class EndlessLogitsProcessor(TFLogitsProcessor):
    stoplist = [tokenizer.eos_token_id, tokenizer.pad_token_id, tokenizer.cls_token_id, tokenizer.sep_token_id]
    def __call__(self, input_ids, scores, cur_len):
        # zero out the stoplist tokens
        for token in EndlessLogitsProcessor.stoplist:
            scores = tf.where(input_ids == token, tf.float32.min, scores)
        return scores

# Create the LogitsProcessors
space_aware_processor = SpaceAwareLogitsProcessor();
# endless_processor = EndlessLogitsProcessor()
logits_processor = TFLogitsProcessorList([space_aware_processor])

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
            # print('i', i, 'original_word', original_word, 'max_length', max_length, 'input', input_ids[:, :i])

            greedy_output_dict = model.generate(
                all_ids[:, :i], max_length=max_length, output_scores=True, return_dict_in_generate=True
            )
            token_probs = tf.nn.softmax(greedy_output_dict.scores[0])[0]
            token_logits = greedy_output_dict.scores[0][0]
            print('probs', token_probs)
            print('logits', token_logits)
            original_prob = token_probs[original_word_id].numpy()
            original_log_prob = token_logits[original_word_id].numpy()


            # calculate the character offset from the start of the phrase (not counting the extra context)
            offset = calculate_offset(offsets[:, i - context_len, :], extra_context, start_token_offset)

            # Determine the top k alternate words for each token
            alternates = []
            if top_k > 0:
                top_k_values, top_k_indices = tf.math.top_k(token_probs, k=top_k)
                for index, prob in zip(top_k_indices, top_k_values):
                    token = tokenizer.decode(index)
                    log_prob = token_logits[index]
                    alternates.append({
                        'token': token,
                        'prob': float(prob),
                        'log_prob': float(log_prob),
                        'span': [offset[0], offset[0] + len(token)],
                    })
                    
            result = {
                'token': tokenizer.decode(original_word_id),
                'span': offset,
                'prob': float(original_prob), # needs to be a float to serialize to JSON|
                'log_prob': float(original_log_prob),
                'alternates': alternates,     # top k alternates
            }

            yield result

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




def forward_search(text, top_k=50, depth=1, num_beam_groups=3, eos=tokenizer.eos_token):
    text = text.replace('\xa0', ' ') # get rid of non-breaking space characters which seem to mess things up
    ends_with_space = text.endswith(' ')
    if ends_with_space:
        text = text[:-1]

    num_beams = top_k
    num_beams = (num_beams // num_beam_groups) * num_beam_groups # Ensure num_beams is divisible by num_beam_groups
    num_beam_groups = min(num_beam_groups, num_beams)

    print(f'forward |{text}|', 'k', top_k, 'depth', depth,'beams', num_beams, 'beam groups', num_beam_groups, 'ends space', ends_with_space)

    encoding = tokenizer.encode_plus(
        text,
        return_offsets_mapping=True,
        return_tensors='tf'
    )

    print(encoding)

    input_ids = encoding['input_ids']
    offsets = encoding['offset_mapping']
    input_len = len(input_ids[0])
    max_length = input_len + depth

    print('ends with space', ends_with_space, 'input_len', input_len, 'max_length', max_length)
    space_aware_processor.set_ends_with_space(ends_with_space)
    space_aware_processor.set_input_len(input_len)

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

    # Add these lines to check the overall shape of beam_token_scores
    print("Shape of beam_token_scores:", [s.shape for s in beam_output.scores])

    for beam_idx in range(num_beams):
        sequence = []
        current_end = offsets[-1, -1, 1].numpy().item() + (1 if ends_with_space else 0)
    
        beam_tokens = beam_output.sequences[beam_idx, len(input_ids[0]):]
        beam_token_scores = beam_output.scores
        for token_idx, token_id in enumerate(beam_tokens):
            # token_text = tokenizer.decode(token_id, skip_special_tokens=True) # eventually it would be nice to use this but we would have to deal with "" tokens
            token_text= tokenizer.decode(token_id)

            # If it is the first token we generate, remove the prefix space
            if token_idx == 0:
                if token_text.startswith(' '):
                    token_text = token_text[1:]
                else:   
                    print('WARNING, token does not start with space:', token_text)
                    
            # Calculate offset
            token_length = len(token_text)
            offset_end = current_end + token_length - 1
            
            offset = [current_end, offset_end]
            current_end = offset_end + 1

            # Calculate token probability
            token_logits = beam_token_scores[token_idx][beam_idx]
            token_probs = tf.nn.softmax(token_logits)
            token_prob = float(token_probs[token_id])
            log_prob = float(token_logits[token_id])

            token = {
                'token': token_text,
                'prob': token_prob,
                'log_prob': log_prob,
                'span': offset,
            }
            sequence.append(token)

        print('---span', sequence)
        yield sequence


def print_output(output):
    for span in output:
        # pprint(span)
        print(''.join([s['token'] for s in span]))
        print('------')
        # pprint(json.dumps(span))


if __name__ == "__main__":
    # Example usage
    # for token in pluck_probs("This is a test.", top_k=3):
    #     print(token)
    #     print(json.dumps(token))

    output = forward_search("When I was walking down the street today I was surprised to see", top_k=40, depth=3)
    print_output(output)