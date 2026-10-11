// Replaces `react-native-svg/css` for react-native-qrcode-svg only (PERF-5): its LogoSVG imports
// LocalSvg, which drags css-tree + entities (~190 KB) into the bundle. NiX never passes an SVG
// `logo` to QRCode (src/components/friend/my-profile-qr-card.tsx), so the logo path is unreachable.
export const LocalSvg = () => null;
