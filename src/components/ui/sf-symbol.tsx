import { Image } from 'expo-image';

type SFSymbolProps = {
  name: string;
  size: number;
  tintColor: string;
};

export function SFSymbol({ name, size, tintColor }: SFSymbolProps) {
  return (
    <Image
      source={`sf:${name}`}
      style={{ width: size, height: size, tintColor }}
      contentFit="contain"
    />
  );
}
