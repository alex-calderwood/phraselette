
import tensorflow as tf
from transformers import TFGPT2LMHeadModel, GPT2Tokenizer
from transformers import GPT2TokenizerFast
from tqdm import tqdm
from functools import cache
from flask import Flask, request, jsonify, Response
import json
from flask_cors import CORS
import traceback

import threading

tokenizer = GPT2TokenizerFast.from_pretrained("gpt2")

# add the EOS token as PAD token to avoid warnings
model = TFGPT2LMHeadModel.from_pretrained("gpt2", pad_token_id=tokenizer.eos_token_id)

app = Flask(__name__)
CORS(app)

# global variable to keep track of whether the server is working on something
working = False
lock = threading.Lock()

# something unlikely to be seen, must match the client (in smarts.js)
BREAK_TOKEN = "&&VE*A=]"

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
def pluck_probs(phrase, extra_context = tokenizer.eos_token):
    global working
    try:
        working = True
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
            original_word = all_ids[0][i]
            max_length = len(all_ids[0][:i]) + 1
            print('i', i, 'original_word', original_word, 'max_length', max_length, 'input', input_ids[:, :i])

            greedy_output_dict = model.generate(
                all_ids[:, :i], max_length=max_length, output_scores=True, return_dict_in_generate=True
            )
            softmax = tf.nn.softmax(greedy_output_dict.scores[0])[0]
            original_prob = softmax[original_word].numpy()

            # calculate the character offset from the start of the phrase (not counting the extra context)
            offset = offsets[:, i - context_len, :]
            offset = offset.numpy()
            offset = offset.tolist()[0]
            offset[0] = len(extra_context) + offset[0] - start_token_offset
            offset[1] = len(extra_context) + offset[1] - start_token_offset

            result = {
                'token': tokenizer.decode(original_word),
                'span': offset,
                'prob': float(original_prob) # needs to be a float to serialize to JSON|
            }
            print('result', result)
            yield result
        working = False

    except Exception as e:
        print('Error:', e)
        print('Phrase:', phrase)
        traceback.print_exc()
        working = False

# Generator for tokenizing and calcultating probabilities of each token in a phrase
def stream_probs(phrase, extra_context):
    for token in pluck_probs(phrase, extra_context):
        yield json.dumps(token) + BREAK_TOKEN

@app.route("/probs", methods=["POST"])
def probs():
    global working
    
    with lock:
        if working:
            return Response("Still working on previous response", content_type='application/json')
        else: 
            working = True

    data = request.get_json()
    text = data["text"]
    extra_context = data.get("context", tokenizer.eos_token)
    print('request', data)

    return Response(stream_probs(text, extra_context), content_type='application/json')


if __name__ == "__main__":
    app.run()