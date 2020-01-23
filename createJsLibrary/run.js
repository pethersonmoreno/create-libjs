const os = require('os');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs-extra');
const spawn = require('cross-spawn');
const getPackageInfo = require('./getPackageInfo');
const getTemplateInstallPackage = require('./getTemplateInstallPackage');

const install = (dependencies, verbose, isDev = false) => {
  return new Promise((resolve, reject) => {
    let command;
    let args;
    command = 'npm';
    args = [
      'install',
      isDev ? '--save-dev' : '--save',
      '--save-exact',
      '--loglevel',
      'error',
    ].concat(dependencies);

    if (verbose) {
      args.push('--verbose');
    }

    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('close', code => {
      if (code !== 0) {
        reject({
          command: `${command} ${args.join(' ')}`,
        });
        return;
      }
      resolve();
    });
  });
};

const getTemplateData = installPackage => {
  const data = require(installPackage);
  return data;
};

const run = async (root, appName, verbose, originalDirectory, template) => {
  const templateToInstall = await getTemplateInstallPackage(
    template,
    originalDirectory,
  );
  const allDependencies = [];
  const allDevDependencies = ['jest'];

  console.log('Installing packages. This might take a couple of minutes.');

  console.log(`Getting template`);
  console.log();
  const templateInfo = await getPackageInfo(templateToInstall);
  const tmpPackageTemplatePath = path.resolve(root, 'tmp-template');
  fs.ensureDirSync(tmpPackageTemplatePath);
  process.chdir(tmpPackageTemplatePath);
  try {
    const tempPackageJson = path.resolve(
      tmpPackageTemplatePath,
      'package.json',
    );
    fs.copySync(path.resolve(root, 'package.json'), tempPackageJson);
    await install(
      [
        `${templateInfo.name}${
          templateInfo.version ? '@' + templateInfo.version : ''
        }`,
      ],
      verbose,
      false, //Production
    );
    fs.removeSync(tempPackageJson);
    process.chdir(root);
  } catch (error) {
    console.error('Fail to get template package: ', error);
    process.chdir(root);
    process.exit(1);
  }
  const localTemplatePath = path.resolve(
    tmpPackageTemplatePath,
    'node_modules',
    templateInfo.name,
  );
  const templateData = await getTemplateData(localTemplatePath);
  try {
    if (templateData.package && templateData.package.dependencies) {
      const templateDependencies = Object.keys(
        templateData.package.dependencies,
      ).map(key => `${key}@${templateData.package.dependencies[key]}`);
      allDependencies.push(...templateDependencies);
    }
    if (templateData.package && templateData.package.devDependencies) {
      const templateDevDependencies = Object.keys(
        templateData.package.devDependencies,
      ).map(key => `${key}@${templateData.package.devDependencies[key]}`);
      allDevDependencies.push(...templateDevDependencies);
    }
    if ((template || '').includes('typescript')) {
      allDevDependencies.push('@types/node', '@types/jest', 'typescript');
    }

    console.log(`Installing dependencies`);
    console.log();

    await install(
      allDependencies,
      verbose,
      false, //Production
    );
    await install(
      allDevDependencies,
      verbose,
      true, //Development
    );

    if (templateData.package && templateData.package.scripts) {
      const currentPackageJson = JSON.parse(
        fs.readFileSync(path.join(root, 'package.json')),
      );
      const {
        dependencies,
        devDependencies,
        ...otherConfigs
      } = currentPackageJson;
      const newPackageJson = {
        ...otherConfigs,
        scripts: templateData.package.scripts,
        dependencies,
        devDependencies,
      };
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify(newPackageJson, null, 2) + os.EOL,
      );
    }

    console.log(`Creating files from template`);
    console.log();
    const templateDir = path.join(localTemplatePath, 'template');
    if (fs.existsSync(templateDir)) {
      fs.copySync(templateDir, root);
    }
    fs.removeSync(tmpPackageTemplatePath);
  } catch (reason) {
    console.log();
    console.log('Aborting installation.');
    if (reason.command) {
      console.log(`  ${chalk.cyan(reason.command)} has failed.`);
    } else {
      console.log(chalk.red('Unexpected error. Please report it as a bug:'));
      console.log(reason);
    }
    console.log();

    // On 'exit' we will delete these files from target directory.
    const knownGeneratedFiles = ['package.json', 'node_modules'];
    const currentFiles = fs.readdirSync(path.join(root));
    currentFiles.forEach(file => {
      knownGeneratedFiles.forEach(fileToMatch => {
        // This removes all knownGeneratedFiles.
        if (file === fileToMatch) {
          console.log(`Deleting generated file... ${chalk.cyan(file)}`);
          fs.removeSync(path.join(root, file));
        }
      });
    });
    const remainingFiles = fs.readdirSync(path.join(root));
    if (!remainingFiles.length) {
      // Delete target folder if empty
      console.log(
        `Deleting ${chalk.cyan(`${appName}/`)} from ${chalk.cyan(
          path.resolve(root, '..'),
        )}`,
      );
      process.chdir(path.resolve(root, '..'));
      fs.removeSync(path.join(root));
    }
    console.log('Done.');
    process.exit(1);
  }
};

module.exports = run;
