import { describe, expect, it } from 'vitest';
import { containerRootOf, rebaseContainerUri } from './uploadContainerPath';

const OLD = 'file:///var/mobile/Containers/Data/Application/5371AD35-0761-4B53-A83F-93116469D224/';
const NEW = 'file:///var/mobile/Containers/Data/Application/80A7A24A-37E3-418B-AFA0-D306AB3DC572/';
const STAGED = `${OLD}Library/Application%20Support/NiX/Uploads/job-1/prepared.mp4`;

describe('containerRootOf', () => {
  it('returns the data-container prefix', () => {
    expect(containerRootOf(`${NEW}Documents/`)).toBe(NEW);
  });

  it('is null for URIs outside a data container', () => {
    expect(containerRootOf('file:///tmp/x.mov')).toBeNull();
    expect(containerRootOf(null)).toBeNull();
  });
});

describe('rebaseContainerUri', () => {
  it('moves a URI from the container of an earlier install to the current one', () => {
    expect(rebaseContainerUri(STAGED, `${NEW}Documents/`)).toBe(
      `${NEW}Library/Application%20Support/NiX/Uploads/job-1/prepared.mp4`,
    );
  });

  it('keeps a URI that already lives in the current container', () => {
    const current = `${NEW}Library/Application%20Support/NiX/Uploads/job-1/prepared.mp4`;
    expect(rebaseContainerUri(current, `${NEW}Documents/`)).toBe(current);
  });

  it('treats /private/var and /var as the same container', () => {
    const privateCurrent = NEW.replace('file:///var/', 'file:///private/var/');
    const uri = `${NEW}Documents/NiX/Uploads/job-1/source.mov`;
    expect(rebaseContainerUri(uri, `${privateCurrent}Documents/`)).toBe(uri);
  });

  it('leaves non-container URIs and unknown current roots alone', () => {
    expect(rebaseContainerUri('file:///tmp/x.mov', `${NEW}Documents/`)).toBe('file:///tmp/x.mov');
    expect(rebaseContainerUri(STAGED, null)).toBe(STAGED);
    expect(rebaseContainerUri(STAGED, 'file:///tmp/')).toBe(STAGED);
  });
});
