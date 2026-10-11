/**
 * iOS 27 switched the default scroll edge effect under bars to the hard cutoff with a dividing
 * line. NiX keeps the iOS 26 soft fade everywhere: native stacks get this through screen options,
 * SwiftUI lists through the `scrollEdgeEffectStyle('soft')` modifier. Ignored before iOS 26.
 */
export const SOFT_SCROLL_EDGE_EFFECTS = { top: 'soft', bottom: 'soft' } as const;
