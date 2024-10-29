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
  console.log('defaultColor', defaultColor)
  prismSettings[prismType].deepColor  = deepen(defaultColor);
  prismSettings[prismType].grayColor  = grayer(defaultColor);
  prismSettings[prismType].glassColor = glassify(defaultColor, 0.6);
  prismSettings[prismType].solidGlassColor = glassify(defaultColor, 0.8);

  console.log('colors: prismSettings', prismType, prismSettings[prismType]);
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

// import { glassify, subtleGlassify, deepen, grayer} from '../../scripts/color';

// export var prismSettings = {
//   'context': {
//     'showItems': ['prob'],
//     'colors': {base: "#00B1E1"},
//   },
//   'probs': {
//     'showItems': ['prob'],
//     'colors': {base: "#ffd6a5"},
//   },
//   'alternate': {
//     'showItems': ['prob'],
//     'colors': {base: "#fdffb6"},
//   },
//   'sound': {
//     'showItems': ['sound'],
//     'colors': {base: "#caffbf"},
//   },
//   'words': {
//     'showItems': ['pos'],
//     'colors': {base: "#9bf6ff"},
//   },
//   'thesaurus': {
//     'showItems': ['pos', 'sound', 'prob'],
//     'colors': {base: "#a0c4ff"},
//   },
//   'reader': {
//     'showItems': ['pos', 'sound', 'prob'],
//     'colors': {base: "#ffc6ff"},
//   },
//   'dictionary': {
//     'showItems': ['pos', 'sound'],
//     'colors': {base: "#bdb2ff"},
//   },
//   'search': {
//     'showItems': ['pos', 'sound', 'prob'],
//     'colors': {base: "#ffc6ff"},
//   },
// };

// Object.keys(prismSettings).forEach(prismType => {
//   const defaultColor = prismSettings[prismType].colors.base;
//   console.log('defaultColor', defaultColor)
//   prismSettings[prismType].colors['deep'] = deepen(defaultColor);
//   prismSettings[prismType].colors['grayer'] = grayer(defaultColor);
//   console.log('colors: prismSettings', prismType, prismSettings[prismType].colors);
// });

// export const prismStyles = (prism) => {
//   const active = prism.active;
//   const colors = prismSettings[prism.type].colors;
//   console.log('colors: ', prism.type, colors, prismSettings);
  
//   const textColor = active ? colors.deep  : colors.grayer;

//   const style = active ? {
//     background: glassify(prism.color, 0.4),
//     color: textColor,
//   } : {
//     background: grayer(prism.color, 0.3),
//     color: textColor,
//   };
  
//   const titleStyle = {color: textColor}
//   const buttonStyle = active ? {
//     background: glassify(prism.color, 0.6),
//     color: textColor,
//   } : {
//     background: grayer(prism.color, 0.4),
//     color: textColor,
//   };

//   return { style, titleStyle, buttonStyle }
// }