import { glassify, subtleGlassify, deepen, grayer} from '../../scripts/color';


export const prismSettings = {
  'context': {
    'showItems': ['prob'],
    'color': "#00B1E1"
  },
  'probs': {
    'showItems': ['prob'],
    'color': "#ffd6a5"
  },
  'alternate': {
    'showItems': ['prob'],
    'color': "#fdffb6"
  },
  'sound': {
    'showItems': ['sound'],
    'color': "#caffbf"
  },
  'words': {
    'showItems': ['pos'],
    'color': "#9bf6ff"
  },
  'thesaurus': {
    'showItems': ['pos', 'sound', 'prob'],
    'color': "#a0c4ff"
  },
  'reader': {
    'showItems': ['pos', 'sound', 'prob'],
    'color': "#ffc6ff"
  },
  'dictionary': {
    'showItems': ['pos', 'sound'],
    'color': "#bdb2ff"
  },
  'search': {
    'showItems': ['pos', 'sound', 'prob'],
    'color': "#ffc6ff"
  }
};

Object.keys(prismSettings).forEach(prismType => {
  const defaultColor = prismSettings[prismType].color;
  prismSettings[prismType].deepColor  = deepen(defaultColor);
  prismSettings[prismType].grayColor  = grayer(defaultColor);
  prismSettings[prismType].glassColor = glassify(defaultColor, 0.6);
  prismSettings[prismType].solidGlassColor = glassify(defaultColor, 0.8);
  // console.log('colors: prismSettings', prismType, prismSettings[prismType]);
});

export const prismStyles = (prism) => {
  const active = prism.active;
  let textColor = active ? deepen(prism.color) : grayer(prism.color); // TODO cache this

  const style = active ? {
    background: glassify(prism.color, 0.4),
    color: textColor,
  } : {
    background: grayer(prism.color, 0.3),
    color: textColor,
  };
  
  const titleStyle = {color: textColor}
  const buttonStyle = active ? {
    background: glassify(prism.color, 0.6),
    color: textColor,
  } : {
    background: grayer(prism.color, 0.4),
    color: textColor,
  };

  return { style, titleStyle, buttonStyle }

}