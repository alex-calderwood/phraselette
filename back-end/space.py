import spacy, json
from network import BREAK_TOKEN

nlp = spacy.load("en_core_web_sm")

# something unlikely to be seen, must match the client (in smarts.js)
BREAK_TOKEN = "&&VE*A=]"

def parse(text, extra_context = ''):
    # Process the text
    doc = nlp(text)

    for token in doc:
        print(token)
        yield {
            'text': token.text,
            'span': [token.idx, token.idx + len(token.text)],
            'prob': 0
        }


# Generator for tokenizing and calcultating probabilities of each token in a phrase
def stream_parse(text, extra_context):
    for token in parse(text, extra_context):
        yield json.dumps(token) + BREAK_TOKEN