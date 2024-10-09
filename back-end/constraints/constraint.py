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
    def advance(self, current_sequence: List[int], mode: str) -> List[int]:
        pass

    @abstractmethod
    def remaining(self, current_sequence: List[int], mode: str) -> int:
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
        self.completed = False
        self.seqlen = checker.expected_length

    def advance(self):
        return self.checker.advance(self.current_sequence, self.mode)

    def does_advance(self, token: int) -> bool:
        temp_sequence = self.current_sequence + [token]
        if self.mode == 'contains':
            return self.checker(temp_sequence)
        elif self.mode == 'starts_with':
            return self.checker(temp_sequence) if not self.current_sequence else True
        elif self.mode == 'ends_with':
            return self.checker(temp_sequence[-self.checker.expected_length:])

    def update(self, token: int) -> tuple[bool, bool, bool]:
        stepped = False
        completed = False
        reset = False
        
        if self.does_advance(token):
            self.current_sequence.append(token)
            stepped = True
            if self.mode == 'contains' and self.checker(self.current_sequence):
                completed = True
            elif self.mode == 'starts_with' and len(self.current_sequence) == self.checker.expected_length:
                completed = True
            # 'ends_with' would be checked externally when generation is complete
        else:
            reset = True
            self.reset()
        
        self.completed = completed
        return stepped, completed, reset

    def reset(self):
        self.current_sequence = []
        self.completed = False

    def remaining(self) -> int:
        return self.checker.remaining(self.current_sequence, self.mode)

    def copy(self, stateful: bool = False):
        new_constraint = ClassifiableConstraint(self.checker, self.mode, self.tokenizer)
        if stateful:
            new_constraint.current_sequence = self.current_sequence.copy()
            new_constraint.completed = self.completed
        return new_constraint

class POSChecker(Checker):
    POS_EXAMPLES = {
        # 'DET': ['a', 'an'],
        # 'NOUN': ['cat', 'dog', 'house', 'tree', 'car', 'book', 'computer'],
        # 'VERB': ['is', 'are', 'was', 'were', 'run', 'jump', 'eat', 'sleep'],
        # 'ADJ': ['big', 'small', 'red', 'blue', 'happy', 'sad', 'fast', 'slow'],
        # 'ADV': ['quickly', 'slowly', 'loudly', 'quietly', 'very', 'really', 'almost'],
        # 'PREP': ['in', 'on', 'at', 'by', 'with', 'from', 'to', 'of'],
        'NOUN': [' dog'],
        'TEST': [' test'],
    }

    def __init__(self, expected_pos_sequence: List[str], tokenizer):
        self.expected_pos_sequence = expected_pos_sequence
        self._expected_length = len(expected_pos_sequence)
        self.tokenizer = tokenizer

    def __call__(self, token_ids: List[int]) -> bool:
        tokens = self.tokenizer.decode(token_ids).split()
        pos_tags = [self.simplified_pos_tag(token) for token in tokens]
        return pos_tags == self.expected_pos_sequence[:len(pos_tags)]

    def advance(self, current_sequence: List[int], mode: str) -> List[int]:
        if len(current_sequence) >= self._expected_length:
            return None  # No more tokens needed
        
        next_pos = self.expected_pos_sequence[len(current_sequence)]
        example_words = self.POS_EXAMPLES.get(next_pos, None)
        
        if not example_words:
            return None  # No examples available for this POS
        
        # Choose a random example word
        example_word = random.choice(example_words)
        
        # Encode the example word and return its token IDs
        return self.tokenizer.encode(example_word, add_special_tokens=False)

    def remaining(self, current_sequence: List[int], mode: str) -> int:
        return max(0, self.expected_length - len(current_sequence))

    @property
    def expected_length(self) -> int:
        return self._expected_length

    def simplified_pos_tag(self, token: str) -> str:
        lower_token = token.lower()
        for pos, words in self.POS_EXAMPLES.items():
            if lower_token in words:
                return pos
        return 'NOUN'  # Default to NOUN if not found
    
# Example usage:
if __name__ == "__main__":
    from transformers import AutoTokenizer

    # Initialize tokenizer
    tokenizer = AutoTokenizer.from_pretrained("gpt2")

    # Create a POS checker for a sequence: Determiner, Noun, Verb
    pos_checker = POSChecker(['DET'], tokenizer)
    
    # Create a ClassifiableConstraint with 'contains' mode
    constraint = ClassifiableConstraint(pos_checker, 'contains', tokenizer)
    
    # Simulate token generation
    text = "The cat is on the mat"
    token_ids = tokenizer.encode(text)
    
    for token_id in token_ids:
        stepped, completed, reset = constraint.update(token_id)
        # print(f"space: Token: {tokenizer.decode([token_id])}, Stepped: {stepped}, Completed: {completed}, Reset: {reset}")
        if completed:
            print("Constraint satisfied!")
            break
    
    print(f"Remaining: {constraint.remaining()}")