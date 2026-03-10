#!/usr/bin/env node
"use strict";
/**
 * @fileoverview CrossRepo CLI
 * @module crossrepo/cli
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const inquirer_1 = __importDefault(require("inquirer"));
const GitManager_1 = require("../core/GitManager");
const ConfigManager_1 = require("../core/ConfigManager");
const SyncManager_1 = require("../core/SyncManager");
const fs_1 = require("fs");
const path_1 = require("path");
const packageJson = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(__dirname, '../../package.json'), 'utf-8'));
const program = new commander_1.Command();
program
    .name('crossrepo')
    .description('Cross-repository change management with AI-powered conflict resolution')
    .version(packageJson.version);
// --- Init Command ---
program
    .command('init [feature]')
    .description('Initialize a new crossrepo project')
    .option('-p, --path <path>', 'Project path', '.')
    .action(async (feature = 'main', options) => {
    const spinner = (0, ora_1.default)('Initializing...').start();
    try {
        const configManager = new ConfigManager_1.ConfigManager(options.path);
        if (configManager.exists()) {
            spinner.warn('Already initialized');
            return;
        }
        configManager.init(feature);
        spinner.succeed('CrossRepo initialized');
        console.log('\nNext steps:');
        console.log('  1. crossrepo track <repo> --commits <hashes>');
        console.log('  2. crossrepo target <repo> --branches <branches>');
        console.log('  3. crossrepo ai --provider openai');
        console.log('  4. crossrepo sync --auto-resolve');
    }
    catch (error) {
        spinner.fail('Failed');
        console.error(chalk_1.default.red(error));
        process.exit(1);
    }
});
// --- Track Command ---
program
    .command('track <repo>')
    .description('Track a repository and its commits')
    .option('-p, --path <path>', 'Project path', '.')
    .option('-c, --commits <commits>', 'Commit hashes (comma-separated)')
    .action(async (repo, options) => {
    const spinner = (0, ora_1.default)(`Tracking ${repo}...`).start();
    try {
        const configManager = new ConfigManager_1.ConfigManager(options.path);
        const config = configManager.load();
        if (!config) {
            spinner.fail('Run `crossrepo init` first');
            process.exit(1);
        }
        const commits = options.commits?.split(',').map((c) => c.trim()) || [];
        if (!GitManager_1.GitManager.isRepo(repo)) {
            spinner.fail(`Not a git repo: ${repo}`);
            process.exit(1);
        }
        configManager.addRepo(config, repo, repo, commits);
        spinner.succeed(`Tracked ${repo}: ${commits.length} commits`);
    }
    catch (error) {
        spinner.fail('Failed');
        console.error(chalk_1.default.red(error));
        process.exit(1);
    }
});
// --- Target Command ---
program
    .command('target <repo>')
    .description('Set target branches for a repository')
    .option('-p, --path <path>', 'Project path', '.')
    .option('-b, --branches <branches>', 'Branches (comma-separated)')
    .action(async (repo, options) => {
    const spinner = (0, ora_1.default)('Setting targets...').start();
    try {
        const configManager = new ConfigManager_1.ConfigManager(options.path);
        const config = configManager.load();
        if (!config || !config.repos[repo]) {
            spinner.fail(`Run \`crossrepo track ${repo}\` first`);
            process.exit(1);
        }
        const branches = options.branches?.split(',').map((b) => b.trim()) || [];
        configManager.setTargetBranches(config, repo, branches);
        spinner.succeed(`Targets: ${branches.join(', ')}`);
    }
    catch (error) {
        spinner.fail('Failed');
        console.error(chalk_1.default.red(error));
        process.exit(1);
    }
});
// --- AI Command ---
program
    .command('ai')
    .description('Configure AI for conflict resolution')
    .option('-p, --path <path>', 'Project path', '.')
    .option('--provider <provider>', 'Provider (openai/anthropic/custom)')
    .option('--base-url <url>', 'API base URL')
    .option('--model <model>', 'Model ID')
    .option('--api-key <key>', 'API key')
    .option('--test', 'Test connection')
    .action(async (options) => {
    const spinner = (0, ora_1.default)('Configuring AI...').start();
    try {
        const configManager = new ConfigManager_1.ConfigManager(options.path);
        const config = configManager.load();
        if (!config) {
            spinner.fail('Run `crossrepo init` first');
            process.exit(1);
        }
        if (!options.provider) {
            spinner.stop();
            const answers = await inquirer_1.default.prompt([
                { type: 'list', name: 'provider', message: 'Provider:', choices: ['openai', 'anthropic', 'custom'] },
                { type: 'input', name: 'baseUrl', message: 'Base URL:', default: 'https://api.openai.com/v1' },
                { type: 'input', name: 'model', message: 'Model:', default: 'gpt-4' },
                { type: 'input', name: 'apiKey', message: 'API Key (or ${ENV_VAR}):' },
            ]);
            Object.assign(options, answers);
            spinner.start();
        }
        const aiConfig = {
            provider: options.provider,
            baseUrl: options.baseUrl,
            model: options.model,
            apiKey: options.apiKey,
        };
        configManager.setAI(config, aiConfig);
        spinner.succeed('AI configured');
        if (options.test) {
            const syncManager = new SyncManager_1.SyncManager(config, configManager);
            const ok = await syncManager.testAI();
            console.log(ok ? chalk_1.default.green('Connection OK') : chalk_1.default.red('Connection failed'));
        }
    }
    catch (error) {
        spinner.fail('Failed');
        console.error(chalk_1.default.red(error));
        process.exit(1);
    }
});
// --- Sync Command ---
program
    .command('sync')
    .description('Sync commits across repos and branches')
    .option('-p, --path <path>', 'Project path', '.')
    .option('--auto-resolve', 'Auto-resolve conflicts with AI', false)
    .option('--dry-run', 'Preview only', false)
    .option('--continue-on-error', 'Continue on error', false)
    .option('--create-branch', 'Create branches if needed', false)
    .option('--push', 'Push after sync', false)
    .action(async (options) => {
    const configManager = new ConfigManager_1.ConfigManager(options.path);
    const config = configManager.load();
    if (!config) {
        console.error(chalk_1.default.red('Run `crossrepo init` first'));
        process.exit(1);
    }
    const validation = configManager.validate(config);
    if (!validation.valid) {
        validation.errors.forEach((e) => console.error(chalk_1.default.red(e)));
        process.exit(1);
    }
    if (options.autoResolve && !config.ai) {
        console.error(chalk_1.default.red('Run `crossrepo ai` first'));
        process.exit(1);
    }
    const syncManager = new SyncManager_1.SyncManager(config, configManager);
    const preview = await syncManager.preview();
    console.log(chalk_1.default.bold('\nPreview:'));
    for (const r of preview.repos) {
        console.log(`  ${r.name}: ${r.commits.length} commits × ${r.branches.length} branches = ${r.total} ops`);
    }
    console.log(chalk_1.default.dim('  Total: ') + preview.total + ' operations\n');
    if (options.dryRun)
        return;
    const { proceed } = await inquirer_1.default.prompt([
        { type: 'confirm', name: 'proceed', message: 'Proceed?', default: true },
    ]);
    if (!proceed)
        return;
    const spinner = (0, ora_1.default)('Syncing...').start();
    syncManager.onProgress((p, s) => {
        spinner.text = `${s.repo}/${s.branch} (${p.completed}/${p.total})`;
    });
    const syncOptions = {
        autoResolve: options.autoResolve,
        dryRun: options.dryRun,
        continueOnError: options.continueOnError,
        createBranch: options.createBranch,
        push: options.push,
    };
    const results = await syncManager.sync(syncOptions);
    spinner.stop();
    const success = results.filter((r) => r.status === 'success').length;
    const conflicts = results.filter((r) => r.status === 'conflict').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    console.log(chalk_1.default.bold('\nResults:'));
    console.log(chalk_1.default.green(`  ✅ Success: ${success}`));
    if (conflicts)
        console.log(chalk_1.default.yellow(`  ⚠️ Conflicts: ${conflicts}`));
    if (failed)
        console.log(chalk_1.default.red(`  ❌ Failed: ${failed}`));
});
// --- Status Command ---
program
    .command('status')
    .description('Show status of all repos')
    .option('-p, --path <path>', 'Project path', '.')
    .action(async (options) => {
    const configManager = new ConfigManager_1.ConfigManager(options.path);
    const config = configManager.load();
    if (!config) {
        console.error(chalk_1.default.red('Run `crossrepo init` first'));
        process.exit(1);
    }
    const syncManager = new SyncManager_1.SyncManager(config, configManager);
    const status = await syncManager.status();
    console.log(chalk_1.default.bold('\nStatus:'));
    for (const s of status) {
        const changes = s.hasChanges ? chalk_1.default.yellow(' (changes)') : '';
        const conflicts = s.conflicts.length ? chalk_1.default.red(` (${s.conflicts.length} conflicts)`) : '';
        console.log(`  ${s.repo}: ${s.branch}${changes}${conflicts}`);
    }
});
// --- List Command ---
program
    .command('list')
    .description('List tracked repos')
    .option('-p, --path <path>', 'Project path', '.')
    .action(async (options) => {
    const configManager = new ConfigManager_1.ConfigManager(options.path);
    const config = configManager.load();
    if (!config) {
        console.error(chalk_1.default.red('Run `crossrepo init` first'));
        process.exit(1);
    }
    console.log(chalk_1.default.bold('\nTracked Repos:'));
    for (const [name, repo] of Object.entries(config.repos)) {
        console.log(`  ${name}:`);
        console.log(`    Commits: ${repo.commits.join(', ') || '(none)'}`);
        console.log(`    Targets: ${repo.targetBranches.join(', ') || '(none)'}`);
    }
    if (config.ai) {
        console.log(chalk_1.default.bold('\nAI:'));
        console.log(`  Provider: ${config.ai.provider}`);
        console.log(`  Model: ${config.ai.model}`);
    }
});
program.parse();
//# sourceMappingURL=index.js.map