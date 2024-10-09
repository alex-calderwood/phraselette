import chroma from "chroma-js";
const colorScale = chroma.scale(['red', 'white', 'green', 'green']).mode('lab');
const rainbowScale = chroma.scale(['red', 'yellow', 'green', 'blue', 'purple', 'cyan', 'coral', 'teal', 'orange', 'skyblue', 'burlywood']).mode('lab');

// Define the color scale
const logScale = chroma.scale(['red', 'yellow', 'green']).mode('lab');

// Define the logprob thresholds
const MIN_LOGPROB = -15; // 1e-1000
const MID_LOGPROB = -5;   // 1e-10
const MAX_LOGPROB = 0;

const BRIGHTEN = 2.5;

export function getColor(tokenType, token) {
  let prob = token.getAttribute('prob', 0);
  switch (tokenType) {
    case 'basic':
      return categoryToColor(token.text);
    case 'context': case 'probs': case 'alternate':
      return probColor(token);
    case 'words': case 'POS':
      return categoryToColor(token.getAttribute('pos', ''));
    case 'sound':
      return categoryToColor(token.getAttribute('rhyming_part', []).join(' '));
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

export const categoryToColor = (word) => {
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
  let hex = rainbowScale(prob).brighten(BRIGHTEN).hex();
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
  let prob = token.getAttribute('prob', 0);
  return getLogProbToColor(prob).css();
}


export function getLogProbToColor(logProb) {
  // Clamp the logProb to our defined range
  const clampedLogProb = Math.max(MIN_LOGPROB, Math.min(MAX_LOGPROB, logProb));
  
  // Normalize the logProb to a 0-1 range
  let normalizedValue;
  if (clampedLogProb <= MID_LOGPROB) {
    normalizedValue = (clampedLogProb - MIN_LOGPROB) / (MID_LOGPROB - MIN_LOGPROB) * 0.5;
  } else {
    normalizedValue = 0.5 + (clampedLogProb - MID_LOGPROB) / (MAX_LOGPROB - MID_LOGPROB) * 0.5;
  }
  
  // Get the color and apply brightening
  let color = logScale(normalizedValue).brighten(BRIGHTEN);
  return color;
}


export function zeroToOneColor(val) {
  let alpha = 0.5;
  let hex = colorScale(val).brighten(BRIGHTEN).css();
  return hex;
}

// Blur idea
{/* <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <filter id="blur1"><feGaussianBlur stdDeviation="10"/></filter>
    <filter id="blur2"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="blur3"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="blur4"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="blur5"><feGaussianBlur stdDeviation="2"/></filter>
    <filter id="blur6"><feGaussianBlur stdDeviation="1"/></filter>
    <filter id="blur7"><feGaussianBlur stdDeviation="0.5"/></filter>
  </defs>
  
  <circle cx="50" cy="50" r="40" fill="black" filter="url(#blur1)"/>
  
  <!-- Repeat for each blur level, changing the filter -->
  <!-- <circle cx="50" cy="50" r="40" fill="black" filter="url(#blur2)"/> -->
  <!-- ... -->
  <!-- <circle cx="50" cy="50" r="40" fill="black"/> -->
</svg> */}
