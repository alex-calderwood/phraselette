import spacy, json
from words import get_additional_word_data
from network import BREAK_TOKEN

nlp = spacy.load("en_core_web_sm")

# something unlikely to be seen, must match the client (in smarts.js)
BREAK_TOKEN = "&&VE*A=]"

# Generator for tokenizing and calcultating probabilities of each token in a phrase
def stream_parse(text, extra_context, requests):
    doc = nlp(text)
    for token in doc:
        token_data = {
            'text': token.text,
            'lemma': token.lemma_,
            'pos': token.pos_,
            'tag': token.tag_,
            'dep': token.dep_,
            # 'shape': token.shape_,
            'is_alpha': token.is_alpha,
            'is_stop': token.is_stop,
            'is_space': False,            
            'start': token.idx,
            'end': token.idx + len(token.text) - 1,  # exclusive -> inclusive
        }
        # print("token", token, token_data)

        add_extra_request_data(requests, token_data)

        response = json.dumps(token_data) + BREAK_TOKEN
        yield response

        # If there's whitespace following the token, create a separate token for it
        if token.whitespace_:
            whitespace_data = {
                'text': token.whitespace_,
                'lemma': '',
                'pos': '_SP',
                'tag': '_SP',
                'dep': '',
                # 'shape': token.whitespace_.shape,
                'is_alpha': False,
                'is_stop': False,
                'is_space': True,
                'start': token.idx + len(token.text),
                'end': token.idx + len(token.text) + len(token.whitespace_) - 1,
            }

            add_extra_request_data(requests, whitespace_data)

            # Yield the whitespace token
            response = json.dumps(whitespace_data) + BREAK_TOKEN
            yield response

def add_extra_request_data(requests, token_data):
    if requests:
        extra_data = {}
        for request in requests:
            make_request = get_additional_word_data.get(request)
            if make_request:
                extra_data[request] = make_request(token_data)
        token_data['extra'] = extra_data