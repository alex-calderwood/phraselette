
export function getColor(lense, prob) {
  // console.log('lense', lense, 'prob', prob);
  if (lense === 'words') {
    return probToColor(prob);
  } else if (lense === 'gpt-2') {
    return probToColorExponential(prob);
  } else {
    return probToColor(prob);
  }
}
let prevColor = 100;
let prevColor2 = 138;
const probToColorRandom = (prob) => {
  if (!prob || prob <= 0) {
    return 'white';
  }
  return "rgba(" + prevColor + ", " + prevColor2 + ", 0, " + prevColor / 255 + ")";
};
const probToColor = (prob) => {
  if (!prob || prob <= 0) {
    return 'white';
  }

  let g = prob * 255;
  return "rgba(" + 0 + ", " + g + ", 0, " + prob + ")";
};
const probToColorExponential = (prob) => {
  // the probabilities are very small so lets make them more visible
  if (!prob || prob <= 0) {
    return 'white';
  }
  let g = Math.min(Math.pow(prob, 1 / 3) * 255, 255);
  return "rgba(" + 0 + ", " + g + ", 0, " + 0.5 + ")";
};
