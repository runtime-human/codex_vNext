import { runDoctorFromEnvironment } from '../dist/doctor/index.js';

const report = runDoctorFromEnvironment();
if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report)}\n`);
} else {
  for (const item of report.checks) {
    process.stdout.write(
      `${item.status.toUpperCase()} ${item.name}: ${item.message}\n`,
    );
  }
}
process.exitCode = report.status === 'fail' ? 1 : 0;
