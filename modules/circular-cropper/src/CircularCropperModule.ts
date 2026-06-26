import { NativeModule, requireNativeModule } from 'expo';

declare class CircularCropperModule extends NativeModule<{}> {}

export default requireNativeModule<CircularCropperModule>('CircularCropper');
