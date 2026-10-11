const fs = require('fs');
const path = require('path');
const { withXcodeProject } = require('expo/config-plugins');

/**
 * Extras for the widget extension that expo-widgets does not generate. expo-widgets recreates
 * `ios/ExpoWidgetsTarget` on every prebuild, so they are re-applied here, after its files exist:
 * - an asset catalog with `NixWidgetLogo` (Live Activity and Home Screen widget), rebuilt from
 *   `assets/brand/widget/`;
 * - the iOS 18 Control Center camera control (`plugins/widget-extras/NixCameraControl.swift`),
 *   registered in the generated widget bundle;
 * - its privacy manifest (`plugins/widget-extras/PrivacyInfo.xcprivacy`);
 * - a Polish/English description of the inbox widget.
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

function addResourceToTarget(project, fileName, lastKnownFileType) {
  const target = project.pbxTargetByName(TARGET_NAME);
  const targetUuid = project.findTargetKey(TARGET_NAME);
  if (!target || !targetUuid) return;

  const fileRefs = project.pbxFileReferenceSection();
  const groupKey = project.findPBXGroupKey({ name: TARGET_NAME }) ?? project.findPBXGroupKey({ path: TARGET_NAME });
  if (!groupKey) return;
  const group = project.getPBXGroupByKey(groupKey);
  // Idempotent: each resource is referenced once per target group.
  if (group.children.some((child) => child.comment === fileName)) return;

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
    lastKnownFileType,
    path: fileName,
    sourceTree: '"<group>"',
  };
  fileRefs[`${fileRefUuid}_comment`] = fileName;
  const buildFiles = project.pbxBuildFileSection();
  buildFiles[buildFileUuid] = { isa: 'PBXBuildFile', fileRef: fileRefUuid, fileRef_comment: fileName };
  buildFiles[`${buildFileUuid}_comment`] = `${fileName} in Resources`;
  group.children.push({ value: fileRefUuid, comment: fileName });
  resourcesPhase.files.push({ value: buildFileUuid, comment: `${fileName} in Resources` });
}

function addCatalogToTarget(project) {
  addResourceToTarget(project, 'Assets.xcassets', 'folder.assetcatalog');
}

// The widget links React Native and ExpoWidgets (App Group UserDefaults), so it declares the same
// required-reason APIs as the app; expo-widgets generates no manifest of its own.
const PRIVACY_MANIFEST = 'PrivacyInfo.xcprivacy';

function writePrivacyManifest(projectRoot, platformRoot) {
  fs.copyFileSync(
    path.join(projectRoot, 'plugins', 'widget-extras', PRIVACY_MANIFEST),
    path.join(platformRoot, TARGET_NAME, PRIVACY_MANIFEST)
  );
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

// expo-widgets writes the app.json description (English) as a literal; the widget gallery shows
// it in the device language, so pick Polish the same way NixCameraControl does.
const INBOX_WIDGET_FILE = 'NixInboxWidget.swift';
const INBOX_DESCRIPTION_EN = 'New NiXes in your inbox';
const INBOX_DESCRIPTION_PL = 'Nowe NiX-y w skrzynce';

function localizeInboxDescription(platformRoot) {
  const filePath = path.join(platformRoot, TARGET_NAME, INBOX_WIDGET_FILE);
  if (!fs.existsSync(filePath)) return;
  const source = fs.readFileSync(filePath, 'utf8');
  const literal = `.description("${INBOX_DESCRIPTION_EN}")`;
  if (!source.includes(literal)) return;
  const localized =
    `.description(Text(verbatim: Locale.preferredLanguages.first?.hasPrefix("pl") ?? false` +
    ` ? "${INBOX_DESCRIPTION_PL}" : "${INBOX_DESCRIPTION_EN}"))`;
  fs.writeFileSync(filePath, source.replace(literal, localized));
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
    writePrivacyManifest(projectRoot, platformProjectRoot);
    localizeInboxDescription(platformProjectRoot);
    addCatalogToTarget(config.modResults);
    addResourceToTarget(config.modResults, PRIVACY_MANIFEST, 'text.xml');
    addSourceToTarget(config.modResults, CONTROL_FILE);
    return config;
  });
};

module.exports.addCatalogToTarget = addCatalogToTarget;
module.exports.addResourceToTarget = addResourceToTarget;
module.exports.localizeInboxDescription = localizeInboxDescription;
module.exports.addSourceToTarget = addSourceToTarget;
