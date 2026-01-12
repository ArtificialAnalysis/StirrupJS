# Skills

Skills are modular packages that extend agent capabilities with domain-specific instructions, scripts, and resources.
They provide a structured way to give agents expertise in specific areas (e.g. data analysis, report writing).

Learn more at [agentskills.io](https://agentskills.io/home).

## Overview

A skill is a directory containing:

- **`SKILL.md`**: Main instruction file with YAML frontmatter (`name`, `description`) and detailed guidance
- **`reference/`** (optional): Reference documentation split into focused markdown files
- **`scripts/`** (optional): Ready-to-use scripts the agent can run in the code execution environment

When skills are loaded, the agent receives:

1. A list of available skills in the system prompt
2. Access to skill files in the execution environment (uploaded under `skills/`)
3. Instructions on how to read and use the skills (`cat skills/<skill>/SKILL.md`)

## Quick Start

### 1. Create a Skills Directory

```
skills/
└── data_analysis/
    ├── SKILL.md
    ├── reference/
    │   ├── loading.md
    │   └── transformations.md
    └── scripts/
        ├── explore_data.py
        └── summary_stats.py
```

### 2. Create `SKILL.md` with Frontmatter

```markdown
---
name: data_analysis
description: High-performance data analysis - load, transform, aggregate, and visualize tabular data.
---
# Data Analysis Skill
Put your detailed instructions here.
```

### 3. Pass Skills to the Agent Session

```typescript
await using session = agent.session({
  skillsDir: 'skills',
  outputDir: './output',
});

await session.run('Analyze the data using the data_analysis skill');
```

## How Skills Work

When you specify `skillsDir` in `session()`:

1. **Discovery**: StirrupJS scans the directory for subdirectories containing `SKILL.md`
2. **Metadata extraction**: YAML frontmatter (`name`, `description`) is parsed from each `SKILL.md`
3. **System prompt**: Available skills are listed in the agent's system prompt
4. **File upload**: The skills directory contents are uploaded to the execution environment under `skills/`

The agent sees something like this in its system prompt:

```
## Available Skills

You have access to the following skills located in the `skills/` directory. Each skill contains a SKILL.md file with detailed instructions and potentially bundled scripts.

To use a skill:
1. Read the full instructions: `cat <skill_path>/SKILL.md`
2. Follow the instructions and use any bundled resources as described

- **data_analysis**: High-performance data analysis - load, transform, aggregate, and visualize tabular data. (`skills/data_analysis/SKILL.md`)
```

## Best Practices

1. **Keep skills focused**: Each skill should cover one domain well
2. **Provide working examples**: Include quick-start snippets that run immediately
3. **Include decision guidance**: Help the agent know when to apply the skill
4. **Bundle common scripts**: Save agent turns with ready-to-run utilities
5. **Use `reference/` for depth**: Keep `SKILL.md` scannable, put details in reference docs

## API Reference

### `session()` Parameter

```typescript
agent.session({
  skillsDir: 'skills',
  // ...
});
```





