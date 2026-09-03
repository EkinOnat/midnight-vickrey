import { spawnSync } from 'node:child_process';

const compactArgs = [
  'compile',
  'contracts/vickrey.compact',
  'managed/vickrey',
];

const result =
  process.platform === 'win32'
    ? spawnSync(
        'wsl.exe',
        [
          '--cd',
          process.cwd(),
          '-e',
          'bash',
          '-lic',
          'compact compile contracts/vickrey.compact managed/vickrey',
        ],
        { stdio: 'inherit' },
      )
    : spawnSync('compact', compactArgs, { stdio: 'inherit' });

if (result.error) {
  console.error(`Unable to start the Midnight Compact compiler: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
