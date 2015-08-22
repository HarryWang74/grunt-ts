/// <reference path="../../defs/tsd.d.ts"/>
/// <reference path="./interfaces.d.ts"/>

import {GruntTSDefaults} from './defaults';
import * as utils from './utils';
import _ = require('lodash');

const propertiesFromTarget = ['html', 'htmlOutDir', 'htmlOutDirFlatten', 'reference', 'testExecute', 'tsconfig',
        'templateCache', 'vs', 'watch'],
      propertiesFromTargetOptions = ['additionalFlags', 'comments', 'compile', 'compiler', 'declaration',
        'emitDecoratorMetadata', 'experimentalDecorators', 'failOnTypeErrors', 'fast', 'htmlModuleTemplate',
        'htmlVarTemplate', 'inlineSourceMap', 'inlineSources', 'isolatedModules', 'mapRoot', 'module', 'newLine', 'noEmit',
        'noEmitHelpers', 'noImplicitAny', 'noResolve', 'preserveConstEnums', 'removeComments', 'sourceRoot', 'sourceMap',
        'suppressImplicitAnyIndexErrors', 'target', 'verbose'];

export function resolve(rawTaskOptions: grunt.task.IMultiTask<ITargetOptions>,
                        rawTargetOptions: grunt.task.IMultiTask<ITargetOptions>,
                        targetName = '',
                        files: IGruntTSCompilationInfo[] = []) {

  let {errors, warnings} = resolveAndWarnOnCapitalizationErrors(rawTaskOptions, rawTargetOptions, targetName);

  let result = emptyOptionsResolveResult();
  result.errors.push(...errors);
  result.warnings.push(...warnings);
  result = applyGruntOptions(result, rawTaskOptions);
  result = applyGruntOptions(result, rawTargetOptions);
  result = copyCompilationTasks(result, files);
  result = applyAssociatedOptionsAndResolveConflicts(result);
  result = applyGruntTSDefaults(result);

  if (result.targetName === undefined ||
      (!result.targetName && targetName)) {
    result.targetName = targetName;
  }

  return result;
}

function emptyOptionsResolveResult() {
  return <IGruntTSOptions><any>{
    warnings: [],
    errors: []
  };
}


function resolveAndWarnOnCapitalizationErrors(task: grunt.task.IMultiTask<ITargetOptions>,
  target: grunt.task.IMultiTask<ITargetOptions>, targetName: string) {

    let errors : string[] = [], warnings: string[] = [];
    const lowercaseTargetProps = _.map(propertiesFromTarget, (prop) => prop.toLocaleLowerCase());
    const lowercaseTargetOptionsProps = _.map(propertiesFromTargetOptions, (prop) => prop.toLocaleLowerCase());

    checkFixableCaseIssues(task, 'ts task');
    checkFixableCaseIssues(target, `target "${targetName}"`);
    checkLocations(task, 'ts task');
    checkLocations(target, `target "${targetName}"`);

    return {errors, warnings};

    function checkLocations(task: grunt.task.IMultiTask<ITargetOptions>, configName: string) {
      if (task) {
        for (let propertyName in task) {
          if (propertiesFromTarget.indexOf(propertyName) === -1 && propertyName !== 'options') {
            if (propertiesFromTargetOptions.indexOf(propertyName) > -1) {
              let warningText = `Property "${propertyName}" in ${configName} is possibly in the wrong place and will be ignored.  ` +
                `It is expected on the options object.`;
              warnings.push(warningText);
            } else if (lowercaseTargetProps.indexOf(propertyName.toLocaleLowerCase()) === -1
              && lowercaseTargetOptionsProps.indexOf(propertyName.toLocaleLowerCase()) > -1) {
              let index = lowercaseTargetOptionsProps.indexOf(propertyName.toLocaleLowerCase());
              let correctPropertyName = propertiesFromTargetOptions[index];

              let warningText = `Property "${propertyName}" in ${configName} is possibly in the wrong place and will be ignored.  ` +
                `It is expected on the options object.  It is also the wrong case and should be ${correctPropertyName}.`;
              warnings.push(warningText);
            }
          }
        }
      }
    }

    function checkFixableCaseIssues(task: grunt.task.IMultiTask<ITargetOptions>, configName: string) {
      if (task) {
        for (let propertyName in task) {
          if ((propertiesFromTarget.indexOf(propertyName) === -1)
            && (lowercaseTargetProps.indexOf(propertyName.toLocaleLowerCase()) > -1)
            && (propertiesFromTargetOptions.indexOf(propertyName) === -1)) {
            let index = lowercaseTargetProps.indexOf(propertyName.toLocaleLowerCase());
            let correctPropertyName = propertiesFromTarget[index];

            let warningText = `Property "${propertyName}" in ${configName} is incorrectly cased; it should ` +
              `be "${correctPropertyName}".  Fixing it for you and proceeding.`;

            warnings.push(warningText);
            task[correctPropertyName] = task[propertyName];
            delete task[propertyName];
          }
        }

        for (let propertyName in task.options) {
          if ((propertiesFromTargetOptions.indexOf(propertyName) === -1)
            && (lowercaseTargetOptionsProps.indexOf(propertyName.toLocaleLowerCase()) > -1)
            && (propertiesFromTarget.indexOf(propertyName) === -1)) {
            let index = lowercaseTargetOptionsProps.indexOf(propertyName.toLocaleLowerCase());
            let correctPropertyName = propertiesFromTargetOptions[index];

            let warningText = `Property "${propertyName}" in ${configName} options is incorrectly cased; it should ` +
              `be "${correctPropertyName}".  Fixing it for you and proceeding.`;

            warnings.push(warningText);
            task.options[correctPropertyName] = task.options[propertyName];
            delete task.options[propertyName];
          }
        }

      }
    }
}



