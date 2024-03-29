import axios from 'axios';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';
import fs from 'fs';
import path from 'path';

// acciotest.json
/*
{
  'testRepo': 'string',
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
  try {
    if (!githubRepo) throw new Error('No GITHUB_REPOSITORY');

    const [repoOwner, repoName] = githubRepo.split('/');
    token = process.env['ACCIO_ASGMNT_ACTION_TOKEN'];

    if (!token) throw new Error('No token given!');
    if (!repoWorkSpace) throw new Error('No GITHUB_WORKSPACE');
    if (repoOwner !== 'acciojob') throw new Error('Error not under acciojob');
    if (!repoName) throw new Error('Failed to parse repoName');

    const contextPayload = github.context.payload;
    process.stderr.write(
      `\ngithubRepo: ${githubRepo}\nrepoOwner: ${repoOwner}\nrepoName: ${repoName}`
    );
    process.stderr.write(
      `\ncontextPayload: ${contextPayload}\ncontextPayload.pusher.name: ${contextPayload.pusher.name}\ncontextPayload.pusher.username: ${contextPayload.pusher.username}`
    );

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

    process.stderr.write(`\nassignmentName: ${assignmentName}`);
    process.stderr.write(`\nstudentUserName: ${studentUserName}`);

    if (assignmentName && studentUserName) {
      const accioTestConfigData = fs.readFileSync(
        path.resolve(repoWorkSpace, 'acciotest.json')
      );

      const accioTestConfig = JSON.parse(accioTestConfigData.toString());

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

      process.stdout.write(`npm install`);

      const npmTest = await exec.exec('npm test', undefined, {
        cwd: repoWorkSpace
      });

      process.stdout.write(`npm test`);

      const jestReports = fs.readFileSync(
        path.resolve(repoWorkSpace, 'output.txt')
      );
      let jestString = jestReports.toString();
      const jestArr = jestString.split('\n');
      for (const line of jestArr) {
        if (line.includes('Tests:')) {
          jestString = line;
        }
      }

      const passedMatches = jestString.match(/(\d+) passed/);
      const totalMatches = jestString.match(/(\d+) total/);

      const totalTests = totalMatches ? parseInt(totalMatches[1]) : 1;
      const totalPassed = passedMatches ? parseInt(passedMatches[1]) : 0;

      process.stdout.write(
        `\nTotal Test Cases: ${totalTests}\nPassed Test Cases: ${totalPassed}`
      );
      process.stdout.write(`\nEvaluating score...\n`);

      const testResults = {
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
      const jestArr = jestString.split('\n');
      for (const line of jestArr) {
        if (line.includes('Tests:')) {
          jestString = line;
        }
      }

      const passedMatches = jestString.match(/(\d+) passed/);
      const failedMatches = jestString.match(/(\d+) failed/);
      const totalMatches = jestString.match(/(\d+) total/);

      process.stdout.write(`\npassedMatches: ${passedMatches}`);
      process.stdout.write(`\nfailedMatches: ${failedMatches}`);
      process.stdout.write(`\ntotalMatches: ${totalMatches}`);

      const totalTests = totalMatches ? parseInt(totalMatches[1]) : 1;
      const totalPassed = passedMatches ? parseInt(passedMatches[1]) : 0;
      const totalFailed = failedMatches ? parseInt(failedMatches[1]) : 0;

      process.stdout.write(
        `\nTotal Test Cases: ${totalTests}\nPassed Test Cases: ${totalPassed}\nFailed Test Cases: ${totalFailed}`
      );
      process.stdout.write(`\nEvaluating score...\n`);

      const testResults = {
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
