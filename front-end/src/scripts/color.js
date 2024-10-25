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
    case 'search': case 'context': case 'probs': case 'alternate':
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


/**
 * Finds the interpolation between two colors, with optional ratio control
 * @param {string} color1 - The first color
 * @param {string} color2 - The second color
 * @param {number} ratio - How far to go from color1 to color2 (0 to 1, default 0.5)
 * @param {number|null} targetAlpha - Optional fixed alpha value for the result
 * @returns {string} - CSS color string
 */
export function interp(color1, color2, ratio = 0.5, targetAlpha = null) {
  try {
    const c1 = chroma(color1);
    const c2 = chroma(color2);
    
    // Get RGB values for both colors
    const [r1, g1, b1] = c1.rgb();
    const [r2, g2, b2] = c2.rgb();
    
    // Calculate the weighted average RGB values
    const midR = Math.round(r1 + (r2 - r1) * ratio);
    const midG = Math.round(g1 + (g2 - g1) * ratio);
    const midB = Math.round(b1 + (b2 - b1) * ratio);
    
    // Create the result color
    const result = chroma(midR, midG, midB);
    
    // If a target alpha is specified, use it
    if (targetAlpha !== null) {
      return result.alpha(targetAlpha).css();
    }
    
    // Otherwise maintain the alpha of the first color
    return result.alpha(c1.alpha()).css();
  } catch (error) {
    console.error('Invalid color input:', error);
    return color1; // Return the original color if parsing fails
  }
}

/**
 * Creates a glass effect by mixing with semi-transparent white
 * @param {string} color - The base color
 * @returns {string} - CSS color string
 */
export function glassify(color, alpha = 0.5) {
  const glassColor = `rgba(255, 255, 255, ${alpha})`;
  const glassAlpha = chroma(glassColor).alpha();
  
  return interp(color, "rgb(255, 255, 255)", 0.3, glassAlpha);
}

export function subtleGlassify(color, alpha = 0.1) {
  const glassColor = `rgba(255, 255, 255, ${alpha})`;
  const glassAlpha = chroma(glassColor).alpha();
  
  return interp(color, "rgb(255, 255, 255)", 0.5, glassAlpha);
}


export function grayer(color, alpha = 0.5) {
  const glassColor = `rgba(50, 50, 50, ${alpha})`;
  const glassAlpha = chroma(glassColor).alpha();
  
  return interp(color, glassColor, 0.7, glassAlpha);
}

/**
 * Deepens a color by moving 1/3 of the way towards black
 * @param {string} color - The base color
 * @returns {string} - CSS color string
 */
export function deepen(color) {
  return interp(color, "rgb(0, 0, 0)", 1/3);
}
