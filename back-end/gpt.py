
import tensorflow as tf
from transformers import TFGPT2LMHeadModel, GPT2TokenizerFast
import json
import traceback
from tqdm import tqdm

tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")

# add the EOS token as PAD token to avoid warnings
model = TFGPT2LMHeadModel.from_pretrained("gpt2", pad_token_id=tokenizer.eos_token_id)


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
            softmax = tf.nn.softmax(greedy_output_dict.scores[0])[0]
            original_prob = softmax[original_word_id].numpy()

            # calculate the character offset from the start of the phrase (not counting the extra context)
            offset = calculate_offset(offsets[:, i - context_len, :], extra_context, start_token_offset)

            # Determine the top k alternate words for each token
            alternates = []
            if top_k > 0:
                top_k_values, top_k_indices = tf.math.top_k(softmax, k=top_k)
                for index, prob in zip(top_k_indices, top_k_values):
                    token = tokenizer.decode(index)
                    alternates.append({
                        'token': token,
                        'prob': float(prob),
                        'span': [offset[0], offset[0] + len(token)],
                    })
                    
            result = {
                'token': tokenizer.decode(original_word_id),
                'span': offset,
                'prob': float(original_prob), # needs to be a float to serialize to JSON|
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


# Really boring-basic greedy forward search with multiple tokens
def forward_search(text, top_k=1, depth=1):
    encoding = tokenizer.encode_plus(
        text,
        return_offsets_mapping=True,  # This will return the token offsets
        return_tensors='tf'
    )
    
    input_ids = encoding['input_ids'] # Extract input_ids and offsets
    offsets   = encoding['offset_mapping']
    max_length = len(input_ids[0]) + depth

    greedy_output_dict = model.generate( # should be of type GenerateDecoderOnlyOutput but is actually TFGreedySearchDecoderOnlyOutput
        input_ids, max_length=max_length, output_scores=True, return_dict_in_generate=True, 
        do_sample=False,
        # num_return_sequences=top_k,
    )

    # the shape of the dictionary
    print('output', greedy_output_dict.scores, type(greedy_output_dict))
    offset = offsets[-1, -1, :].numpy().tolist()
    initial_offset = [offset[0], offset[1] - 1] # inclusive

    offset = initial_offset
    print("text", text, 'char', text[offset[1]])
    print("initial offset", offset)
    spans = []
    for i in range(depth - 1):
        softmax = tf.nn.softmax(greedy_output_dict.scores[i])[0]
        top_k_values, top_k_indices = tf.math.top_k(softmax, k=1)

        for index, prob in zip(top_k_indices, top_k_values):
            text = tokenizer.decode(index)
            offset = [offset[1] + 1, offset[1] + len(text)] # inclusive
            token = {
                'token': text,
                'prob': float(prob),
                'span': offset,
            }
            spans.append(token)

    i = depth - 1
    softmax = tf.nn.softmax(greedy_output_dict.scores[i])[0]
    top_k_values, top_k_indices = tf.math.top_k(softmax, k=top_k)

    final_offset = [offset[0], offset[1]]

    print("final offset", final_offset)

    for index, prob in zip(top_k_indices, top_k_values):
        text = tokenizer.decode(index)
        offset = [final_offset[1] + 1, final_offset[1] + len(text)]
        token = {
            'token': text,
            'prob': float(prob),
            'span': offset,
        }
        up_to = spans + [token]
        yield up_to

if __name__ == "__main__":
    # Example usage
    # for token in pluck_probs("This is a test.", return_k_alternates=3):
    #     print(token)
    #     print(json.dumps(token))

    for span in forward_search("The very best person is the", top_k=10, depth=3):
        print(span)
        print(json.dumps(span))