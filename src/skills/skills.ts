/**
 * Skills loader for agent capabilities.
 *
 * Skills are modular packages that extend agent capabilities with instructions,
 * scripts, and resources. Each skill is a directory containing a SKILL.md file
 * with YAML frontmatter (name, description) and detailed instructions.
 *
 * Inspired by: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';

export interface SkillMetadata {
  /** Skill name (from frontmatter) */
  name: string;
  /** One-line description (from frontmatter) */
  description: string;
  /** Path within the execution environment (e.g. "skills/data_analysis") */
  path: string;
}

export function parseFrontmatter(markdown: string): Record<string, string> {
  // Match YAML frontmatter between --- markers at the start of the file
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const block = match[1] ?? '';
  const result: Record<string, string> = {};

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) result[key] = value;
  }

  return result;
}

export async function loadSkillsMetadata(skillsDir: string): Promise<SkillMetadata[]> {
  try {
    const skillsDirStat = await stat(skillsDir);
    if (!skillsDirStat.isDirectory()) return [];
  } catch {
    return [];
  }

  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skills: SkillMetadata[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillFolder = entry.name;
    const skillMdPath = join(skillsDir, skillFolder, 'SKILL.md');

    let markdown: string;
    try {
      markdown = await readFile(skillMdPath, 'utf-8');
    } catch {
      continue;
    }

    const fm = parseFrontmatter(markdown);
    const name = fm['name'];
    const description = fm['description'];
    if (!name || !description) continue;

    skills.push({
      name,
      description,
      path: `skills/${skillFolder}`,
    });
  }

  return skills;
}

export function formatSkillsSection(skills: SkillMetadata[]): string {
  if (skills.length === 0) return '';

  const lines: string[] = [
    '## Available Skills',
    '',
    'You have access to the following skills located in the `skills/` directory. Each skill contains a SKILL.md file with detailed instructions and potentially bundled scripts.',
    '',
    'To use a skill:',
    '1. Read the full instructions: `cat <skill_path>/SKILL.md`',
    '2. Follow the instructions and use any bundled resources as described',
    '',
  ];

  for (const skill of skills) {
    lines.push(`- **${skill.name}**: ${skill.description} (\`${skill.path}/SKILL.md\`)`);
  }

  return lines.join('\n');
}
