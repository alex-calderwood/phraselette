from abc import ABC, abstractmethod
from typing import List, Any
from transformers.generation.beam_constraints import Constraint
from abc import ABC, abstractmethod
from typing import List, Any
from abc import ABC, abstractmethod
from typing import List, Any
import random

class Checker(ABC):
    @abstractmethod
    def __call__(self, sequence: List[int]) -> bool:
        pass

    @abstractmethod
    def produce_advance_token(self, current_sequence: List[int], mode: str) -> List[int]:
        pass

    @property
    @abstractmethod
    def expected_length(self) -> int:
        pass

class ClassifiableConstraint(Constraint):
    VALID_MODES = {'contains', 'starts_with', 'ends_with'}

    def __init__(self, checker: 'Checker', mode: str, tokenizer):
        if mode not in self.VALID_MODES:
            raise ValueError(f"Invalid mode: {mode}. Valid modes are: {', '.join(self.VALID_MODES)}")
        self.checker = checker
        self.mode = mode
        self.tokenizer = tokenizer
        self.current_sequence = []
        self.current_tokens = []
        self.completed = False
        self.seqlen = checker.expected_length
        self.num_fulfilled = 0
        print('init constraint', self, 'seqlen', self.seqlen)

    def advance(self):
        """
        When called, returns the token that would take this constraint one step closer to being fulfilled.

        Return:
            token_ids(`torch.tensor`): Must be a tensor of a list of indexable tokens, not some integer.
        """
        print("constraint: advance")
        return self.checker.produce_advance_token(self.current_sequence, self.mode)

    def does_advance(self, token: int) -> bool:
        """
        Reads in a token and returns whether it creates progress.
        """

        # temp_tokens = self.current_tokens + self.tokenizer.decode([token]).lower().split()
        new_decoded = self.tokenizer.decode([token]).lower()

        print(f'constraint: does_advance called. mode: {self.mode}, token: {token} for sequence {self.current_sequence}', "new_decoded", new_decoded)


        if self.mode == 'contains':
            advances = self.checker.check_does_advance(self.current_tokens, new_decoded, self.mode)
        # elif self.mode == 'starts_with':
        #     advances = self.checker(temp_sequence) if not self.current_sequence else True
        # elif self.mode == 'ends_with':
        #     advances = self.checker(temp_sequence[-self.checker.expected_length:])
        else:
            raise NotImplementedError("does advance called for", self.mode, "mode");
        print("does_advance", advances)
        return advances

    def update(self, token: int) -> tuple[bool, bool, bool]:
        decoded = self.tokenizer.decode([token])
        print(f"update with token {token} {decoded}")
        stepped   = False
        completed = False
        reset     = False

        if self.does_advance(token):
            self.current_sequence.append(token)
            self.current_tokens.append(decoded)
            stepped = True
            self.num_fulfilled += 1
            if self.mode == 'contains' and self.checker(self.current_tokens):
                completed = True
            # elif self.mode == 'starts_with' and len(self.current_sequence) == self.checker.expected_length:
                # completed = True
            # 'ends_with' would be checked externally when generation is complete
        else:
            self.current_sequence.append(token)
            self.current_tokens.append(decoded)
            self.reset()
            reset = True
        
        self.completed = completed
        print(f'update stepped {stepped} completed {completed} reset {reset} after update {self.current_sequence} {self.current_tokens}')
        return stepped, completed, reset

    def reset(self):
        """
        Resets the state of this constraint to its initialization. We would call this in cases where the fulfillment of
        a constraint is abrupted by an unwanted token.
        """
        self.current_sequence = []
        self.current_tokens = []
        self.completed = False
        self.num_fulfilled = 0
        
        # don't think we have to reset checker because the checker variables don't change (expected_pos_sequence, tokenizer)

    def remaining(self) -> int:
        """
        Returns the number of remaining steps of `advance()` in order to complete this constraint.
        """
        r = self.seqlen - self.num_fulfilled
        print("remaining", r)
        return r
    
    def copy(self, stateful = False): # TODO warning this is meant to be False
        """
        Creates a new instance of this constraint.

        Args:
            stateful(`bool`): Whether to not only copy the constraint for new instance, but also its state.

        Return:
            constraint(`Constraint`): The same constraint as the one being called from.
        """
        new_constraint = ClassifiableConstraint(self.checker, self.mode, self.tokenizer)
        print(f'copying stateful {stateful} WARNING THIS IS FALSE IN THE GIVEN IMPLEMENTATION??')

        if stateful:
            new_constraint.current_sequence = self.current_sequence.copy()
            new_constraint.current_tokens = self.current_tokens.copy()
            print(f'copied constraint sequence from { self.current_sequence} to {new_constraint.current_sequence} and tokens {self.current_tokens} to {new_constraint.current_tokens}')
            new_constraint.completed = self.completed
            self.seqlen = self.checker.expected_length
            new_constraint.num_fulfilled = self.num_fulfilled
        return new_constraint

