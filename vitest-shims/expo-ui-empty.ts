import type { ReactNode } from 'react';

export function Host({ children }: { children?: ReactNode }) {
  return children ?? null;
}

export function Column({ children }: { children?: ReactNode }) {
  return children ?? null;
}

export function Row({ children }: { children?: ReactNode }) {
  return children ?? null;
}

export function Spacer() {
  return null;
}

export function Text({ children }: { children?: string }) {
  return children ?? null;
}

export function Button() {
  return null;
}

export function TextInput() {
  return null;
}

export function List({ children }: { children?: ReactNode }) {
  return children ?? null;
}

export function ListItem({ children }: { children?: ReactNode }) {
  return children ?? null;
}

export function FieldGroup({ children }: { children?: ReactNode }) {
  return children ?? null;
}

FieldGroup.Section = function FieldGroupSection({ children }: { children?: ReactNode }) {
  return children ?? null;
};

export function Switch() {
  return null;
}

export function BottomSheet({ children }: { children?: ReactNode }) {
  return children ?? null;
}

export function RNHostView({ children }: { children?: ReactNode }) {
  return children ?? null;
}

export const Icon = Object.assign(
  function Icon() {
    return null;
  },
  {
    select: (spec: { ios: string; android: unknown }) => spec.ios,
  }
);

export function useNativeState<T>(initial: T) {
  return { value: initial };
}

export function MenuView({ children }: { children?: ReactNode }) {
  return children ?? null;
}
