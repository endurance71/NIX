export type MediaDimensions = {
  width?: number | null;
  height?: number | null;
};

export type MediaCaptureOrientation =
  | 'portrait'
  | 'portraitUpsideDown'
  | 'landscapeLeft'
  | 'landscapeRight';

export type MediaViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotationDegrees?: -90 | 90;
};

export function mediaRotationDegrees(
  orientation?: MediaCaptureOrientation | null
): -90 | 90 | undefined {
  if (orientation === 'landscapeLeft') return 90;
  if (orientation === 'landscapeRight') return -90;
  return undefined;
}

function hasValidDimensions(dimensions: MediaDimensions): dimensions is {
  width: number;
  height: number;
} {
  return (
    typeof dimensions.width === 'number'
    && Number.isFinite(dimensions.width)
    && dimensions.width > 0
    && typeof dimensions.height === 'number'
    && Number.isFinite(dimensions.height)
    && dimensions.height > 0
  );
}

/** Unknown media stays contained so a landscape frame is never briefly cropped. */
export function mediaContentFit(dimensions: MediaDimensions): 'contain' | 'cover' {
  if (!hasValidDimensions(dimensions)) return 'contain';
  return dimensions.width > dimensions.height ? 'contain' : 'cover';
}

/**
 * iOS reports encoded track dimensions before applying its presentation transform.
 * A portrait recording can therefore look landscape here, so video surfaces must
 * not derive their fit from the raw width and height.
 */
export function videoContentFit(_dimensions?: MediaDimensions): 'cover' {
  return 'cover';
}

export function mediaEditingViewport(params: {
  media: MediaDimensions;
  viewportWidth: number;
  viewportHeight: number;
  captureOrientation?: MediaCaptureOrientation | null;
}): MediaViewport {
  const viewportWidth = Math.max(1, params.viewportWidth);
  const viewportHeight = Math.max(1, params.viewportHeight);
  const rotationDegrees = mediaRotationDegrees(params.captureOrientation);

  if (rotationDegrees) {
    return {
      left: (viewportWidth - viewportHeight) / 2,
      top: (viewportHeight - viewportWidth) / 2,
      width: viewportHeight,
      height: viewportWidth,
      rotationDegrees,
    };
  }

  if (
    params.captureOrientation === 'portrait'
    || params.captureOrientation === 'portraitUpsideDown'
  ) {
    return { left: 0, top: 0, width: viewportWidth, height: viewportHeight };
  }

  if (mediaContentFit(params.media) === 'cover' || !hasValidDimensions(params.media)) {
    return { left: 0, top: 0, width: viewportWidth, height: viewportHeight };
  }

  const scale = Math.min(
    viewportWidth / params.media.width,
    viewportHeight / params.media.height
  );
  const width = params.media.width * scale;
  const height = params.media.height * scale;

  return {
    left: (viewportWidth - width) / 2,
    top: (viewportHeight - height) / 2,
    width,
    height,
  };
}