class POSChecker(Checker):
    POS_EXAMPLES = {
        'DET': ['a', 'an', 'the'],
        # 'NOUN': ['cat', 'dog', 'house', 'tree', 'car', 'book', 'computer'],
        'NOUN': ['cat', 'feline', 'jaguar', 'rhino', 'hippo', 'lion'],
        'VERB': ['is', 'are', 'was', 'were', 'run', 'jump', 'eat', 'sleep'],
        'ADJ': ['big', 'small', 'red', 'blue', 'happy', 'sad', 'fast', 'slow'],
        'ADV': ['quickly', 'slowly', 'loudly', 'quietly', 'very', 'really', 'almost'],
        'PREP': ['in', 'on', 'at', 'by', 'with', 'from', 'to', 'of'],
        'TEST': ['test'],
    }

    def __init__(self, expected_pos_sequence: List[str], tokenizer):
        self.expected_pos_sequence = expected_pos_sequence
        self._expected_length = len(expected_pos_sequence)
        self.tokenizer = tokenizer

    def __call__(self, tokens: List[str]) -> bool:
        """
        Does token_ids satisfy the constraint?
        """
        if len(tokens) == 0:
            return False
        
        observed_pos_tags = [self.simplified_pos_tag(token) for token in tokens]
        completed = observed_pos_tags == self.expected_pos_sequence
        print(f"checker tokens {tokens} with tags {observed_pos_tags}, expected {self.expected_pos_sequence} completed {completed}")
        return completed
    
    
    def check_does_advance(self, prev_tokens: List[str], new_token: str, mode: str):
        prev_pos_tags = [self.simplified_pos_tag(token) for token in prev_tokens]
        new_pos_tag = self.simplified_pos_tag(new_token)

        print(f'check_does_advance prev_tokens {prev_tokens} prev_pos_tags {prev_pos_tags} new_pos_tag {new_pos_tag}, target {self.expected_pos_sequence}')

        if mode == 'contains':
            # If we already have a full match, adding a new token doesn't advance
            if prev_pos_tags[-self.expected_length:] == self.expected_pos_sequence:
                print('check_does_advance false')
                return False

            # Find the longest partial match at the end of prev_pos_tags
            for i in range(min(len(prev_pos_tags), self.expected_length - 1), 0, -1):
                if prev_pos_tags[-i:] == self.expected_pos_sequence[:i]:
                    # Check if the new token continues the match
                    if new_pos_tag == self.expected_pos_sequence[i]:
                        print('check_does_advance true')

                        return True
                    break

            # If no partial match found, check if the new token starts a new match
            return new_pos_tag == self.expected_pos_sequence[0]
        else:
            raise NotImplementedError("check does advance")

    def satisfied(self, pos_seqeunce: List[str], mode):
        """The number of POS elements in expected_pos_sequence that pos_sequence satisfies"""
        # Alex: currently need to implement this

        # if mode == "contains":
        #     for idx in range(len(self.expected_pos_sequence) - len(pos_seqeunce) + 1):
        #         sat = 0
        #         innerIdx = 0;
        #         for innerIdx in range(len(expected_pos_sequence))
        #         if self.expected_pos_sequence[idx] == pos_seqeunce[innerIdx]:
        #             sat += 1;

        return 0

    def produce_advance_token(self, current_sequence: List[int], mode: str) -> List[int]:
        print('checker advance called with sequence', current_sequence, 'mode:', mode)
        
        next_pos = self.expected_pos_sequence[len(current_sequence)]
        print('checker next expected pos', next_pos)
        example_words = self.POS_EXAMPLES.get(next_pos, None)
        print('checker possible words', example_words)
        
        if not example_words:
            possible = None # No examples available for this POS
        else:
            # TODO can we constrain here?
            # Choose a random example word
            # example_word = random.choice(example_words) # TODO I believe we want to actually return all of the possible tokens?
            
            # Encode the example word and return its token IDs
            # return self.tokenizer.encode(example_word, add_special_tokens=False)

            possible = [self.tokenizer.encode(" " + word)[0] for word in example_words] # there must be a way to batch this
        print('checker produce_advance ids', possible)
        return possible

    @property
    def expected_length(self) -> int:
        return self._expected_length

    def simplified_pos_tag(self, token: str) -> str:
        lower_token = token.strip().lower()
        for pos, words in self.POS_EXAMPLES.items():
            if lower_token in words:
                return pos
        return 'NONE'
    
def test():
    from transformers import AutoTokenizer

    # Initialize tokenizer
    tokenizer = AutoTokenizer.from_pretrained("gpt2")

    # Create a POS checker for a sequence: Determiner, Noun, Verb
    pos_checker = POSChecker(['DET', 'DET', 'DET'], tokenizer)
    
    # Create a ClassifiableConstraint with 'contains' mode
    constraint = ClassifiableConstraint(pos_checker, 'contains', tokenizer)
    
    # Simulate token generation
    text = "The cat is on the the the the"
    token_ids = tokenizer.encode(text)
    
    for token_id in token_ids:
        stepped, completed, reset = constraint.update(token_id)
        print(f"Token: {tokenizer.decode([token_id])}, Stepped: {stepped}, Completed: {completed}, Reset: {reset}")
        if completed:
            print("Constraint partially satisfied!")
            break
    
    print(f"Remaining: {constraint.remaining()}")
    
# Example usage:
if __name__ == "__main__":
    test()