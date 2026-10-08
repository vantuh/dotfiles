import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import {
  loadInstalledSkill,
  promptSection,
} from '../extensions/ponytail/index.ts';

const instructions = promptSection('full', loadInstalledSkill());

export default function ponytailFull(pi: ExtensionAPI): void {
  pi.on('before_agent_start', (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${instructions}`,
  }));
}
