from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import threading
import json, time
from tqdm import tqdm

from gpt import pluck_probs, tokenizer
from space import stream_parse
from network import BREAK_TOKEN

# global variable to keep track of whether the server is working on something
working = False
lock = threading.Lock()

app = Flask(__name__)
CORS(app)

@app.route("/probs", methods=["POST"])
def probs():
    # Generator for tokenizing and calculating the probabilities of each token in a phrase
    def stream_probs(text, extra_context, mock=False, return_k_alternates=0):
        try:
            if mock: 
                for token in tqdm(range(4)):
                    time.sleep(1)
                    yield json.dumps({
                        'text': 'token',
                        'span': [0, 4],
                        'prob': 0.5
                    }) + BREAK_TOKEN
            else: 
                for token in pluck_probs(text, extra_context, return_k_alternates=return_k_alternates):
                    yield json.dumps(token) + BREAK_TOKEN
        finally:
            with lock:
                global working
                working = False

    global working
    
    with lock:
        if working:
            print("Ignoring request, still working on previous response")
            return Response("Still working on previous response", content_type='application/json', status=409)

        working = True

    data = request.get_json()
    text = data["text"]
    extra_context = data.get("context", tokenizer.eos_token)
    return_k_alternates = data.get("return_k_alternates", 0)

    print('request', data, 'working', working)

    return Response(stream_probs(
            text, extra_context, return_k_alternates=return_k_alternates
            ), content_type='application/json')

@app.route("/spacy", methods=["POST"])
def spacy():
    def stream_spacy_with_lock(text, extra_context):
        try:
            return stream_parse(text, extra_context)
        finally:
            with lock:
                global working
                working = False

    global working

    with lock:
        if working:
            print("Ignoring request, still working on previous response")
            return Response("Still working on previous response", content_type='application/json', status=409)

        working = True

    data = request.get_json()
    text = data["text"]
    extra_context = data.get("context", "")
    print('request', data, 'working', working)

    return Response(stream_spacy_with_lock(text, extra_context), content_type='application/json')


if __name__ == "__main__":
    app.run()