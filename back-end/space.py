import spacy, json
from network import BREAK_TOKEN

nlp = spacy.load("en_core_web_sm")

# something unlikely to be seen, must match the client (in smarts.js)
BREAK_TOKEN = "&&VE*A=]"

# Generator for tokenizing and calcultating probabilities of each token in a phrase
def stream_parse(text, extra_context):
    doc = nlp(text)
    json_doc = doc.to_json() 
    for token in json_doc['tokens']:
        print('spacy token', token)
        yield json.dumps(token) + BREAK_TOKEN