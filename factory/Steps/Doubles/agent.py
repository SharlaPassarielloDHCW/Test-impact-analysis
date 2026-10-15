#!/usr/bin/env python3
"""Scenario-controlled machine double. It answers even without a result request."""
import json
import os
import pathlib
import re
import subprocess
import sys

workspace = pathlib.Path(os.environ['FACTORY_TEST_WORKSPACE'])
behavior = json.loads((workspace / 'behavior.json').read_text())
logfile = workspace / 'calls.jsonl'
calls = [json.loads(line) for line in logfile.read_text().splitlines()] if logfile.exists() else []
agent = pathlib.Path(sys.argv[0]).name
prompt = sys.argv[-1]
role = agent if agent != 'pi' else (re.search(r'Role: (planner|doer|validator)', prompt).group(1) if re.search(r'Role: (planner|doer|validator)', prompt) else 'unknown')
call = {'agent': agent, 'role': role, 'args': sys.argv[1:], 'cwd': os.getcwd()}
with logfile.open('a') as log:
    log.write(json.dumps(call) + '\n')
(workspace / f'call-{len(calls)}.json').write_text(json.dumps(call))
plan = pathlib.Path('.factory/plan.md')
prose = behavior.get('prose_plan', False)

def next_task():
    text = plan.read_text()
    if prose:
        return next((t for t in behavior['tasks'] if f'Finished {t}.' not in text), None)
    return next((line[6:] for line in text.splitlines() if line.startswith('- [ ] ')), None)

if role == 'planner':
    if not plan.exists():
        plan.parent.mkdir(parents=True, exist_ok=True)
        plan.write_text('Next comes alpha, then beta.\n' if prose else ''.join(f'- [ ] {t}\n' for t in behavior['tasks']))
    elif 'Record the committed task' in prompt and not behavior.get('planner_skips_update'):
        task = next_task()
        if task:
            product = pathlib.Path(behavior.get('file', task + '.txt'))
            relative = subprocess.check_output(['git', 'ls-files', '--full-name', str(product)], text=True).strip()
            committed = subprocess.check_output(['git', 'show', 'HEAD:' + relative], text=True)
            assert committed == product.read_text(), 'Planner called before work was committed'
            text = plan.read_text()
            plan.write_text(text + f'Finished {task}.\n' if prose else text.replace('- [ ] ' + task, '- [x] ' + task, 1))
    result = {'complete': next_task() is None or ('Record the committed task' in prompt and behavior.get('planner_skips_update', False))}
elif role == 'doer':
    task = next_task()
    assert task is not None
    pathlib.Path(behavior.get('file', task + '.txt')).write_text('work for ' + task + '\n')
    finding = behavior.get('finding', 'Separate game logic from terminal I/O')
    if finding in prompt and finding not in plan.read_text():
        text = plan.read_text()
        plan.write_text(text.replace('- [ ] ' + task, '- [ ] ' + task + '\n  - [x] ' + finding, 1))
    result = {'task': task}
elif role == 'validator':
    if behavior.get('prose_result'):
        print('The code looks good, but this is not JSON.')
        sys.exit(0)
    previous = sum(c['role'] == 'validator' and c['cwd'] == os.getcwd() for c in calls)
    satisfied = behavior['validation'] == 'always' or (behavior['validation'] == 'retry' and previous > 0)
    result = {'satisfied': satisfied, 'findings': [] if satisfied else [behavior.get('finding', 'Separate game logic from terminal I/O')]}
    if behavior.get('talk'):
        print('{"satisfied": false, "findings": ["outdated verdict"]}')
        print(behavior['talk'])
else:
    print('No machine role selected')
    sys.exit(1)
print(json.dumps(result))
