const path = require('node:path');
const xcode = require('xcode');
const { applyReleaseEnvValidationToProject } = require('../plugins/withIosReleaseEnvValidation');

const projectPath = path.resolve('ios/NiX.xcodeproj/project.pbxproj');
const project = xcode.project(projectPath);
project.parseSync();
applyReleaseEnvValidationToProject(project);
require('node:fs').writeFileSync(projectPath, project.writeSync());
