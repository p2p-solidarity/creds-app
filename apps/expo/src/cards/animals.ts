import type { ImageSourcePropType } from 'react-native';

import { type Animal } from '@solidarity/shared';

const PNG: Readonly<Record<Animal, ImageSourcePropType>> = {
  dog: require('../../assets/animals/dog.png') as ImageSourcePropType,
  horse: require('../../assets/animals/horse.png') as ImageSourcePropType,
  pig: require('../../assets/animals/pig.png') as ImageSourcePropType,
  sheep: require('../../assets/animals/sheep.png') as ImageSourcePropType,
  dove: require('../../assets/animals/dove.png') as ImageSourcePropType,
};

export function animalImageSource(a: Animal): ImageSourcePropType {
  return PNG[a];
}
