
export function getColor(lense, token) {
  let prob = token.prob || 0;
  if (lense === 'words') {
    return wordToColor(token.text)
  } else if (lense === 'basic') {
    return probToColorExponential(prob);
  } else {
    return probToColor(prob);
  }
}

const probToColor = (prob) => {
  if (!prob || prob <= 0) {
    return 'white';
  }

  let g = prob * 255;
  return "rgba(" + 0 + ", " + g + ", 0, " + prob + ")";
};

const wordToColor = (word) => {
  // Hash function to convert word to a number between 0 and 255
  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    hash = (hash * 31 + word.charCodeAt(i)) % 256;
  }

  // Convert hash to a probability (0 to 1)
  let prob = hash / 255;

  if (!prob || prob <= 0) {
    return 'white';
  }

  let g = Math.floor(prob * 255);
  return "rgba(" + 0 + ", " + g + ", " + 0 + ", " + prob + ")";
};

const probToColorExponential = (prob) => {
  // the probabilities are very small so lets make them more visible
  if (!prob || prob <= 0) {
    return 'white';
  }
  let g = Math.min(Math.pow(prob, 1 / 3) * 255, 255);
  return "rgba(" + 0 + ", " + 255 + ", 0, " + prob + ")";
};
