import { createContext, use } from 'react';

type AuthContentWidthContextValue = {
  contentWidth: number;
};

export const AuthContentWidthContext = createContext<AuthContentWidthContextValue | null>(null);

export function useAuthContentWidth(): number {
  const context = use(AuthContentWidthContext);
  if (!context) {
    throw new Error('useAuthContentWidth must be used within an auth layout');
  }
  return context.contentWidth;
}
