import { glassify, subtleGlassify, deepen, grayer, generateRainbowColors} from '../../scripts/color';


export const prismSettings = {
  'words': {
    'showItems': ['pos'],
    'color': "#9bf6ff",
    'defaultIndex': 0,
  },
  'context': {
    'showItems': ['prob'],
    'color': "#00B1E1",
    'defaultIndex': 1,
  },
  'probs': {
    'showItems': ['prob'],
    'color': "#ffd6a5",
    'defaultIndex': 2,
  },
  // 'alternate': {
  //   'showItems': ['prob'],
  //   'color': "#fdffb6"
  // },
  'sound': {
    'showItems': ['sound'],
    'color': "#caffbf",
    'defaultIndex': 3,
  },
  'thesaurus': {
    'showItems': ['pos', 'sound', 'prob'],
    'color': "#a0c4ff",
    'defaultIndex': 4,
  },
  'reader': {
    'showItems': ['pos', 'sound', 'prob'],
    'color': "#ffc6ff",
    'defaultIndex': 5,
  },
  'dictionary': {
    'showItems': ['pos', 'sound'],
    'color': "#bdb2ff",
    'defaultIndex': 6,
  },
  'search': {
    'showItems': ['pos', 'sound', 'prob'],
    'color': "#ffc6ff",
    'defaultIndex': 7,
  }
};

let rainbow = generateRainbowColors(Object.keys(prismSettings).length);
let prismTypes = Object.keys(prismSettings).sort((a, b) => prismSettings[a].defaultIndex - prismSettings[b].defaultIndex);
for(let i = 0; i < prismTypes.length; i++) {
  const defaultColor = rainbow[i];
  const prismType = prismTypes[i];
  prismSettings[prismType].color = defaultColor;
  prismSettings[prismType].deepColor  = deepen(defaultColor);
  prismSettings[prismType].grayColor  = grayer(defaultColor);
  prismSettings[prismType].glassColor = glassify(defaultColor, 0.6);
  prismSettings[prismType].solidGlassColor = glassify(defaultColor, 0.8);
  console.log('colors: prismSettings', prismType, prismSettings[prismType]);
};

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