function applyGruntOptions(applyTo: IGruntTSOptions, gruntOptions: grunt.task.IMultiTask<ITargetOptions>) {

  const result = applyTo;

  if (gruntOptions) {
    for (const propertyName of propertiesFromTarget) {
      if (propertyName in gruntOptions) {
        result[propertyName] = gruntOptions[propertyName];
      }
    }
    if (gruntOptions.options) {
      for (const propertyName of propertiesFromTargetOptions) {
        if (propertyName in gruntOptions.options) {
          result[propertyName] = gruntOptions.options[propertyName];
        }
      }
    }
  }

  return result;
}

function copyCompilationTasks(options: IGruntTSOptions, files: IGruntTSCompilationInfo[]) {

  if (options.CompilationTasks === null || options.CompilationTasks === undefined) {
    options.CompilationTasks = [];
  }
  for (let i = 0; i < files.length; i += 1) {
    let compilationSet = {
      src: _.map(files[i].src, (fileName) => escapePathIfRequired(fileName)),
      out: escapePathIfRequired(files[i].out),
      outDir: escapePathIfRequired(files[i].outDir)
    };
    if ('dest' in files[i]) {
      if (utils.isJavaScriptFile(files[i].dest)) {
        compilationSet.out = files[i].dest;
      } else {
        compilationSet.outDir = files[i].dest;
      }
    }
    options.CompilationTasks.push(compilationSet);
  }
  return options;
}

function applyAssociatedOptionsAndResolveConflicts(options: IGruntTSOptions) {

  if (options.emitDecoratorMetadata) {
    options.experimentalDecorators = true;
  }

  if (options.inlineSourceMap && options.sourceMap) {
    options.warnings.push('TypeScript cannot use inlineSourceMap and sourceMap together.  Ignoring sourceMap.');
    options.sourceMap = false;
  }

  if (options.inlineSources && options.sourceMap) {
    options.errors.push('It is not permitted to use inlineSources and sourceMap together.  Use one or the other.');
  }

  if (options.inlineSources && !options.sourceMap) {
    options.inlineSources = true;
    options.inlineSourceMap = true;
    options.sourceMap = false;
  }

  return options;
}

function applyGruntTSDefaults(options: IGruntTSOptions) {

  if (!('sourceMap' in options) && !('inlineSourceMap' in options)) {
    options.sourceMap = GruntTSDefaults.sourceMap;
  }

  if (!('target' in options)) {
    options.target = GruntTSDefaults.target;
  }

  if (!('fast' in options)) {
    options.fast = GruntTSDefaults.fast;
  }

  if (!('compile' in options)) {
    options.compile = GruntTSDefaults.compile;
  }

  if (!('htmlOutDir' in options)) {
    options.htmlOutDir = null;
  }

  if (!('htmlOutDirFlatten' in options)) {
    options.htmlOutDirFlatten = GruntTSDefaults.htmlOutDirFlatten;
  }

  if (!('htmlModuleTemplate' in options)) {
    options.htmlModuleTemplate = GruntTSDefaults.htmlModuleTemplate;
  }

  if (!('htmlVarTemplate' in options)) {
    options.htmlVarTemplate = GruntTSDefaults.htmlVarTemplate;
  }

  if (!('removeComments' in options) && !('comments' in options)) {
    options.removeComments = GruntTSDefaults.removeComments;
  }


  return options;
}

export function escapePathIfRequired(path: string): string {
  if (!path || !path.indexOf) {
    return path;
  }
  if (path.indexOf(' ') === -1) {
      return path;
  } else {
    const newPath = path.trim();
    if (newPath.indexOf('"') === 0 && newPath.lastIndexOf('"') === newPath.length - 1) {
      return newPath;
    } else {
      return '"' + newPath + '"';
    }
  }
}
