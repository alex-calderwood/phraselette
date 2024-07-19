import chroma from "chroma-js";
const colorScale = chroma.scale(['red', 'white', 'green']).mode('lab');
const rainbowScale = chroma.scale(['red', 'yellow', 'green', 'blue', 'purple']).mode('lab');

export function getColor(type, token) {
  let prob = token.prob || 0;
  switch (type) {
    case 'basic':
      return categoryToColor(token.text);
    case 'likelihood': case 'probability': case 'alternate':
      return probColor(token);
    case 'words': case 'POS':
      return categoryToColor(token.pos);
    case 'sound':
      return categoryToColor(token.sound?.rhyming_part?.join(' '));
    default:
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

const categoryToColor = (word) => {
  // Hash function to convert word to a number between 0 and 255
  if (!word) {
    return 'white';
  }

  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    hash = (hash * 31 + word.charCodeAt(i)) % 256;
  }

  // Convert hash to a probability (0 to 1)
  let prob = hash / 255;

  // rainbow scale
  const alpha = 0.3;
  let hex = rainbowScale(prob).alpha(alpha).hex();
  return hex;
};

const probColor = (token) => {
  if (!token.text) {
    console.error('no text for token', token);
    return 'white';
  }

  return lengthNormedLogProbToColor(token);
};

export function lengthNormedLogProbToColor(token) {
  let prob = Math.log10(token.prob + 1e-12); // avoid log(0)
  let normalized = (prob + 6) / 6; // normalize to [0, 1] TODO don't understand this


  // normalized /= token.text.length || 1; // normalize by length
  let alpha = 0.5;
  let hex = colorScale(normalized).alpha(alpha).css();
  return hex;
}


export function zeroToOneColor(val) {
  let alpha = 0.5;
  let hex = colorScale(val).alpha(alpha).css();
  return hex;
}


