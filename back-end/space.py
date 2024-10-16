import spacy, json
from words import get_additional_word_data
from network import BREAK_TOKEN
import re
import json

gpu_num = 1
on_gpu = spacy.prefer_gpu(gpu_num) # https://spacy.io/api/top-level#spacy.require_gpu
if on_gpu:
    print("spacy: started on GPU", gpu_num)
else:
    print("spacy: unable to start on gpu, reverting to CPU")

nlp = spacy.load("en_core_web_sm") # disable=["attribute_ruler", "lemmatizer", "ner"]) # "tagger", "parser" "tok2vec",  

# something unlikely to be seen, must match the client (in smarts.js)
BREAK_TOKEN = "&&VE*A=]"

COUNT_SINGULAR = 1
COUNT_PLURAL = 2

def js_file_to_python_dict(file_path):
    with open(file_path, 'r') as file:
        js_content = file.read()
    js_content = re.sub(r'^[^{]*', '', js_content, count=1)
    js_content = re.sub(r';?\s*$', '', js_content)
    python_dict = json.loads(js_content)
    return python_dict

GENERIC_MAPPINGS = js_file_to_python_dict('../front-end/data/pos.js')

# GENERIC_TAG_MAPPINGS = {
#   "JJ":  {"tag": {"Adj": True}},
#   "JJR": {"tag": {"Adj": True, "Comparative": True}},
#   "JJS": {"tag": {"Adj": True, "Superlative": True}},
#   "MD":  {"tag": {"Modal": True}},
#   "NN":  {"tag": {"Noun": True}, "count": COUNT_SINGULAR},
#   "NNS": {"tag": {"Noun": True, "Plural": True}, "count": COUNT_PLURAL},
#   "VB":  {"tag": {"Verb": True}, "count": COUNT_PLURAL},
#   "VBD": {"tag": {"Verb": True, "PastTense": True}},
#   "VBG": {"tag": {"Gerund": True}},
#   "VBN": {"tag": {"PastParticiple": True}},
#   "VBP": {"tag": {"Verb": True}, "count": COUNT_PLURAL},
#   "VBZ": {"tag": {"Verb": True}, "count": COUNT_SINGULAR}
# };

# ADJ: adjective, e.g. big, old, green, incomprehensible, first
# ADP: adposition, e.g. in, to, during
# ADV: adverb, e.g. very, tomorrow, down, where, there
# AUX: auxiliary, e.g. is, has (done), will (do), should (do)
# CONJ: conjunction, e.g. and, or, but
# CCONJ: coordinating conjunction, e.g. and, or, but
# DET: determiner, e.g. a, an, the
# INTJ: interjection, e.g. psst, ouch, bravo, hello
# NOUN: noun, e.g. girl, cat, tree, air, beauty
# NUM: numeral, e.g. 1, 2017, one, seventy-seven, IV, MMXIV
# PART: particle, e.g. ’s, not,
# PRON: pronoun, e.g I, you, he, she, myself, themselves, somebody
# PROPN: proper noun, e.g. Mary, John, London, NATO, HBO
# PUNCT: punctuation, e.g. ., (, ), ?
# SCONJ: subordinating conjunction, e.g. if, while, that
# SYM: symbol, e.g. $, %, §, ©, +, −, ×, ÷, =, :), 😝
# VERB: verb, e.g. run, runs, running, eat, ate, eating
# X: other, e.g. sfpksdpsxmsa
# SPACE: space, e.g.

# GENERIC_POS_MAPPINGS = {
#     "ADJ":      {"name": "adjective",   "pos": {"Adj": True}},
#     "ADP":      {"name": "adposition",  "pos": {"Prep": True}},
#     "ADV":      {"name": "adverb",      "pos": {"Adv": True}},
#     "AUX":      {"name": "auxiliary",   "pos": {"Aux": True}},
#     "CONJ":     {"name": "conjunction", "pos": {"Conj": True}},
#     "CCONJ":    {"name": "coordinating conjunction", "pos": {"Conj": True}},
#     "DET":      {"name": "determiner",   "pos": {"Det": True}},
#     "INTJ":     {"name": "interjection", "pos": {"Interj": True}},
#     "NOUN":     {"name": "noun",        "pos": {"Noun": True}},
#     "NUM":      {"name": "numeral",     "pos": {"Num": True}},
#     "PART":     {"name": "particle",    "pos": {"Part": True}},
#     "PRON":     {"name": "pronoun",     "pos": {"Pron": True}},
#     "PROPN":    {"name": "proper noun",     "pos": {"PropNoun": True}},
#     "PUNCT":    {"name": "punctuation",     "pos": {"Punct": True}},
#     "SCONJ":    {"name": "subconjunction",  "pos": {"SubConj": True}},
#     "SYM":      {"name": "symbol",  "pos": {"Sym": True}},
#     "VERB":     {"name": "verb",    "pos": {"Verb": True}},
#     "X":        {"name": "other",   "pos": {"Other": True}},
#     "SPACE":    {"name": "space",   "pos": {"Space": True}}
# }

# Generator for tokenizing and calcultating probabilities of each token in a phrase
def stream_parse(text, extra_context, requests):
    doc = nlp(text)
    for token in doc:
        # print(f"space: Token: {token.text}, POS: {token.pos_}, Tag: {token.tag_}, Dep: {token.dep_}")
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
            'generic': GENERIC_MAPPINGS.get(token.pos, {}).get("pos", {}),
        }

        add_extra_request_data(requests, token_data)

        response = json.dumps(token_data) + BREAK_TOKEN
        # print('spacy: response', response)
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
            # print('spacy: response', response)
            yield response

def add_extra_request_data(requests, token_data):
    if requests:
        extra_data = {}
        for request in requests:
            make_request = get_additional_word_data.get(request)
            if make_request:
                extra_data[request] = make_request(token_data)
        token_data['extra'] = extra_data