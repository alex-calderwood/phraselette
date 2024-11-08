from phones import sound_out

# Mapping between prism name and a function to grab that info
get_additional_word_data = {
    "sound": lambda token: sound_out(token["text"])
}