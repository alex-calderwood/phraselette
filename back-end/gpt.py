
# Add PyTorch import
import torch
import torch.nn.functional as F

from transformers import AutoModelForCausalLM, AutoTokenizer, LogitsProcessorList
from logits import SpaceAwareLogitsProcessor #, EndlessLogitsProcessor
import traceback
from tqdm import tqdm
from pprint import pprint
import os

from constraints.constraint import ClassifiableConstraint, POSChecker 
from transformers.generation.beam_constraints import PhrasalConstraint, DisjunctiveConstraint
import numpy as np

gpu = True
# ZERO_PROB = -3.4028235931503486e+35 # threshold at which we consider something infinitely unlikely
# ZERO_LOG_PROB = np.log(1e-12)
NEG_INF = -1e300


# def estimate_histogram(beam_output):
#     scores = beam_output.scores

#     # Flatten all log probabilities
#     all_log_probs = []
#     for score in scores:
#         log_probs = tf.nn.log_softmax(score).numpy()
#         all_log_probs.extend(log_probs.flatten())

#     all_log_probs = np.array(all_log_probs)

#     # Remove values below some threshold
#     all_log_probs = all_log_probs[all_log_probs > ZERO_LOG_PROB]

#     # Remove extreme outliers
#     low = np.percentile(all_log_probs, 0.05)
#     all_log_probs = all_log_probs[all_log_probs >= low]

#     # Create linear bin edges in log space
#     num_bins = 100
#     min_log_prob = np.min(all_log_probs)
#     max_log_prob = 0  # The maximum log probability is 0
#     bin_edges = np.linspace(min_log_prob, max_log_prob, num_bins + 1)
#     counts, _ = np.histogram(all_log_probs, bins=bin_edges)

#     summary = {
#         'counts': counts.tolist(),
#         'bin_edges': bin_edges.tolist(),
#     }
#     print("summary", summary)
#     return summary



# Set the environment variable to use GPU 5
# os.environ["CUDA_VISIBLE_DEVICES"] = "1"

# Verify that TensorFlow is using the GPU
# if gpu: 
    # print("Num GPUs Available: ", len(tf.config.experimental.list_physical_devices('GPU')))
    # print("Is GPU available: ", tf.test.is_gpu_available())
    # print("GPU Device Name: ", tf.test.gpu_device_name())

# tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")
# # add the EOS token as PAD token to avoid warnings
# model = TFGPT2LMHeadModel.from_pretrained("gpt2", pad_token_id=tokenizer.eos_token_id)

model = AutoModelForCausalLM.from_pretrained("gpt2")
tokenizer = AutoTokenizer.from_pretrained("gpt2")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# print('gpt: loaded', model)

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

# TODO uncomment?
# with tf.device('/GPU:1'):
#     # Create the LogitsProcessors
#     space_aware_processor = SpaceAwareLogitsProcessor(tokenizer);
#     endless_processor = EndlessLogitsProcessor(tokenizer)
#     logits_processor = TFLogitsProcessorList([
#         space_aware_processor, 
#         endless_processor,
#     ])

space_aware_processor = SpaceAwareLogitsProcessor(tokenizer);
logits_processor = LogitsProcessorList([
    space_aware_processor, 
])

# force_words = [" mountains", " rivers", " wandering", " stuff", " being"]
# constraints = []
# for constraint_entitiy in force_words:
#     tokens = tokenizer(constraint_entitiy).input_ids
#     print('constraint tokens', tokens)
#     constraints.append(PhrasalConstraint(tokens))



# pos_checker = POSChecker(['NOUN'], tokenizer)

# # Create a ClassifiableConstraint with 'contains' mode
# constraint = ClassifiableConstraint(pos_checker, 'contains', tokenizer)
# constraints = [constraint]
# # constraints = []
    
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

        attention_mask = encoding["attention_mask"]
        print("Attention mask", attention_mask, encoding["pad_token_id"])

        # merge extra context with the input
        # all_ids = tf.concat([context_input_ids, input_ids], axis=1)
        all_ids = torch.cat([context_input_ids, input_ids], dim=1)

        context_len = len(context_input_ids[0])
        input_len = len(input_ids[0])
        total_len = len(all_ids[0])

        for i in tqdm(range(context_len, total_len)):
            original_word_id = all_ids[0][i]
            max_length = len(all_ids[0][:i]) + 1
            # print('i', i, 'original_word', original_word, 'max_length', max_length, 'input', input_ids[:, :i])

            greedy_output_dict = model.generate(
                all_ids[:, :i], max_length=max_length, output_scores=True, return_dict_in_generate=True, attention_mask=attention_mask
            )
            # token_probs = tf.nn.softmax(greedy_output_dict.scores[0])[0]
            token_probs = F.softmax(greedy_output_dict.scores[0], dim=-1)[0]

            token_logits = greedy_output_dict.scores[0][0]
            # original_prob = token_probs[original_word_id].numpy()
            # original_log_prob = token_logits[original_word_id].numpy()
            original_prob = token_probs[original_word_id].cpu().numpy()
            original_log_prob = token_logits[original_word_id].cpu().numpy()
            
            # calculate the character offset from the start of the phrase (not counting the extra context)
            offset = calculate_offset(offsets[:, i - context_len, :], extra_context, start_token_offset)

            # Determine the top k alternate words for each token
            alternates = []
            if top_k > 0:
                # top_k_values, top_k_indices = tf.math.top_k(token_probs, k=top_k)
                top_k_values, top_k_indices = torch.topk(token_probs, k=top_k)

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

