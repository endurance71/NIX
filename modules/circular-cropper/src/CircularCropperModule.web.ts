import { registerWebModule, NativeModule } from 'expo';

class CircularCropperModule extends NativeModule<{}> {}

export default registerWebModule(CircularCropperModule, 'CircularCropperModule');
