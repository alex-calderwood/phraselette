import pronouncing
import json

# Return the pronunciation of the given words
def phonemes_for(words):
    phones = []
    for word in words:
        phones_for_word = pronouncing.phones_for_word(word)
        phones.append({
            "text": word,
            "phonemes": phones_for_word
        })

    return phones

if __name__ == "__main__":
    print(phonemes_for("april is the cruelest month".split(" ")))