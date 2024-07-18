import pronouncing
from pprint import pprint

# Return the pronunciation of the given words
# Docs: https://pronouncing.readthedocs.io/en/latest/pronouncing.html
def sound_out(word):
    phones       = pronouncing.phones_for_word(word)

    rhyming_part = [pronouncing.rhyming_part(pronunciation) for pronunciation in phones]
    stresses     = [pronouncing.stresses(pronunciation)     for pronunciation in phones]
    syllables    = [pronouncing.syllable_count(pronunciation) for pronunciation in phones]

    return {
        "phonemes": phones,
        "rhyming_part": rhyming_part,
        "stresses": stresses,
        "syllables": syllables,
    }

if __name__ == "__main__":
    pprint(sound_out("april"))