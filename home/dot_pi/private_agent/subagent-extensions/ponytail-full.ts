import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const requireFromExtension = createRequire(import.meta.url);

interface PonytailInstructionsModule {
  getPonytailInstructions(mode: string): string;
}

const ponytailInstructions = requireFromExtension(
  path.join(
    homedir(),
    '.pi/agent/git/github.com/DietrichGebert/ponytail/hooks/ponytail-instructions.js',
  ),
) as PonytailInstructionsModule;

const instructions = ponytailInstructions.getPonytailInstructions('full');

export default function ponytailFull(pi: ExtensionAPI): void {
  pi.on('before_agent_start', (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${instructions}`,
  }));
}
