import pronouncing
from pprint import pprint

def no_stress(phonemes):
    unstressed = ''.join([char for char in phonemes if not char.isdigit()])
    return unstressed
        

# Return the pronunciation of the given words
# Docs: https://pronouncing.readthedocs.io/en/latest/pronouncing.html
def sound_out(word):
    base_phones =   pronouncing.phones_for_word(word)
    phones       = [no_stress(pronunciation) for pronunciation in base_phones]
    rhyming_part = [no_stress(pronouncing.rhyming_part(pronunciation)) for pronunciation in base_phones]
    stresses     = [pronouncing.stresses(pronunciation)     for pronunciation in base_phones]
    syllables    = [pronouncing.syllable_count(pronunciation) for pronunciation in base_phones]

    result = {
        "phonemes":     phones,
        "base_phones":  base_phones,
        "rhyming_part": rhyming_part,
        "stresses":     stresses,
        "syllables":    syllables,
    }

    return result

if __name__ == "__main__":
    pprint(sound_out("works"))