import axios from 'axios';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import fs from 'fs';
import path from 'path';

// acciotest.json
/*
{
  'testRepo': string',
  'pathToFile': 'string'
}
*/

async function run(): Promise<void> {
  const ACCIO_API_ENDPOINT = process.env['ACCIOJOB_BACKEND_URL'];
  const githubRepo = process.env['GITHUB_REPOSITORY'];
  const repoWorkSpace: string | undefined = process.env['GITHUB_WORKSPACE'];
  let studentUserName = '';
  let assignmentName = '';
  let token;
  process.stdout.write(`process.env: ${process.env})`);
  try {
    process.stderr.write(`\n1111`);
    if (!githubRepo) throw new Error('No GITHUB_REPOSITORY');

    const [repoOwner, repoName] = githubRepo.split('/');
    token = process.env['ACCIO_ASGMNT_ACTION_TOKEN'];

    if (!token) throw new Error('No token given!');
    if (!repoWorkSpace) throw new Error('No GITHUB_WORKSPACE');
    if (repoOwner !== 'acciojob') throw new Error('Error not under acciojob');
    if (!repoName) throw new Error('Failed to parse repoName');

    const contextPayload = github.context.payload;
    process.stderr.write(`\n${githubRepo}`);
    process.stderr.write(`\n${repoOwner}`);
    process.stderr.write(`\n${repoName}`);
    process.stderr.write(`\n${contextPayload}`);
    process.stderr.write(`\n${contextPayload.pusher.name}`);
    process.stderr.write(`\n${contextPayload.pusher.username}`);

    if (contextPayload.pusher.username) {
      if (repoName.includes(contextPayload.pusher.username)) {
        const indexOfStudentName = repoName.indexOf(
          contextPayload.pusher.username
        );
        studentUserName = repoName.substring(indexOfStudentName);
        assignmentName = repoName.substring(0, indexOfStudentName - 1);
      }
    } else if (repoName.includes(contextPayload.pusher.name)) {
      const indexOfStudentName = repoName.indexOf(contextPayload.pusher.name);
      studentUserName = repoName.substring(indexOfStudentName);
      assignmentName = repoName.substring(0, indexOfStudentName - 1);
    }

    process.stdout.write(
      `repoWorkSpace = ${repoWorkSpace}\nrepoName = ${repoName}\nstudentName = ${studentUserName}\nassignmentName = ${assignmentName}\n`
    );

    process.stdout.write(
      `Pusher Username = ${contextPayload.pusher.username}\nPusher Name = ${contextPayload.pusher.name}`
    );

    process.stderr.write(`\n2222`);
    process.stderr.write(`\n${assignmentName}`);
    process.stderr.write(`\n${studentUserName}`);

    // if (assignmentName && studentUserName) {
    if (true) {
      const accioTestConfigData = fs.readFileSync(
        path.resolve(repoWorkSpace, 'acciotest.json')
      );

      const accioTestConfig = JSON.parse(accioTestConfigData.toString());
      process.stdout.write(`Test Config: ${accioTestConfigData.toString()}`);

      const query = new URLSearchParams();
      query.append('repo', accioTestConfig.testRepo);
      query.append('filePath', accioTestConfig.pathToFile);
      query.append('token', token);

      // Get the encoded test file contents
      const encodedTestFileData = await axios.get(
        `${ACCIO_API_ENDPOINT}/github/action-get-file?${query.toString()}`
      );

      const testFileContent = Buffer.from(
        encodedTestFileData.data,
        'base64'
      ).toString('utf8');

      process.stdout.write(`testFileContent: ${testFileContent.toString()}`);

      fs.mkdirSync(path.resolve(repoWorkSpace, 'tests'), {
        recursive: true
      });

      fs.writeFileSync(
        path.resolve(repoWorkSpace, 'tests/main.test.js'),
        testFileContent
      );

      const npmInstall = await exec.exec('npm install', undefined, {
        cwd: repoWorkSpace
      });

      const startServer = await exec.exec('npm start', undefined, {
        cwd: repoWorkSpace
      });

      const npmTest = await exec.exec('npm test', undefined, {
        cwd: repoWorkSpace
      });

      const jestReports = fs.readFileSync(
        path.resolve(repoWorkSpace, 'output.txt')
      );
      let jestString = jestReports.toString();
      let jestArr = jestString.split('\n');
      jestArr.forEach(line => {
        if (line.includes('Tests:')) {
          jestString = line;
        }
      });
      process.stdout.write(`\n jestString: ${jestString}`);
      let testResult = jestString.replace(/[^0-9.]/g, ' ').split(' ');
      testResult = testResult.filter(element => !['.', ''].includes(element));

      process.stdout.write(`\nTotal Test Cases: ${parseInt(testResult[1])}`);
      process.stdout.write(`\nPassed Test Cases: ${parseInt(testResult[0])}`);

      process.stdout.write(`\nEvaluating score...\n`);

      const totalTests = parseInt(testResult[1]);
      const totalPassed = parseInt(testResult[0]);

      let testResults = {
        totalTests,
        totalPassed
      };

      const {data: score} = await axios.post(
        `${ACCIO_API_ENDPOINT}/github/get-score`,
        {
          token,
          testResults,
          assignmentName,
          repoName,
          studentGithubUserName: studentUserName
        }
      );

      process.exit(0);
    }
  } catch (error) {
    if (repoWorkSpace && githubRepo) {
      const [repoOwner, repoName] = githubRepo.split('/');

      const jestReports = fs.readFileSync(
        path.resolve(repoWorkSpace, 'output.txt')
      );
      let jestString = jestReports.toString();
      let jestArr = jestString.split('\n');
      jestArr.forEach(line => {
        if (line.includes('Tests:')) {
          jestString = line;
        }
      });
      process.stdout.write(`\n jestString: ${jestString}`);
      let testResult = jestString.replace(/[^0-9.]/g, ' ').split(' ');
      testResult = testResult.filter(element => !['.', ''].includes(element));

      process.stdout.write(`\nTotal Test Cases: ${parseInt(testResult[2])}`);
      process.stdout.write(`\nPassed Test Cases: ${parseInt(testResult[1])}`);
      process.stdout.write(`\nFailed Test Cases: ${parseInt(testResult[0])}`);

      process.stdout.write(`\nEvaluating score...\n`);

      const totalTests = parseInt(testResult[2]);
      const totalPassed = parseInt(testResult[1]);

      let testResults = {
        totalTests,
        totalPassed
      };

      const {data: score} = await axios.post(
        `${ACCIO_API_ENDPOINT}/github/get-score`,
        {
          token,
          testResults,
          assignmentName,
          repoName,
          studentGithubUserName: studentUserName
        }
      );
    }
    process.stderr.write(`Caught Error`);

    if (error instanceof Error) core.setFailed(error.message);
    process.stderr.write(`\nError: ${(error as Error).message}`);
    process.exit(1);
  }
}

run();
