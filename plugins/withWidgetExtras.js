const fs = require('fs');
const path = require('path');
const { withXcodeProject } = require('expo/config-plugins');

/**
 * Extras for the widget extension that expo-widgets does not generate. expo-widgets recreates
 * `ios/ExpoWidgetsTarget` on every prebuild, so they are re-applied here, after its files exist:
 * - an asset catalog with `NixWidgetLogo` (Live Activity and Home Screen widget), rebuilt from
 *   `assets/brand/widget/`;
 * - the iOS 18 Control Center camera control (`plugins/widget-extras/NixCameraControl.swift`),
 *   registered in the generated widget bundle.
 */
const TARGET_NAME = 'ExpoWidgetsTarget';
const IMAGE_SET = 'NixWidgetLogo';
const SCALES = [
  ['NixWidgetLogo.png', '1x'],
  ['NixWidgetLogo@2x.png', '2x'],
  ['NixWidgetLogo@3x.png', '3x'],
];

function writeCatalog(projectRoot, platformRoot) {
  const catalog = path.join(platformRoot, TARGET_NAME, 'Assets.xcassets');
  const imageSet = path.join(catalog, `${IMAGE_SET}.imageset`);
  fs.mkdirSync(imageSet, { recursive: true });
  fs.writeFileSync(
    path.join(catalog, 'Contents.json'),
    `${JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2)}\n`
  );
  for (const [file] of SCALES) {
    fs.copyFileSync(path.join(projectRoot, 'assets', 'brand', 'widget', file), path.join(imageSet, file));
  }
  fs.writeFileSync(
    path.join(imageSet, 'Contents.json'),
    `${JSON.stringify(
      {
        images: SCALES.map(([filename, scale]) => ({ filename, idiom: 'universal', scale })),
        info: { author: 'xcode', version: 1 },
      },
      null,
      2
    )}\n`
  );
}

function addCatalogToTarget(project) {
  const target = project.pbxTargetByName(TARGET_NAME);
  const targetUuid = project.findTargetKey(TARGET_NAME);
  if (!target || !targetUuid) return;

  const fileRefs = project.pbxFileReferenceSection();
  const groupKey = project.findPBXGroupKey({ name: TARGET_NAME }) ?? project.findPBXGroupKey({ path: TARGET_NAME });
  if (!groupKey) return;
  const group = project.getPBXGroupByKey(groupKey);
  // Idempotent: the catalog is referenced once per target group.
  if (group.children.some((child) => child.comment === 'Assets.xcassets')) return;

  // The xcode library's lookup falls back to the app's own Resources phase, so resolve the
  // phase strictly through this target's buildPhases.
  const resourcesSection = project.hash.project.objects.PBXResourcesBuildPhase ?? {};
  project.hash.project.objects.PBXResourcesBuildPhase = resourcesSection;
  const ownPhaseRef = target.buildPhases.find((phase) => resourcesSection[phase.value]);
  let resourcesPhase = ownPhaseRef ? resourcesSection[ownPhaseRef.value] : null;
  if (!resourcesPhase) {
    const phaseUuid = project.generateUuid();
    resourcesPhase = { isa: 'PBXResourcesBuildPhase', buildActionMask: 2147483647, files: [], runOnlyForDeploymentPostprocessing: 0 };
    resourcesSection[phaseUuid] = resourcesPhase;
    resourcesSection[`${phaseUuid}_comment`] = 'Resources';
    const frameworksIndex = target.buildPhases.findIndex((phase) => phase.comment === 'Frameworks');
    target.buildPhases.splice(frameworksIndex + 1, 0, { value: phaseUuid, comment: 'Resources' });
  }

  const fileRefUuid = project.generateUuid();
  const buildFileUuid = project.generateUuid();
  fileRefs[fileRefUuid] = {
    isa: 'PBXFileReference',
    lastKnownFileType: 'folder.assetcatalog',
    path: 'Assets.xcassets',
    sourceTree: '"<group>"',
  };
  fileRefs[`${fileRefUuid}_comment`] = 'Assets.xcassets';
  const buildFiles = project.pbxBuildFileSection();
  buildFiles[buildFileUuid] = { isa: 'PBXBuildFile', fileRef: fileRefUuid, fileRef_comment: 'Assets.xcassets' };
  buildFiles[`${buildFileUuid}_comment`] = 'Assets.xcassets in Resources';
  group.children.push({ value: fileRefUuid, comment: 'Assets.xcassets' });
  resourcesPhase.files.push({ value: buildFileUuid, comment: 'Assets.xcassets in Resources' });
}

const CONTROL_FILE = 'NixCameraControl.swift';

function writeCameraControl(projectRoot, platformRoot) {
  const targetDir = path.join(platformRoot, TARGET_NAME);
  fs.copyFileSync(path.join(projectRoot, 'plugins', 'widget-extras', CONTROL_FILE), path.join(targetDir, CONTROL_FILE));
  const indexPath = path.join(targetDir, 'index.swift');
  const index = fs.readFileSync(indexPath, 'utf8');
  if (index.includes('NixCameraControl()')) return;
  const registration = '    if #available(iOS 18.0, *) {\n      NixCameraControl()\n    }\n    WidgetLiveActivity()';
  fs.writeFileSync(indexPath, index.replace(/^ {4}WidgetLiveActivity\(\)/m, registration));
}

function addSourceToTarget(project, fileName) {
  const target = project.pbxTargetByName(TARGET_NAME);
  const groupKey = project.findPBXGroupKey({ name: TARGET_NAME }) ?? project.findPBXGroupKey({ path: TARGET_NAME });
  if (!target || !groupKey) return;
  const group = project.getPBXGroupByKey(groupKey);
  if (group.children.some((child) => child.comment === fileName)) return;
  const sourcesSection = project.hash.project.objects.PBXSourcesBuildPhase ?? {};
  const ownPhaseRef = target.buildPhases.find((phase) => sourcesSection[phase.value]);
  if (!ownPhaseRef) return;
  const fileRefUuid = project.generateUuid();
  const buildFileUuid = project.generateUuid();
  const fileRefs = project.pbxFileReferenceSection();
  fileRefs[fileRefUuid] = {
    isa: 'PBXFileReference',
    includeInIndex: 0,
    lastKnownFileType: 'sourcecode.swift',
    path: fileName,
    sourceTree: '"<group>"',
  };
  fileRefs[`${fileRefUuid}_comment`] = fileName;
  const buildFiles = project.pbxBuildFileSection();
  buildFiles[buildFileUuid] = { isa: 'PBXBuildFile', fileRef: fileRefUuid, fileRef_comment: fileName };
  buildFiles[`${buildFileUuid}_comment`] = `${fileName} in Sources`;
  group.children.push({ value: fileRefUuid, comment: fileName });
  sourcesSection[ownPhaseRef.value].files.push({ value: buildFileUuid, comment: `${fileName} in Sources` });
}

module.exports = function withWidgetExtras(config) {
  return withXcodeProject(config, (config) => {
    const { projectRoot, platformProjectRoot } = config.modRequest;
    writeCatalog(projectRoot, platformProjectRoot);
    writeCameraControl(projectRoot, platformProjectRoot);
    addCatalogToTarget(config.modResults);
    addSourceToTarget(config.modResults, CONTROL_FILE);
    return config;
  });
};

module.exports.addCatalogToTarget = addCatalogToTarget;
module.exports.addSourceToTarget = addSourceToTarget;
