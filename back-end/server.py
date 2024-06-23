from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import threading
import json, time
from tqdm import tqdm

from gpt import pluck_probs, tokenizer
from space import parse
from network import BREAK_TOKEN

# global variable to keep track of whether the server is working on something
working = False
lock = threading.Lock()

app = Flask(__name__)
CORS(app)


# Generator for tokenizing and calculating the probabilities of each token in a phrase
def stream_probs(text, extra_context, mock=False):
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
            for token in pluck_probs(text, extra_context):
                yield json.dumps(token) + BREAK_TOKEN
    finally:
        with lock:
            global working
            working = False

        

@app.route("/probs", methods=["POST"])
def probs():
    global working
    
    with lock:
        if working:
            print("Ignoring request, still working on previous response")
            return Response("Still working on previous response", content_type='application/json')
        working = True

    data = request.get_json()
    text = data["text"]
    extra_context = data.get("context", tokenizer.eos_token)
    print('request', data, 'working', working)

    return Response(stream_probs(text, extra_context), content_type='application/json')

# @app.route("/spacy", methods=["POST"])
# def spacy_tokens():
#     global working

#     with lock:
#         if working: 
#             print("Ignoring request, still working on previous response")
#             return Response("Still working on previous response", content_type='application/json')
#         else:
#             working = True

#     data = request.get_json()
#     text = data["text"]
#     print('request', data)
#     return jsonify(parse(text))


if __name__ == "__main__":
    app.run()