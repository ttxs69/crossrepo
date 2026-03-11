#!/usr/bin/env node
/**
 * @fileoverview CrossRepo CLI
 * @module crossrepo/cli
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { GitManager } from '../core/GitManager';
import { ConfigManager } from '../core/ConfigManager';
import { SyncManager } from '../core/SyncManager';
import { AIConfig, SyncOptions } from '../types';
import { readFileSync } from 'fs';
import { join } from 'path';

const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8')
);

const program = new Command();

program
  .name('crossrepo')
  .description('Cross-repository change management with AI-powered conflict resolution')
  .version(packageJson.version);

// --- Init Command ---
program
  .command('init [feature]')
  .description('Initialize a new crossrepo project')
  .option('-p, --path <path>', 'Project path', '.')
  .action(async (feature: string = 'main', options: { path: string }) => {
    const spinner = ora('Initializing...').start();
    
    try {
      const configManager = new ConfigManager(options.path);
      
      if (configManager.exists()) {
        spinner.warn('Already initialized');
        return;
      }
      
      configManager.init(feature);
      spinner.succeed('CrossRepo initialized');
      
      console.log('\nNext steps:');
      console.log('  1. crossrepo track <repo> --from-branch <feature> --base main');
      console.log('     or: crossrepo track <repo> -c <commit1,commit2>');
      console.log('  2. crossrepo target <repo> -b main,develop');
      console.log('  3. crossrepo ai --provider openai  (optional)');
      console.log('  4. crossrepo feature save <name>   (optional)');
      console.log('  5. crossrepo sync --auto-resolve --push');
      
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// --- Track Command ---
program
  .command('track <repo>')
  .description('Track a repository and its commits')
  .option('-p, --path <path>', 'Project path', '.')
  .option('-c, --commits <commits>', 'Commit hashes (comma-separated)')
  .option('--from-branch <branch>', 'Get commits from this feature branch')
  .option('--base <branch>', 'Base branch to compare against (default: main)', 'main')
  .action(async (repo: string, options: { path: string; commits: string; fromBranch: string; base: string }) => {
    const spinner = ora(`Tracking ${repo}...`).start();
    
    try {
      const configManager = new ConfigManager(options.path);
      const config = configManager.load();
      
      if (!config) {
        spinner.fail('Run `crossrepo init` first');
        process.exit(1);
      }
      
      if (!GitManager.isRepo(repo)) {
        spinner.fail(`Not a git repo: ${repo}`);
        process.exit(1);
      }
      
      let commits: string[] = [];
      
      // Get commits from branch range if specified
      if (options.fromBranch) {
        const gitManager = new GitManager(repo);
        commits = await gitManager.getCommitsBetween(options.fromBranch, options.base);
        
        if (commits.length === 0) {
          spinner.warn(`No commits found between ${options.base}..${options.fromBranch}`);
          return;
        }
        
        // Show commits being tracked
        spinner.text = `Found ${commits.length} commits in ${options.fromBranch}`;
      } else if (options.commits) {
        commits = options.commits.split(',').map((c) => c.trim());
      }
      
      configManager.addRepo(config, repo, repo, commits);
      spinner.succeed(`Tracked ${repo}: ${commits.length} commits`);
      
      // Show commit list
      if (commits.length > 0) {
        const gitManager = new GitManager(repo);
        const commitList = await gitManager.getCommitList(commits);
        console.log(chalk.dim('\nCommits:'));
        for (const c of commitList) {
          console.log(chalk.dim(`  ${c.hash.slice(0, 7)} ${c.message.split('\n')[0]}`));
        }
        console.log();
      }
      
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// --- Target Command ---
program
  .command('target <repo>')
  .description('Set target branches for a repository')
  .option('-p, --path <path>', 'Project path', '.')
  .option('-b, --branches <branches>', 'Branches (comma-separated)')
  .action(async (repo: string, options: { path: string; branches: string }) => {
    const spinner = ora('Setting targets...').start();
    
    try {
      const configManager = new ConfigManager(options.path);
      const config = configManager.load();
      
      if (!config || !config.repos[repo]) {
        spinner.fail(`Run \`crossrepo track ${repo}\` first`);
        process.exit(1);
      }
      
      const branches = options.branches?.split(',').map((b) => b.trim()) || [];
      configManager.setTargetBranches(config, repo, branches);
      
      spinner.succeed(`Targets: ${branches.join(', ')}`);
      
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(error));
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
  .action(async (options: any) => {
    const spinner = ora('Configuring AI...').start();
    
    try {
      const configManager = new ConfigManager(options.path);
      const config = configManager.load();
      
      if (!config) {
        spinner.fail('Run `crossrepo init` first');
        process.exit(1);
      }
      
      if (!options.provider) {
        spinner.stop();
        const answers = await inquirer.prompt([
          { type: 'list', name: 'provider', message: 'Provider:', choices: ['openai', 'anthropic', 'custom'] },
          { type: 'input', name: 'baseUrl', message: 'Base URL:', default: 'https://api.openai.com/v1' },
          { type: 'input', name: 'model', message: 'Model:', default: 'gpt-4' },
          { type: 'input', name: 'apiKey', message: 'API Key (or ${ENV_VAR}):' },
        ]);
        Object.assign(options, answers);
        spinner.start();
      }
      
      const aiConfig: AIConfig = {
        provider: options.provider,
        baseUrl: options.baseUrl,
        model: options.model,
        apiKey: options.apiKey,
      };
      
      configManager.setAI(config, aiConfig);
      spinner.succeed('AI configured');
      
      if (options.test) {
        const syncManager = new SyncManager(config, configManager);
        const ok = await syncManager.testAI();
        console.log(ok ? chalk.green('Connection OK') : chalk.red('Connection failed'));
      }
      
    } catch (error) {
      spinner.fail('Failed');
      console.error(chalk.red(error));
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
  .action(async (options: any) => {
    const configManager = new ConfigManager(options.path);
    const config = configManager.load();
    
    if (!config) {
      console.error(chalk.red('Run `crossrepo init` first'));
      process.exit(1);
    }
    
    const validation = configManager.validate(config);
    if (!validation.valid) {
      validation.errors.forEach((e) => console.error(chalk.red(e)));
      process.exit(1);
    }
    
    if (options.autoResolve && !config.ai) {
      console.error(chalk.red('Run `crossrepo ai` first'));
      process.exit(1);
    }
    
    const syncManager = new SyncManager(config, configManager);
    const preview = await syncManager.preview();
    
    console.log(chalk.bold('\nPreview:'));
    for (const r of preview.repos) {
      console.log(`  ${r.name}: ${r.commits.length} commits × ${r.branches.length} branches = ${r.total} ops`);
    }
    console.log(chalk.dim('  Total: ') + preview.total + ' operations');
    
    // Show warnings
    if (preview.warnings.length > 0) {
      console.log(chalk.yellow('\nWarnings:'));
      for (const w of preview.warnings) {
        console.log(chalk.yellow(`  ⚠️ ${w}`));
      }
    }
    console.log();
    
    if (options.dryRun) return;
    
    const { proceed } = await inquirer.prompt([
      { type: 'confirm', name: 'proceed', message: 'Proceed?', default: true },
    ]);
    
    if (!proceed) return;
    
    const spinner = ora('Syncing...').start();
    
    syncManager.onProgress((p, s) => {
      spinner.text = `${s.repo}/${s.branch} (${p.completed}/${p.total})`;
    });
    
    const syncOptions: SyncOptions = {
      autoResolve: options.autoResolve,
      dryRun: options.dryRun,
      continueOnError: options.continueOnError,
      createBranch: options.createBranch,
      push: options.push,
    };
    
    const results = await syncManager.sync(syncOptions);
    
    spinner.stop();
    
    // Group results by repo
    const byRepo: Record<string, typeof results> = {};
    for (const r of results) {
      if (!byRepo[r.repo]) byRepo[r.repo] = [];
      byRepo[r.repo].push(r);
    }
    
    console.log(chalk.bold('\nResults by Repository:'));
    console.log('─'.repeat(50));
    
    let totalSuccess = 0;
    let totalResolved = 0;
    let totalConflicts = 0;
    let totalFailed = 0;
    
    for (const [repo, repoResults] of Object.entries(byRepo)) {
      const success = repoResults.filter((r) => r.status === 'success').length;
      const resolved = repoResults.filter((r) => r.status === 'resolved').length;
      const conflicts = repoResults.filter((r) => r.status === 'conflict').length;
      const failed = repoResults.filter((r) => r.status === 'failed').length;
      
      totalSuccess += success;
      totalResolved += resolved;
      totalConflicts += conflicts;
      totalFailed += failed;
      
      const statusIcon = failed > 0 ? '❌' : conflicts > 0 ? '⚠️' : '✅';
      console.log(`\n${statusIcon} ${chalk.bold(repo)} (${repoResults.length} ops)`);
      
      if (success > 0) console.log(chalk.green(`   ✅ Success: ${success}`));
      if (resolved > 0) console.log(chalk.cyan(`   🤖 AI-resolved: ${resolved}`));
      if (conflicts > 0) console.log(chalk.yellow(`   ⚠️ Unresolved: ${conflicts}`));
      if (failed > 0) {
        console.log(chalk.red(`   ❌ Failed: ${failed}`));
        // Show first failure reason
        const firstFailed = repoResults.find((r) => r.status === 'failed');
        if (firstFailed?.error) {
          console.log(chalk.red.dim(`      ${firstFailed.error}`));
        }
      }
    }
    
    // Summary
    console.log('\n' + '─'.repeat(50));
    console.log(chalk.bold('Summary:'));
    const totalOk = totalSuccess + totalResolved;
    const total = totalOk + totalConflicts + totalFailed;
    console.log(chalk.green(`  ✅ ${totalOk}/${total} successful`) + (totalResolved ? chalk.cyan(` (${totalResolved} AI-resolved)`) : ''));
    if (totalConflicts) console.log(chalk.yellow(`  ⚠️ ${totalConflicts} conflicts need manual resolution`));
    if (totalFailed) console.log(chalk.red(`  ❌ ${totalFailed} failed`));
  });

// --- Status Command ---
program
  .command('status')
  .description('Show status of all repos')
  .option('-p, --path <path>', 'Project path', '.')
  .action(async (options: { path: string }) => {
    const configManager = new ConfigManager(options.path);
    const config = configManager.load();
    
    if (!config) {
      console.error(chalk.red('Run `crossrepo init` first'));
      process.exit(1);
    }
    
    const syncManager = new SyncManager(config, configManager);
    const status = await syncManager.status();
    
    console.log(chalk.bold('\nStatus:'));
    for (const s of status) {
      const changes = s.hasChanges ? chalk.yellow(' (changes)') : '';
      const conflicts = s.conflicts.length ? chalk.red(` (${s.conflicts.length} conflicts)`) : '';
      console.log(`  ${s.repo}: ${s.branch}${changes}${conflicts}`);
    }
  });

// --- List Command ---
program
  .command('list')
  .description('List tracked repos')
  .option('-p, --path <path>', 'Project path', '.')
  .action(async (options: { path: string }) => {
    const configManager = new ConfigManager(options.path);
    const config = configManager.load();
    
    if (!config) {
      console.error(chalk.red('Run `crossrepo init` first'));
      process.exit(1);
    }
    
    console.log(chalk.bold('\nTracked Repos:'));
    for (const [name, repo] of Object.entries(config.repos)) {
      console.log(`  ${name}:`);
      console.log(`    Commits: ${repo.commits.join(', ') || '(none)'}`);
      console.log(`    Targets: ${repo.targetBranches.join(', ') || '(none)'}`);
    }
    
    if (config.ai) {
      console.log(chalk.bold('\nAI:'));
      console.log(`  Provider: ${config.ai.provider}`);
      console.log(`  Model: ${config.ai.model}`);
    }
  });

// --- Feature Command ---
const featureCmd = program
  .command('feature')
  .description('Manage feature configurations');

featureCmd
  .command('save <name>')
  .description('Save current configuration as a feature')
  .option('-p, --path <path>', 'Project path', '.')
  .option('-d, --description <desc>', 'Feature description')
  .action(async (name: string, options: { path: string; description: string }) => {
    const configManager = new ConfigManager(options.path);
    const config = configManager.load();
    
    if (!config) {
      console.error(chalk.red('Run `crossrepo init` first'));
      process.exit(1);
    }
    
    const featureConfig = configManager.toFeatureConfig(config);
    featureConfig.name = name;
    if (options.description) {
      featureConfig.description = options.description;
    }
    
    configManager.saveFeature(featureConfig);
    console.log(chalk.green(`✅ Feature "${name}" saved`));
    console.log(chalk.dim(`   ${Object.keys(config.repos).length} repos, ${featureConfig.repos[Object.keys(config.repos)[0]]?.commits.length || 0} commits`));
  });

featureCmd
  .command('load <name>')
  .description('Load a saved feature configuration')
  .option('-p, --path <path>', 'Project path', '.')
  .action(async (name: string, options: { path: string }) => {
    const configManager = new ConfigManager(options.path);
    const featureConfig = configManager.loadFeature(name);
    
    if (!featureConfig) {
      console.error(chalk.red(`Feature "${name}" not found`));
      process.exit(1);
    }
    
    // Convert to project config and save
    const config: any = {
      feature: featureConfig.name,
      ai: featureConfig.ai,
      repos: featureConfig.repos,
    };
    configManager.save(config);
    
    console.log(chalk.green(`✅ Feature "${name}" loaded`));
    console.log(chalk.dim(`   ${Object.keys(config.repos).length} repos`));
    
    if (featureConfig.description) {
      console.log(chalk.dim(`   ${featureConfig.description}`));
    }
  });

featureCmd
  .command('list')
  .description('List all saved features')
  .option('-p, --path <path>', 'Project path', '.')
  .action(async (options: { path: string }) => {
    const configManager = new ConfigManager(options.path);
    const features = configManager.listFeatures();
    
    if (features.length === 0) {
      console.log(chalk.dim('No saved features'));
      return;
    }
    
    console.log(chalk.bold('\nSaved Features:'));
    for (const name of features) {
      const feature = configManager.loadFeature(name);
      if (feature) {
        const repoCount = Object.keys(feature.repos).length;
        const commitCount = Object.values(feature.repos).reduce((sum, r) => sum + r.commits.length, 0);
        console.log(`  ${name}:`);
        console.log(chalk.dim(`    ${repoCount} repos, ${commitCount} commits`));
        if (feature.description) {
          console.log(chalk.dim(`    ${feature.description}`));
        }
      }
    }
  });

featureCmd
  .command('delete <name>')
  .description('Delete a saved feature')
  .option('-p, --path <path>', 'Project path', '.')
  .action(async (name: string, options: { path: string }) => {
    const configManager = new ConfigManager(options.path);
    const featureConfig = configManager.loadFeature(name);
    
    if (!featureConfig) {
      console.error(chalk.red(`Feature "${name}" not found`));
      process.exit(1);
    }
    
    const fs = require('fs');
    const path = require('path');
    const featurePath = path.join(options.path, '.crossrepo/features', `${name}.yaml`);
    fs.unlinkSync(featurePath);
    console.log(chalk.green(`✅ Feature "${name}" deleted`));
  });

program.parse();