# to exist while we dev on the constraints version
def forward_search_without_constraints(text, top_k=2, depth=5, num_beam_groups=2, eos=tokenizer.eos_token, logits_processor=logits_processor):
    text = text.replace('\xa0', ' ') # get rid of non-breaking space characters which seem to mess things up
    ends_with_space = text.endswith(' ')
    if ends_with_space:
        text = text[:-1]

    num_beams = top_k
    num_beams = (num_beams // num_beam_groups) * num_beam_groups # Ensure num_beams is divisible by num_beam_groups
    num_beam_groups = min(num_beam_groups, num_beams)

    print(f'gpt: without constraints text: |{text}|', 'k', top_k, 'depth', depth,
          'beams', num_beams, 'beam groups', num_beam_groups, 'logits', logits_processor,'ends space', ends_with_space)

    encoding = tokenizer.encode_plus(
        text,
        return_offsets_mapping=True,
        return_tensors='pt'
    )

    print(encoding)

    attention_mask = encoding["attention_mask"]
    print("Attention mask", attention_mask)

    # input_ids = encoding['input_ids']
    # offsets = encoding['offset_mapping']
    input_ids = encoding['input_ids'].to(device)
    offsets = encoding['offset_mapping'].to(device)
    input_len = len(input_ids[0])
    max_length = input_len + depth

    print('ends with space', ends_with_space, 'input_len', input_len, 'max_length', max_length)
    space_aware_processor.set_ends_with_space(ends_with_space)
    space_aware_processor.set_input_len(input_len)

    print(f"""gpt: generating with num_beams {num_beams} num_return_sequences {num_beams}
          num_beam_groups {num_beam_groups} max len {max_length} new tokens {depth}""")

    # diversity_penalty=0.4,
    # # num_beam_groups=num_beam_groups,
    # no_repeat_ngram_size=3,
    # # logits_processor=logits_processor,
    # constraints=constraints
    # beam_output = model.generate(
    #     input_ids,
    #     max_length=max_length,
    #     num_beams=num_beams,
    #     num_return_sequences=num_beams,
    #     output_scores=True,
    #     return_dict_in_generate=True,
    #     output_attentions=False,
    #     output_hidden_states=False,
    #     attention_mask=attention_mask,
    #     temperature=0.9,
    #     diversity_penalty=1000000.0,            # can't use with constraints
    #     num_beam_groups=num_beam_groups,  # can't use with constraints
    #     # no_repeat_ngram_size=2,
    #     logits_processor=logits_processor,
    # )

    beam_output = model.generate(
        input_ids,
        max_length=max_length,
        num_beams=num_beams,
        num_return_sequences=num_beams,
        output_scores=True,
        return_dict_in_generate=True,
        output_attentions=False,
        output_hidden_states=False,
        attention_mask=attention_mask,
        diversity_penalty=0.99,            # can't use with constraints
        num_beam_groups=num_beam_groups,  # can't use with constraints
        no_repeat_ngram_size=2,
        logits_processor=logits_processor,
    )

    # Add these lines to check the overall shape of beam_token_scores
    print("Shape of beam_token_scores:", [s.shape for s in beam_output.scores])

    for beam_idx in range(num_beams):
        sequence = []
        # current_end = offsets[-1, -1, 1].numpy().item() + (1 if ends_with_space else 0)
        current_end = offsets[-1, -1, 1].cpu().numpy().item() + (1 if ends_with_space else 0)

        beam_tokens = beam_output.sequences[beam_idx, len(input_ids[0]):]
        beam_token_scores = beam_output.scores
        for token_idx, token_id in enumerate(beam_tokens):
            # token_text = tokenizer.decode(token_id, skip_special_tokens=True) # eventually it would be nice to use this but we would have to deal with "" tokens
            token_text = tokenizer.decode(token_id)

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
            token_probs = F.softmax(token_logits, dim=-1)
            token_prob = float(token_probs[token_id].item())
            log_prob = float(token_logits[token_id].item())

            token = {
                'token': token_text,
                'prob': token_prob,
                'log_prob': log_prob,
                'span': offset,
            }
            sequence.append(token)

        yield fix_infinity(sequence)

def forward_search(text, top_k=50, depth=1, num_beam_groups=3, eos=tokenizer.eos_token, logits_processor=logits_processor, constraints=[]):
    text = text.replace('\xa0', ' ') # get rid of non-breaking space characters which seem to mess things up
    ends_with_space = text.endswith(' ')
    if ends_with_space:
        text = text[:-1]

    num_beams = top_k
    num_beams = (num_beams // num_beam_groups) * num_beam_groups # Ensure num_beams is divisible by num_beam_groups
    num_beam_groups = min(num_beam_groups, num_beams)

    print(f'gpt: forward request text: |{text}|', 'k', top_k, 'depth', depth,'beams', num_beams, 'beam groups', num_beam_groups, 'logits', logits_processor, 'consraints', constraints) # 'ends space' ends_with_space)

    encoding = tokenizer.encode_plus(
        text,
        return_offsets_mapping=True,
        return_tensors='pt'
    )

    print(encoding)

    attention_mask = encoding["attention_mask"]
    print("Attention mask", attention_mask)

    # input_ids = encoding['input_ids']
    # offsets = encoding['offset_mapping']
    input_ids = encoding['input_ids'].to(device)
    offsets = encoding['offset_mapping'].to(device)
    input_len = len(input_ids[0])
    max_length = input_len + depth

    print('ends with space', ends_with_space, 'input_len', input_len, 'max_length', max_length)
    space_aware_processor.set_ends_with_space(ends_with_space)
    space_aware_processor.set_input_len(input_len)

    print(f'gpt: generating with num_beams {num_beams} num_return_sequences {num_beams} num_beam_groups {num_beam_groups} max len {max_length}')
    beam_output = model.generate(
        input_ids,
        max_length=max_length,
        num_beams=num_beams,
        num_return_sequences=num_beams,
        output_scores=True,
        return_dict_in_generate=True,
        output_attentions=False,
        output_hidden_states=False,
        attention_mask=attention_mask,
        temperature=0.99,
        # diversity_penalty=0.2, # can't use with constraints
        # num_beam_groups=num_beam_groups,  # can't use with constraints
        # no_repeat_ngram_size=3,
        logits_processor=logits_processor,
        constraints=constraints
    )

    # Add these lines to check the overall shape of beam_token_scores
    print("Shape of beam_token_scores:", [s.shape for s in beam_output.scores])

    for beam_idx in range(num_beams):
        sequence = []
        # current_end = offsets[-1, -1, 1].numpy().item() + (1 if ends_with_space else 0)
        current_end = offsets[-1, -1, 1].cpu().numpy().item() # + (1 if ends_with_space else 0)

        beam_tokens = beam_output.sequences[beam_idx, len(input_ids[0]):]
        beam_token_scores = beam_output.scores
        for token_idx, token_id in enumerate(beam_tokens):
            # token_text = tokenizer.decode(token_id, skip_special_tokens=True) # eventually it would be nice to use this but we would have to deal with "" tokens
            token_text = tokenizer.decode(token_id)

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
            token_probs = F.softmax(token_logits, dim=-1)
            token_prob = float(token_probs[token_id].item())
            log_prob = float(token_logits[token_id].item())

            token = {
                'token': token_text,
                'prob': token_prob,
                'log_prob': log_prob,
                'span': offset,
            }
            sequence.append(token)

        # print('---span', sequence)
        yield sequence


def print_output(input, output):
    for span in output:
        # pprint(span)
        print(input + ''.join([s['token'] for s in span]))
        # print('------')
        # pprint(json.dumps(span))


if __name__ == "__main__":
    # Example usage
    # for token in pluck_probs("This is a test.", top_k=3):
    #     print(token)
    #     print(json.dumps(token))

    pos_checker = POSChecker(['ADJ', 'NOUN'], tokenizer)

    # Create a ClassifiableConstraint with 'contains' mode
    constraint = ClassifiableConstraint(pos_checker, 'contains', tokenizer)
    constraints = [constraint]
    # constraints = []

    # force_words = [[" rice", " beans", " cheese", "play", "find", "ize", "ful"]]
    # constraints = []
    # for constraint_entitiy in force_words:
    #     tokens = tokenizer(constraint_entitiy).input_ids
    #     print('constraint tokens', tokens)
    #     constraints.append(DisjunctiveConstraint(tokens))

    input = "My wonder"
    output = forward_search(
        input, depth=10, top_k=10,
        # logits_processor=logits_processor,
        constraints=constraints
    )
    print_output(input, output)
