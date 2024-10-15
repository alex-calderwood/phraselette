import tensorflow as tf
import torch
from transformers import TFLogitsProcessor, LogitsProcessor

class TFSpaceAwareLogitsProcessor(TFLogitsProcessor):
    r"""
    [`TFLogitsProcessor`] that adjusts token generation based on the presence of a trailing space in the input sequence.

    This processor ensures that if the input sequence ends with a space, the next token generated must also start with a space. 
    It modifies the token generation scores to enforce this constraint at the start of the output generation.

    Attributes:
        space_tokens (tf.Tensor): A boolean tensor indicating which tokens in the vocabulary start with a space.
    """

    def __init__(self, tokenizer):
        self.ends_with_space = False
        self.input_len = 0
        self.space_tokens = tf.constant(
            [tokenizer.decode([i]).startswith(' ') for i in range(tokenizer.vocab_size)], dtype=tf.bool
        )

    def __call__(self, input_ids: tf.Tensor, scores: tf.Tensor, cur_len: int) -> tf.Tensor:
        batch_size, num_tokens = scores.shape
        if self.ends_with_space and cur_len == self.input_len:
            non_space_mask = tf.logical_not(self.space_tokens)
            scores = tf.where(non_space_mask, tf.float32.min, scores)
        return scores

    def set_ends_with_space(self, ends_with_space: bool):
        self.ends_with_space = ends_with_space

    def set_input_len(self, input_len: int):
        self.input_len = input_len

class SpaceAwareLogitsProcessor(LogitsProcessor):
    r"""
    [`LogitsProcessor`] that adjusts token generation based on the presence of a trailing space in the input sequence.

    This processor ensures that if the input sequence ends with a space, the next token generated must also start with a space. 
    It modifies the token generation scores to enforce this constraint at the start of the output generation.

    Attributes:
        space_tokens (torch.Tensor): A boolean tensor indicating which tokens in the vocabulary start with a space.
    """

    def __init__(self, tokenizer):
        self.ends_with_space = False
        self.input_len = 0
        self.space_tokens = torch.tensor(
            [tokenizer.decode([i]).startswith(' ') for i in range(tokenizer.vocab_size)],
            dtype=torch.bool
        )

    def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor) -> torch.FloatTensor:
        batch_size, num_tokens = scores.shape
        if self.ends_with_space and input_ids.shape[1] == self.input_len:
            non_space_mask = ~self.space_tokens
            scores[:, non_space_mask] = float('-inf')
        return scores

    def set_ends_with_space(self, ends_with_space: bool):
        self.ends_with_space = ends_with_space

    def set_input_len(self, input_len: int):
        self.input_len = input_len


class EndlessLogitsProcessor(TFLogitsProcessor):
    r"""
    [`TFLogitsProcessor`] that prevents the generation of specified tokens indefinitely, ensuring the sequence does not terminate prematurely.

    This processor is used to block the generation of certain tokens that could lead to the ending or invalid continuation of a sequence.

    Attributes:
        stoplist_mask (tf.Tensor): A boolean tensor where positions corresponding to the tokens in the stoplist are marked as `True`.
    """

    def __init__(self, tokenizer):
        self.end_stoplist = [tokenizer.eos_token_id, tokenizer.pad_token_id, tokenizer.cls_token_id, tokenizer.sep_token_id]
        self.stoplist_mask = tf.constant([id in self.end_stoplist for id in range(tokenizer.vocab_size)], dtype=tf.bool)

    def __call__(self, input_ids, scores, cur_len):
        # Zero out the scores for stoplist tokens
        scores = tf.where(self.stoplist_mask, tf.float32.min, scores)
        return scores
