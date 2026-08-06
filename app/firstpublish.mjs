/**
 * Putting a project on GitHub when you have never done it before.
 *
 * The ordinary way to do this asks you for a dozen decisions you have no basis
 * for making, and then produces a page that says nothing about what you built.
 * This asks for one thing — what it should be called — and works the rest out
 * from the project itself.
 *
 * What it makes, and only if the project does not already have it:
 *
 *   README.md    what this is, what it is built with, how to run it — read out
 *                of the project's own files rather than invented
 *   .gitignore   so build output, dependencies and anything holding a key stay
 *                on your computer
 *
 * Two rules it will not break:
 *
 *   **Nothing you wrote is ever overwritten.** A file that exists is left
 *   exactly as it is, always, even if what is there is worse than what this
 *   would have written.
 *
 *   **A licence is never chosen for you.** What other people may do with your
 *   work is a decision with consequences outside this app, so it is offered and
 *   explained, never assumed.
 *
 * After the first time, none of this runs again — sending is just sending.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

/** What this project is built with, from the files that are always there. */
async function shapeOf(dir) {
  const has = (f) => existsSync(join(dir, f));
  const pkg = has('package.json')
    ? await quiet(async () => JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')))
    : null;

  if (pkg) {
    const scripts = pkg.scripts ?? {};
    return {
      kind: 'Node',
      about: pkg.description ?? null,
      install: 'npm install',
      run: scripts.dev ? 'npm run dev' : scripts.start ? 'npm start' : null,
      build: scripts.build ? 'npm run build' : null,
      test: scripts.test ? 'npm test' : null,
      needs: 'Node',
    };
  }
  if (has('pyproject.toml') || has('requirements.txt')) {
    return {
      kind: 'Python',
      about: null,
      install: has('requirements.txt') ? 'pip install -r requirements.txt' : 'pip install .',
      run: has('main.py') ? 'python main.py' : has('app.py') ? 'python app.py' : null,
      build: null,
      test: 'pytest',
      needs: 'Python',
    };
  }
  if (has('Cargo.toml')) {
    return { kind: 'Rust', about: null, install: null, run: 'cargo run', build: 'cargo build --release', test: 'cargo test', needs: 'Rust' };
  }
  if (has('go.mod')) {
    return { kind: 'Go', about: null, install: null, run: 'go run .', build: 'go build', test: 'go test ./...', needs: 'Go' };
  }
  if (has('index.html')) {
    return { kind: 'a website', about: null, install: null, run: 'Open index.html in a browser.', build: null, test: null, needs: null };
  }
  return { kind: null, about: null, install: null, run: null, build: null, test: null, needs: null };
}

/**
 * Anything the project already says about itself, borrowed rather than invented.
 *
 * A project with notes in it usually has the real description in the first
 * paragraph of one of them. Using that is both better writing than anything a
 * template produces and, more importantly, true.
 */
async function borrowedDescription(dir) {
  for (const name of ['DESCRIPTION.md', 'ABOUT.md', 'NOTES.md', 'STATUS.md', 'docs/README.md']) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    const text = await quiet(() => readFile(path, 'utf8'), '');
    for (const line of String(text ?? '').split('\n')) {
      const clean = line.replace(/^[#>*\-\s]+/, '').trim();
      if (clean.length > 40 && !clean.startsWith('[') && !clean.startsWith('!') && !clean.startsWith('|')) {
        return { from: name, text: clean.slice(0, 300) };
      }
    }
  }
  return null;
}

/** The page people land on. Written from the project, never about nothing. */
export async function readmeFor(dir, { name, description = null }) {
  const shape = await shapeOf(dir);
  const borrowed = description ? null : await borrowedDescription(dir);
  const says = description || shape.about || borrowed?.text || null;

  const out = [`# ${name}`, ''];
  if (says) out.push(says, '');
  else out.push(`${shape.kind ? `A ${shape.kind} project.` : 'A project.'} `
    + 'Replace this line with what it does — it is the first thing anybody reads.', '');

  const steps = [];
  if (shape.needs) steps.push(`You will need ${shape.needs} on your computer.`, '');
  if (shape.install) steps.push('```bash', shape.install, '```', '');
  if (shape.run) {
    steps.push('Then:', '');
    steps.push(shape.run.startsWith('Open') ? shape.run : `\`\`\`bash\n${shape.run}\n\`\`\``, '');
  }
  if (steps.length) out.push('## Getting it running', '', ...steps);

  if (shape.build || shape.test) {
    out.push('## Other things you can do', '');
    if (shape.build) out.push(`Build it: \`${shape.build}\``, '');
    if (shape.test) out.push(`Run the tests: \`${shape.test}\``, '');
  }

  out.push('## Where this came from', '');
  out.push(borrowed
    ? `There is more detail in [${borrowed.from}](${borrowed.from}).`
    : 'Notes and decisions live alongside the code in this project.');
  out.push('');

  return out.join('\n');
}

/** What should stay on your computer. */
export async function gitignoreFor(dir) {
  const shape = await shapeOf(dir);
  const lines = [
    '# Things that hold secrets. Never send these anywhere.',
    '.env',
    '.env.*',
    '*.pem',
    '*.key',
    '',
    '# Things this computer made and any computer can make again.',
  ];

  if (shape.kind === 'Node') lines.push('node_modules/', 'dist/', 'build/', '.next/', '*.tsbuildinfo');
  if (shape.kind === 'Python') lines.push('__pycache__/', '*.pyc', '.venv/', 'venv/', '.pytest_cache/');
  if (shape.kind === 'Rust') lines.push('target/');
  if (shape.kind === 'Go') lines.push('bin/');
  if (!shape.kind) lines.push('dist/', 'build/', 'out/');

  lines.push('', '# Things your computer leaves lying about.', '.DS_Store', 'Thumbs.db', '*.log', '');
  return lines.join('\n');
}

/** The licences worth offering, said in terms of what they let people do. */
export const LICENCES = [
  {
    id: 'none',
    name: 'Do not add one',
    blurb: 'Nobody may legally copy or use your work. This is what happens by default, and it is a fine choice for something private.',
  },
  {
    id: 'mit',
    name: 'MIT — anyone may use it',
    blurb: 'Anybody can use, change and sell it, as long as they keep your name on the notice. The usual choice for open work.',
  },
  {
    id: 'apache',
    name: 'Apache 2.0 — anyone may use it, with patent cover',
    blurb: 'Like MIT, and it also stops contributors suing users over patents. The usual choice for anything a company might touch.',
  },
];

function licenceText(which, who, year) {
  if (which === 'mit') {
    return `MIT License

Copyright (c) ${year} ${who}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
  }
  if (which === 'apache') {
    return `Copyright ${year} ${who}

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
`;
  }
  return null;
}

/**
 * Which of the usual pieces this project does not have yet.
 *
 * Asking must never be the same as doing. This looks and writes nothing, so the
 * page can say what would be made before anybody agrees to it.
 */
export function whatIsMissing(dir) {
  const there = (f) => existsSync(join(dir, f)) || existsSync(join(dir, f.toLowerCase()));
  const missing = [];
  if (!there('README.md') && !there('README')) missing.push('README.md');
  if (!existsSync(join(dir, '.gitignore'))) missing.push('.gitignore');
  return missing;
}

/**
 * Put the usual pieces in place, without touching anything you wrote.
 *
 * Returns what it made and what it left alone, so the sentence afterwards can
 * be true about both.
 */
export async function prepare(dir, { name, description = null, licence = 'none', who = null } = {}) {
  const made = [];
  const leftAlone = [];

  const put = async (file, text) => {
    if (existsSync(join(dir, file))) { leftAlone.push(file); return; }
    await writeFile(join(dir, file), text, 'utf8');
    made.push(file);
  };

  await put('README.md', await readmeFor(dir, { name: name || basename(dir), description }));
  await put('.gitignore', await gitignoreFor(dir));

  const text = licenceText(licence, who || name || basename(dir), new Date().getFullYear());
  if (text) await put('LICENSE', text);

  return { made, leftAlone };
}
