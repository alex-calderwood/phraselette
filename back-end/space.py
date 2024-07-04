import spacy, json
from network import BREAK_TOKEN

nlp = spacy.load("en_core_web_sm")

# something unlikely to be seen, must match the client (in smarts.js)
BREAK_TOKEN = "&&VE*A=]"

# Generator for tokenizing and calcultating probabilities of each token in a phrase
def stream_parse(text, extra_context):
    doc = nlp(text)
    for token in doc:
        response = json.dumps({
            'text': token.text,
            'lemma': token.lemma_,
            'pos': token.pos_,
            'tag': token.tag_,
            'dep': token.dep_,
            'shape': token.shape_,
            'is_alpha': token.is_alpha,
            'is_stop': token.is_stop,
            'start': token.idx,
            'end': token.idx + max(len(token.text) - 1, 0), # exclusive -> inclusive
        }) + BREAK_TOKEN

        print('token', response)
        yield response