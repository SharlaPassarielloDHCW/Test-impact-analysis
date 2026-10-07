#!/usr/bin/env python3
import json
import os
import pathlib
import sys

workspace = pathlib.Path(os.environ['FACTORY_TEST_WORKSPACE'])
logfile = workspace / 'calls.jsonl'
number = len(logfile.read_text().splitlines()) if logfile.exists() else 0
call = {'agent': pathlib.Path(sys.argv[0]).name, 'args': sys.argv[1:], 'cwd': os.getcwd()}
with logfile.open('a') as log:
    log.write(json.dumps(call) + '\n')
(workspace / f'call-{number}.json').write_text(json.dumps(call))
behavior = json.loads((workspace / 'behavior.json').read_text())
plan = pathlib.Path('.factory/plan.md')
if behavior.get('prose_result'):
    print('I did some work, but have no structured result.')
    sys.exit(0)
if not plan.exists():
    plan.parent.mkdir(parents=True, exist_ok=True)
    plan.write_text('Next comes alpha, then beta.\n' if behavior.get('prose_plan') else '- [ ] alpha\n- [ ] beta\n')
    result = {'complete': False}
else:
    text = plan.read_text()
    if behavior.get('prose_plan'):
        task = next((name for name in ['alpha', 'beta'] if not pathlib.Path(name + '.txt').exists()), None)
    else:
        task = next((line[6:] for line in text.splitlines() if line.startswith('- [ ] ')), None)
    if task:
        pathlib.Path(behavior.get('file', task + '.txt')).write_text('work for ' + task + '\n')
        plan.write_text(('Finished ' + task + '.\n') if behavior.get('prose_plan') else text.replace('- [ ] ' + task, '- [x] ' + task, 1))
        result = {'complete': False, 'task': task}
    else:
        # Exercise a final plan update after the last work commit.
        if not text.endswith('\nAll work recorded.\n'):
            plan.write_text(text + '\nAll work recorded.\n')
        result = {'complete': True}
if behavior.get('talk'):
    print('{"complete": false}')
    print('nothing left to do')
print(json.dumps(result))
