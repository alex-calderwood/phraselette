from flask import Flask, request, Response, stream_with_context
from flask_cors import CORS
import json, time
from tqdm import tqdm
from queue import Queue
from threading import Thread, Event

from gpt import pluck_probs, tokenizer, forward_search
from space import stream_parse
from phones import sound_out
from network import BREAK_TOKEN

app = Flask(__name__)
CORS(app)

request_queue = Queue()
results = {}

def worker():
    while True:
        item = request_queue.get()
        if item is None:
            break
        task, task_id, event = item
        result = task()
        results[task_id] = result
        event.set()
        request_queue.task_done()

worker_thread = Thread(target=worker)
worker_thread.start()

@app.route("/probs", methods=["POST"])
def probs():
    data = request.get_json()
    text = data["text"]
    extra_context = data.get("context", tokenizer.eos_token)
    top_k = data.get("top_k", 0)

    print('PROBS request', data, 'text', text, 'top_k', top_k)

    def stream_probs(text, extra_context, mock=False, top_k=0):
        if mock: 
            for token in tqdm(range(4)):
                time.sleep(1)
                yield json.dumps({
                    'text': 'token',
                    'span': [0, 4],
                    'prob': 0.5
                }) + BREAK_TOKEN
        else: 
            for token in pluck_probs(text, extra_context, top_k=top_k):
                yield json.dumps(token) + BREAK_TOKEN

    return Response(stream_probs(text, extra_context, top_k=top_k), content_type='application/json')

@app.route("/search", methods=["POST"])
def search():
    data = request.get_json()
    text = data["text"]
    top_k = int(data.get("top_k", 0) or 0)
    depth = int(data.get("depth", 1) or 1)

    print('SEARCH request', data, 'text', text, 'depth', depth)

    def stream_search(text, top_k, depth):
        for span in forward_search(text, top_k, depth):
            yield json.dumps(span) + BREAK_TOKEN

    return Response(stream_search(text, top_k, depth), content_type='application/json', headers={'X-Accel-Buffering': 'no'})

@app.route("/spacy", methods=["POST"])
def spacy():
    data = request.get_json()
    text = data["text"]
    extra_context = data.get("context", "")
    additionalRequests = data.get("requests", [])

    return Response(stream_parse(text, extra_context, additionalRequests), content_type='application/json')

@app.route("/phones", methods=["POST"])
def phones():
    data = request.get_json()
    words = data["words"]

    return Response(json.dumps(sound_out(words)), content_type='application/json')

@app.teardown_appcontext
def shutdown_worker(exception=None):
    request_queue.put(None)
    worker_thread.join()